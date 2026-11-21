# Phase 1 — five destinations, Stories and Focus controls

Date: 21 November 2026. **Implementation complete; device acceptance BLOCKED.**
This report covers Directly’s five-destination navigation and platform-native focus controls.
It does not claim that the native UI has been verified on physical hardware.

## Verdicts

| Feature | Verdict | Evidence and remaining limits |
|---|---|---|
| Chats, Stories, Activity, Profile, More | 🟡 Implemented | Native host and extension share the five tab identifiers; one WebView remains mounted. Native visual checks remain open. |
| Story discovery | 🟡 Limited to rendered links | At most 30 deduplicated handles from `/stories/` links, with no story media, captions, or message previews. Missing links produce an empty state. Real inbox/tray availability is unverified. |
| One-person stories | 🟡 URL boundary verified locally | Selected handle is enforced in shared routes, in-page history/click checks, and both hosts. Selection survives full loads. A viewer changing people without changing its URL is **not proven safe** and must be tested with Instagram before release. |
| Optional continuation | 🟡 Restricted to listed people | Off by default. When enabled, only handles from the story list captured at selection are permitted. Unknown people and aggregate/highlight paths remain blocked. This list does not independently prove follow status or that Instagram has no suggestions. |
| iOS glass | 🟡 Integrated, no device verdict | `expo-glass-effect ~58.0.5`, both runtime availability checks, live Reduce Transparency/Increase Contrast handling. Requires a native rebuild. |
| Older iOS / Android materials | 🟡 Implemented | Readable opaque fallback follows the newer native UI spec. Android gets a tonal navigation bar and a large-window rail. Native screenshots and Material fidelity remain unverified. |
| More / Focus controls | 🟡 Implemented | Fixed protections, shared-media/Stories switches, existing local alerts, account actions, diagnostics, help and privacy. Native-backed iOS page sheet; Android modal sheet with scrim, handle, system Back and Done. No draggable Android detents or predictive Back support are claimed. |
| Appearance and accessibility | 🟡 Implemented, needs device QA | Native-owned screens follow system light/dark appearance. Motion preferences, scalable text, labels, safe-area spacing and keyboard handling are wired. Instagram content retains its dark web theme. VoiceOver/TalkBack and very large text need device checks. |
| Optional ad/comment filters | Not added | No unverified filters, favorites, master protection switch, following feed, or multi-service hub. |

## What changed

- Completed story publication, explicit selection, selection clearing and full-load restoration. Native carries context in injection options; extension uses per-tab session storage, with an in-memory fallback. Worker suspension is covered by an offline integration check.
- Added native Stories and Focus screens and moved the previous Lock surface into More. Focus settings apply immediately; settings persistence failures are visible. The WebView stays mounted below native screens and is removed from accessibility navigation while covered.
- Added the iOS floating capsule with a sliding selection, Android tonal navigation/rail, and extension capsule/desktop rail with a matching selection. Native navigation disappears while the keyboard is shown, and conversation/story viewers reserve navigation space for their composer.
- Hardened blocked `replaceState` transitions to unload the blocked viewer; rewriting its address alone would leave the old viewer rendered. Removed the old bootstrap cookie-presence check. Session detection now uses page structure and a fail-closed fallback.
- Updated the extension popup with working settings only, dependent continuation state and save-error feedback. No new services, release, push or credential handling.

## Files changed

Shared core: `bridge.ts`, `index.ts`, `routes.ts`, `settings.ts`, and
`inpage/{index,guard,cleanup,navBar,stories,styles}.ts`.
Tests: `test/{routes,host,guard,stories}.test.ts` and `tools/test-phase1-extension.mjs`.
Extension: `src/{content,background}.ts`, `src/popup/{index.html,popup.ts}`.
Native: `App.tsx`, `app.json`, manifest/lockfile, theme, settings storage,
`components/{TabBar,Glass,IgWebView,LoadingSurface}.tsx`,
`screens/{LockScreen,FocusControls,StoriesScreen}.tsx`, and regenerated injection.
Documentation: this report, README and DECISIONS.

Private migration and source materials are outside the public release scope. They are not inputs to the application build.

## Validation

| Check | Result |
|---|---|
| Core tests | PASS: 205 tests across 12 files. Includes 18 new story tests. Existing jsdom navigation-not-implemented warnings remain in passing legacy tests. |
| Workspace TypeScript / web syntax | PASS |
| Native TypeScript against rebuilt core declarations | PASS |
| Core build and native injection regeneration | PASS |
| Chrome + Firefox extension builds | PASS |
| Website build | PASS |
| Built extension offline integration | PASS: worker restart, selection, continuation allowlist, SPA blocking, malformed data, exit clearing and concealed document-start handshake |
| iOS + Android Metro/Hermes production bundle export | PASS; JavaScript bundles only, not signed native binaries |
| Browser visual fixture | NOT RUN: computer-use browser host reported unavailable |
| Physical iPhone / Android, signed-in Instagram | NOT RUN |

**Blocking-layer regression: PASS locally.** Feed, Explore, endless Reels, unpinned
media and unselected stories remain blocked across settings combinations. The
existing reel-lock gesture/slide tests and message-surface cleanup tests pass.
This is not a claim about real Instagram markup or gestures on a phone.

## Reproduce locally

```sh
pnpm build:core
node apps/ios/scripts/gen-injection.mjs
pnpm --filter @directly/core test
pnpm typecheck
node node_modules/typescript/bin/tsc -p apps/ios/tsconfig.json
pnpm build:extension
node tools/test-phase1-extension.mjs
pnpm build:web
```

The `node` generation command is the same script as `pnpm --dir apps/ios prebuild`.
Direct invocation avoids the local pnpm package-store relink issue encountered
when running native scripts under the filesystem sandbox.

Native bundle checks, from `apps/ios`:

```sh
node node_modules/expo/bin/cli export --platform ios --output-dir /private/tmp/directly-phase1-ios --max-workers 2
node node_modules/expo/bin/cli export --platform android --output-dir /private/tmp/directly-phase1-android --max-workers 2
```

## Required device checks before calling the phase accepted

1. Rebuild the native app to include the glass module. On a signed-in device, verify inbox → thread → send → back, Activity, Profile, unread badge and a shared reel. Confirm that swiping to the next reel does nothing.
2. Open More → Focus controls. Confirm fixed Blocked rows, native switch appearance, immediate changes, Done, iOS swipe dismissal, Android Back and relaunch persistence. Return to the same conversation and composer.
3. Enable Stories. If no links are available, verify the empty state and try a profile that exposes a story link. Choose one person, traverse their story frames, then test automatic progression, next-person gestures, taps, browser history and full reloads. **Watch for a different person appearing while the URL stays unchanged.**
4. Turn continuation on: listed people may open; an unlisted person, highlights, Feed, Explore and the Reels tab must remain blocked. Turn Stories off during a viewer via More and verify return to the inbox.
5. Compare eligible iOS 26 glass, unavailable/older iOS fallback, Reduce Transparency, Increase Contrast and Reduce Motion. Check Android compact/large windows and large font sizes, light/dark/system appearance, VoiceOver and TalkBack. Confirm no last row or composer is covered.
6. Load `apps/extension/dist/chrome` or `dist/firefox`, inspect five destinations, settings, rings/empty state, selection after a full load and browser Back. Verify at phone width and desktop width. These are browser checks, separate from the offline integration test.

## Decisions and remaining questions

The newer native spec takes precedence on opaque fallback and on hiding unfinished
controls. No `expo-blur` was installed; only the previously approved glass package
was added. The Android sheet uses existing native-backed React Native primitives;
no new UI dependency was added or represented as a fully verified Material 3 sheet.

The signed-in tray and same-URL viewer boundary remain the release blockers. If
Instagram changes people without a detectable URL change, the URL guard is
insufficient; keep Stories off until a reliable boundary is implemented and tested.
Native sheet detents, predictive Back and exact platform visual fidelity remain
follow-up acceptance work, not demonstrated successes.

Next phase: onboarding only after the Phase 1 device checks and an explicit `next`.

## Platform source checked for this implementation

Expo's [GlassEffect documentation](https://docs.expo.dev/versions/v58.0.0/sdk/glass-effect/)
documents the iOS 26 component, availability checks and the separate Reduce
Transparency check. Package version was matched to this app's Expo SDK 58.
The native module's actual rendering still needs a device test.
