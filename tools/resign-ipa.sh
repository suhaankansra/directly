#!/usr/bin/env bash
#
# Sign an unsigned iOS build with your own team, ready to install.
#
#   tools/resign-ipa.sh ~/Downloads/directly-main-unsigned.ipa \
#     --profile ~/Downloads/Directly.mobileprovision \
#     --device 00008110-000A1B2C3D4E5F60
#
# Takes either an .ipa (the release artifact) or an .app (what Xcode leaves in
# build/Build/Products/Release-iphoneos when built with CODE_SIGNING_ALLOWED=NO).
#
# Why this exists: the release is built with CODE_SIGNING_ALLOWED=NO (see
# docs/11-ship-prep.md §4), so iOS refuses it until it carries a signature from a
# team the phone trusts. Sideloadly and AltStore do the same job with a UI; this
# is for when you have your own profile and would rather not install anything.
#
# Every check here exists because its absence produces a failure that only shows
# up on the phone:
#
#   * nested code first (frameworks, dylibs, extensions), because a bundle
#     containing an unsigned binary fails as a whole with "not signed with a
#     valid certificate";
#   * entitlements from the profile, because an app signed without
#     application-identifier installs and then cannot launch;
#   * the bundle id checked against the profile's App ID, because a profile for a
#     different id installs into nothing and dies the same way;
#   * the profile's expiry checked, because a stale profile fails with a
#     signature error that looks like a signing bug;
#   * the device checked against the profile up front, because re-signing cannot
#     add a UDID — that phone needs registering and a fresh profile.
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
usage: tools/resign-ipa.sh <ipa|app> --profile <mobileprovision> [options]

  --profile <path>     provisioning profile (Development or Ad Hoc) that already
                       lists the target device. Required.
  --identity <name>    codesign identity, e.g. "Apple Development: You (TEAMID)".
                       Defaults to the first codesigning identity in the keychain.
  --device <udid>      check the UDID against the profile, and install the result
                       with devicectl once it is signed.
  --out <path>         where to write the signed IPA
                       (default: alongside the input, "...-signed.ipa").
  --keep               keep the working directory (contains the signed .app) so
                       it can be installed with ios-deploy or Xcode.
  --dry-run            resolve everything and print the signing plan, then stop.
  -h, --help           this text.
USAGE
  exit "${1:-2}"
}

die() {
  echo "resign-ipa: $*" >&2
  exit 1
}

note() {
  echo "resign-ipa: $*" >&2
}

INPUT=""
PROFILE=""
IDENTITY=""
DEVICE=""
OUT=""
DRY_RUN=0
KEEP=0

while [ $# -gt 0 ]; do
  case "$1" in
    --profile|--identity|--device|--out)
      [ $# -ge 2 ] || die "$1 needs a value"
      case "$1" in
        --profile) PROFILE="$2" ;;
        --identity) IDENTITY="$2" ;;
        --device) DEVICE="$2" ;;
        --out) OUT="$2" ;;
      esac
      shift 2
      ;;
    --dry-run) DRY_RUN=1; shift ;;
    --keep) KEEP=1; shift ;;
    -h|--help) usage 0 ;;
    -*) die "unknown option: $1 (try --help)" ;;
    *) [ -z "$INPUT" ] || die "one build at a time"; INPUT="$1"; shift ;;
  esac
done

[ -n "$INPUT" ] || usage 2
[ -e "$INPUT" ] || die "no such file: $INPUT"
[ -n "$PROFILE" ] || die "--profile is required (the .mobileprovision that lists the device)"
[ -f "$PROFILE" ] || die "no such profile: $PROFILE"
command -v codesign >/dev/null 2>&1 || die "codesign is missing; run this on macOS"
command -v security >/dev/null 2>&1 || die "security is missing; run this on macOS"

# macOS ships bash 3.2, so: no mapfile, no associative arrays, no ${var,,}.
GEN_DER=""
if codesign --help 2>&1 | grep -q -- '--generate-entitlement-der'; then
  GEN_DER="--generate-entitlement-der"
fi

WORK="$(mktemp -d)"
cleanup() {
  if [ "$KEEP" = "1" ]; then
    echo "kept      $WORK"
  else
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

DATA="$WORK/ipa"
mkdir -p "$DATA/Payload"
case "$INPUT" in
  *.ipa)
    unzip -q "$INPUT" -d "$DATA" || die "$INPUT is not a readable IPA"
    ;;
  *)
    [ -d "$INPUT" ] && [ -f "$INPUT/Info.plist" ] \
      || die "$INPUT is neither an .ipa nor an .app bundle"
    cp -R "$INPUT" "$DATA/Payload/" || die "could not copy $INPUT"
    ;;
esac

# The profile is CMS-signed; `security cms -D` is the supported way to read it.
security cms -D -i "$PROFILE" > "$WORK/profile.plist" 2>/dev/null \
  || die "cannot read $PROFILE — is it a .mobileprovision?"
plutil -extract Entitlements xml1 -o "$WORK/entitlements.plist" "$WORK/profile.plist" >/dev/null 2>&1 \
  || die "$PROFILE carries no Entitlements; is it a provisioning profile?"

PROFILE_NAME="$(plutil -extract Name raw -o - "$WORK/profile.plist" 2>/dev/null || echo unknown)"
TEAM="$(plutil -extract TeamIdentifier.0 raw -o - "$WORK/profile.plist" 2>/dev/null || echo unknown)"
EXPIRES="$(plutil -extract ExpirationDate raw -o - "$WORK/profile.plist" 2>/dev/null || echo unknown)"
PLATFORMS="$(plutil -extract Platform json -o - "$WORK/profile.plist" 2>/dev/null || true)"

# application-identifier is TEAMID.bundle.id; the part after the dot is the App
# ID, which may end in a wildcard.
APP_ID="$(plutil -extract Entitlements.application-identifier raw -o - "$WORK/profile.plist" 2>/dev/null || true)"
case "$APP_ID" in
  *.*) APP_ID_PATTERN="${APP_ID#*.}" ;;
  *) APP_ID_PATTERN="" ;;
esac

case "$PLATFORMS" in
  *[Ii]OS*|*[Tt]v[Oo][Ss]*|*[Vv]ision*) : ;;
  *) note "profile platforms are ${PLATFORMS:-unknown}; expected iOS" ;;
esac

case "$EXPIRES" in
  *T*)
    NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    if [[ "$EXPIRES" < "$NOW" ]]; then
      die "this profile expired on $EXPIRES.
  Download a fresh one from developer.apple.com → Certificates, Identifiers & Profiles."
    fi
    ;;
esac

matches_profile() {
  # 0 when bundle id $1 is the profile's App ID, or inside its wildcard.
  [ -n "$APP_ID_PATTERN" ] || return 0
  [ "$1" = "$APP_ID_PATTERN" ] && return 0
  case "$APP_ID_PATTERN" in
    *\*)
      case "$1" in
        "${APP_ID_PATTERN%\*}"*) return 0 ;;
      esac
      ;;
  esac
  return 1
}

# Pick the app, preferring the one the profile can actually sign.
APP=""
BUNDLE_ID=""
for candidate in "$DATA"/Payload/*.app; do
  [ -d "$candidate" ] || continue
  id="$(plutil -extract CFBundleIdentifier raw -o - "$candidate/Info.plist" 2>/dev/null || true)"
  if [ -z "$APP" ]; then
    APP="$candidate"
    BUNDLE_ID="$id"
  fi
  if matches_profile "$id"; then
    APP="$candidate"
    BUNDLE_ID="$id"
    break
  fi
done
[ -n "$APP" ] || die "no Payload/*.app in $INPUT"
[ -n "$BUNDLE_ID" ] || die "cannot read CFBundleIdentifier from $(basename "$APP")/Info.plist"

matches_profile "$BUNDLE_ID" || die "this profile signs ${APP_ID_PATTERN} but the app is ${BUNDLE_ID}.
  Signature and install would succeed and the app would die on launch.
  Pick the profile for this bundle id, or change \`ios.bundleIdentifier\` in app.json."

if [ -z "$IDENTITY" ]; then
  IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(.*\)".*/\1/p' | head -1 || true)"
fi
[ -n "$IDENTITY" ] || die "no codesigning identity found; pass --identity \"Apple Development: Your Name (TEAMID)\""

# A profile that lists devices cannot install anywhere else, and no amount of
# re-signing changes that — so say it here rather than after the app dies.
if [ -n "$DEVICE" ]; then
  DEVICES="$(plutil -extract ProvisionedDevices json -o - "$WORK/profile.plist" 2>/dev/null || true)"
  ALL_DEVICES="$(plutil -extract ProvisionsAllDevices raw -o - "$WORK/profile.plist" 2>/dev/null || true)"
  case "$ALL_DEVICES" in
    true|TRUE|True|1) : ;;
    *)
      case "$DEVICES" in
        *"$DEVICE"*) : ;;
        *) die "device $DEVICE is not in this profile's UDID list.
  Register it (Xcode → Window → Devices, or 'eas device:create' for an Ad Hoc build),
  download a fresh profile that includes it, and run this again." ;;
      esac
      ;;
  esac
fi

# Deepest first, by path length: a framework inside a framework has to be signed
# before its container, and an extension's frameworks before the extension.
NESTED="$(find "$APP" \( -name '*.framework' -o -name '*.dylib' -o -name '*.appex' -o -name '*.app' \) -print \
  | awk '{ print length, $0 }' | sort -rn | cut -d' ' -f2-)"

BASE="${INPUT%.ipa}"
case "$BASE" in
  *.app) BASE="${BASE%.app}" ;;
esac
case "$BASE" in
  *-unsigned) BASE="${BASE%-unsigned}" ;;
esac
[ -n "$OUT" ] || OUT="$BASE-signed.ipa"

echo "input       $INPUT"
echo "app         $(basename "$APP") ($BUNDLE_ID)"
echo "profile     $PROFILE_NAME (team ${TEAM}, signs ${APP_ID_PATTERN:-unknown}, expires ${EXPIRES})"
echo "identity    $IDENTITY"
if [ -n "$DEVICE" ]; then echo "device      $DEVICE"; fi
echo "signed to   $OUT"
if [ -n "$NESTED" ]; then
  echo "nested code"
  echo "$NESTED" | sed 's/^/  /'
fi
if [ "$IDENTITY" = "-" ]; then
  note "ad-hoc identity: the result verifies but will not install on a device"
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "dry run: nothing was signed"
  exit 0
fi

cp "$PROFILE" "$APP/embedded.mobileprovision"

# Extensions keep their own profile and entitlements: they are separate
# bundles with separate App IDs, so the app's entitlements would be wrong here.
if [ -n "$NESTED" ]; then
  echo "$NESTED" | while IFS= read -r item; do
    [ -n "$item" ] || continue
    case "$item" in
      *.appex)
        if [ -f "$item/embedded.mobileprovision" ]; then
          if security cms -D -i "$item/embedded.mobileprovision" > "$WORK/ext.plist" 2>/dev/null \
            && plutil -extract Entitlements xml1 -o "$WORK/ext-entitlements.plist" "$WORK/ext.plist" >/dev/null 2>&1; then
            codesign --force --sign "$IDENTITY" ${GEN_DER:+"$GEN_DER"} \
              --entitlements "$WORK/ext-entitlements.plist" "$item"
          else
            note "$(basename "$item"): cannot read its profile; signing it bare"
            codesign --force --sign "$IDENTITY" ${GEN_DER:+"$GEN_DER"} "$item"
          fi
        else
          note "$(basename "$item"): no embedded profile; signing it bare"
          codesign --force --sign "$IDENTITY" ${GEN_DER:+"$GEN_DER"} "$item"
        fi
        ;;
      *)
        codesign --force --sign "$IDENTITY" ${GEN_DER:+"$GEN_DER"} "$item"
        ;;
    esac
    codesign --verify --strict "$item" \
      || die "$(basename "$item") did not verify after signing — nested code was missed"
  done || exit 1
fi

codesign --force --sign "$IDENTITY" ${GEN_DER:+"$GEN_DER"} \
  --entitlements "$WORK/entitlements.plist" "$APP"
codesign --verify --deep --strict "$APP" || die "the app's signature does not verify"

# A signature without application-identifier is the silent failure: it installs,
# then iOS kills the process on launch.
SIGNED_ENTS="$(codesign -d --entitlements :- "$APP" 2>/dev/null || true)"
case "$SIGNED_ENTS" in
  *application-identifier*) : ;;
  *) die "the signed app carries no application-identifier entitlement — it would install and fail to launch" ;;
esac
# And if the profile grants get-task-allow but the signature drops it, the app
# still runs, but debugging the build you are about to test gets harder silently.
case "$SIGNED_ENTS" in
  *get-task-allow*) : ;;
  *)
    if plutil -extract Entitlements.get-task-allow raw -o - "$WORK/profile.plist" 2>/dev/null | grep -qi true; then
      note "the profile allows debugging but the signature has no get-task-allow"
    fi
    ;;
esac

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
( cd "$DATA" && zip -qry "$OUT" Payload ) || die "could not write $OUT"
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"

if [ -n "$DEVICE" ]; then
  if [ "$IDENTITY" = "-" ]; then
    die "ad-hoc signature: cannot install on $DEVICE"
  fi
  if xcrun devicectl --help >/dev/null 2>&1; then
    xcrun devicectl device install app --device "$DEVICE" "$APP"
    echo "installed on $DEVICE"
  else
    echo "devicectl is unavailable; install with: ios-deploy --bundle \"$APP\"" >&2
  fi
fi
