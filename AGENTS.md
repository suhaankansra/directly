# AGENTS.md

Directly — a DM-only Instagram client. One set of route rules and one injected
in-page script are shared by a React Native app (iOS + Android) and a browser
extension. Keep the logic in `packages/core`; the apps are thin hosts.

## Layout

- `packages/core/src/routes.ts` — allow/block verdicts. Pure functions, no DOM.
- `packages/core/src/host.ts` — host-layer decision (layer 1 of 2).
- `packages/core/src/bridge.ts` — the page ⇄ host message protocol, with validation.
- `packages/core/src/inpage/**` — the script injected into the page at document start.
- `packages/core/src/styles/*.css` — CSS bundled as text and injected by us.
- `packages/core/src/selectors/{mobile,desktop}.json` — candidate selectors, ordered
  most-stable-first, overridable at runtime as *data* only.
- `apps/ios/` — Expo + React Native shell. `src/components/IgWebView.tsx` mounts the
  WebView; `src/lib/injectedScript.ts` is **generated**, never edit it.
- `apps/extension/` — MV3 extension.
- `.github/workflows/` — `android-apk.yml` (every push), `release.yml` (tag or manual
  dispatch → APK + IPA attached to the rolling `latest` prerelease).

## Invariants — do not break these

1. **Routes fail closed, cosmetics fail open.** A broken selector must leave the page
   ugly but usable; a broken route rule must keep blocked routes blocked.
2. **Never read message content, cookies, credentials or the account password.** Only
   the *name* of the signed-in account is read, from a profile link.
3. **Never depend on Instagram's obfuscated class names.** Order candidates
   href → aria-label → role → structural.
4. **Never hide the message surface.** Cleanup only hides a navigation container that
   contains a blocked route *and* holds no thread link, composer or text field. Same
   scoping in `hide-chrome.css` via `:has()` / `:not()`. Losing the inbox is the one
   failure this app must not have.
5. **The in-page script must survive `document_start`.** Android's WebView evaluates it
   before `<html>` exists, so anything that appends to the document must go through
   `whenRoot()` in `inpage/styles.ts`. This was a real bug: one throw there killed the
   whole bootstrap (no styles, no guard, no cleanup) on Android only.
6. **Validate every message.** `parsePageMessage` / `parseHostMessage` drop anything
   unknown, malformed or oversized. Never `eval` page data.

## Commands

```bash
pnpm --filter @directly/core test        # 130 tests, jsdom, no network
pnpm build:core                          # -> packages/core/dist/inpage.js
cd apps/ios && pnpm prebuild             # regenerate src/lib/injectedScript.ts
cd apps/ios && pnpm typecheck
```

**After any change under `packages/core/src/inpage/**` or `styles/**`, run
`pnpm build:core && cd apps/ios && pnpm prebuild`.** Otherwise the app keeps
injecting the previous script and your change appears to do nothing.

## Environment gotchas (this machine)

- Android builds need `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`.
  AVD name: `directly_test`. Debug build: `apps/ios/android && ./gradlew assembleDebug`.
- iOS: `pod install` needs `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`, or CocoaPods dies in
  Ruby 4.0's `unicode_normalize`. This Xcode has **no `Simulator.app`**, so `simctl`
  can boot/install/screenshot but there is no window to tap.
- Metro runs on 8081; an Android debug app needs `adb reverse tcp:8081 tcp:8081`.
- `normalizePath()` strips the trailing slash: `/direct/inbox/` becomes `/direct/inbox`.
  Message paths and tests use the stripped form.
- The release tag `latest` still points at an older commit while its assets are built
  from the newest — `gh release upload --clobber` does not move the tag.

## Open items

- **Verify DMs signed-in** on a real device (inbox, open thread, send, back). Everything
  else has been verified; this needs an authenticated session, which is why it is open.
- Move the `latest` tag to the current `main` commit so the pointer matches the binaries.
- The release IPA is unsigned; sideloading requires re-signing with the user's own team.
