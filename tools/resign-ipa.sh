#!/usr/bin/env bash
#
# Re-sign the unsigned IPA from the rolling `latest` release, ready to install.
#
#   tools/resign-ipa.sh ~/Downloads/directly-main-unsigned.ipa \
#     --profile ~/Downloads/Directly.mobileprovision \
#     --device 00008110-000A1B2C3D4E5F60
#
# Why this exists: the release is built with CODE_SIGNING_ALLOWED=NO (see
# docs/11-ship-prep.md §4), so iOS refuses it until it carries a signature from a
# team the phone trusts. Sideloadly and AltStore do the same job with a UI; this
# is for when you have your own profile and would rather not install anything.
#
# Three things it does that a naive `codesign` does not, and the reason each is
# here — they are the failures that actually happen:
#
#   * nested code first (frameworks, dylibs, extensions), because a bundle
#     containing an unsigned binary fails as a whole with "not signed with a
#     valid certificate";
#   * entitlements taken from the profile, because an app signed without
#     application-identifier installs and then cannot launch;
#   * the device checked against the profile up front, because re-signing cannot
#     add a UDID — that phone needs registering and a fresh profile.
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
usage: tools/resign-ipa.sh <ipa> --profile <mobileprovision> [options]

  --profile <path>     provisioning profile (Development or Ad Hoc) that already
                       lists the target device. Required.
  --identity <name>    codesign identity, e.g. "Apple Development: You (TEAMID)".
                       Defaults to the first codesigning identity in the keychain.
  --device <udid>      check the UDID against the profile, and install the result
                       with devicectl once it is signed.
  --out <path>         where to write the signed IPA
                       (default: alongside the input, "...-signed.ipa").
  --dry-run            resolve everything and print the signing plan, then stop.
  -h, --help           this text.
USAGE
  exit "${1:-2}"
}

die() {
  echo "resign-ipa: $*" >&2
  exit 1
}

IPA=""
PROFILE=""
IDENTITY=""
DEVICE=""
OUT=""
DRY_RUN=0

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
    -h|--help) usage 0 ;;
    -*) die "unknown option: $1 (try --help)" ;;
    *) [ -z "$IPA" ] || die "one IPA at a time"; IPA="$1"; shift ;;
  esac
done

[ -n "$IPA" ] || usage 2
[ -f "$IPA" ] || die "no such IPA: $IPA"
[ -n "$PROFILE" ] || die "--profile is required (the .mobileprovision that lists the device)"
[ -f "$PROFILE" ] || die "no such profile: $PROFILE"
command -v codesign >/dev/null 2>&1 || die "codesign is missing; run this on macOS"

# macOS ships bash 3.2, so: no mapfile, no associative arrays, no ${var,,}.
GEN_DER=""
if codesign --help 2>&1 | grep -q -- '--generate-entitlement-der'; then
  GEN_DER="--generate-entitlement-der"
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

unzip -q "$IPA" -d "$WORK/ipa" || die "$IPA is not a readable IPA"
APP="$(ls -d "$WORK"/ipa/Payload/*.app 2>/dev/null | head -1 || true)"
[ -n "$APP" ] || die "no Payload/*.app inside $IPA"

# The profile is CMS-signed; `security cms -D` is the supported way to read it.
security cms -D -i "$PROFILE" > "$WORK/profile.plist" 2>/dev/null \
  || die "cannot read $PROFILE — is it a .mobileprovision?"
plutil -extract Entitlements xml1 -o "$WORK/entitlements.plist" "$WORK/profile.plist" >/dev/null 2>&1 \
  || die "$PROFILE carries no Entitlements; is it a provisioning profile?"

PROFILE_NAME="$(plutil -extract Name raw -o - "$WORK/profile.plist" 2>/dev/null || echo unknown)"
TEAM="$(plutil -extract TeamIdentifier.0 raw -o - "$WORK/profile.plist" 2>/dev/null || echo unknown)"
EXPIRES="$(plutil -extract ExpirationDate raw -o - "$WORK/profile.plist" 2>/dev/null || echo unknown)"

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
# before its container.
NESTED="$(find "$APP" \( -name '*.framework' -o -name '*.dylib' -o -name '*.appex' \) -print \
  | awk '{ print length, $0 }' | sort -rn | cut -d' ' -f2-)"

BASE="${IPA%.ipa}"
case "$BASE" in
  *-unsigned) BASE="${BASE%-unsigned}" ;;
esac
[ -n "$OUT" ] || OUT="$BASE-signed.ipa"

echo "IPA         $IPA"
echo "app         $(basename "$APP")"
echo "profile     $PROFILE_NAME (team ${TEAM}, expires ${EXPIRES})"
echo "identity    $IDENTITY"
if [ -n "$DEVICE" ]; then echo "device      $DEVICE"; fi
echo "signed to   $OUT"
if [ -n "$NESTED" ]; then
  echo "nested code"
  echo "$NESTED" | sed 's/^/  /'
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "dry run: nothing was signed"
  exit 0
fi

cp "$PROFILE" "$APP/embedded.mobileprovision"

# Extensions carry their own entitlements, which may differ from the app's, so
# they are signed bare and left to match the profile they were built against.
if [ -n "$NESTED" ]; then
  echo "$NESTED" | while IFS= read -r item; do
    [ -n "$item" ] || continue
    codesign --force --sign "$IDENTITY" ${GEN_DER:+"$GEN_DER"} "$item"
  done
fi

codesign --force --sign "$IDENTITY" ${GEN_DER:+"$GEN_DER"} \
  --entitlements "$WORK/entitlements.plist" "$APP"
codesign --verify --deep --strict "$APP" || die "signature does not verify"

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
( cd "$WORK/ipa" && zip -qry "$OUT" Payload )
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"

if [ -n "$DEVICE" ]; then
  if xcrun devicectl --help >/dev/null 2>&1; then
    xcrun devicectl device install app --device "$DEVICE" "$APP"
    echo "installed on $DEVICE"
  else
    echo "devicectl is unavailable; install with: ios-deploy --bundle \"$APP\"" >&2
  fi
fi
