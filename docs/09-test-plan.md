# 09 — Test plan and acceptance

Legend: **PASS (auto)** = covered by `pnpm test` (167 tests). **PASS (browser)** = verified in
Chromium against the local fixture (`packages/core/test/fixtures/serve.mjs`). **DEVICE** = needs your
phone or laptop, because it needs a real Instagram session. **N/A** = surface does not exist yet.

## 0. Commands

```bash
pnpm install
pnpm build            # core → extension → web
pnpm test             # 167 core tests
pnpm typecheck        # core, extension, web
cd apps/ios && npm install && npx expo run:ios     # the iOS app
node packages/core/test/fixtures/serve.mjs         # fixture :4319
cd apps/web && pnpm build && pnpm serve            # site :4320
```

## 1. Allowed — must work

| # | Check | iOS | Safari+iOS ext | Chrome | Firefox | macOS Safari | Status |
|---|---|---|---|---|---|---|---|
| A1 | Launch → inbox directly (logged in) | — | — | — | — | — | DEVICE |
| A2 | Fresh install → login → 2FA/challenge → inbox | — | — | — | — | — | DEVICE |
| A3 | Open thread, send text / photo / voice / sticker / react | — | — | — | — | — | DEVICE |
| A4 | Compose icon → new chat → search contacts | — | — | — | — | — | DEVICE |
| A5 | Notes row visible and usable | — | — | — | — | — | DEVICE |
| A6 | Notifications tab loads; Follow Back works | — | — | — | — | — | DEVICE |
| A7 | Own profile and another user's profile load | — | — | — | — | — | DEVICE |
| A8 | Reel sent in DM: opens, plays, like/reply, back returns to thread | — | — | — | — | — | PASS (browser, fixture) for route + lock; media + reply DEVICE |
| A9 | Account switcher (▾) works or is cleanly hidden | — | — | — | — | — | DEVICE |
| A10 | Session survives app kill / phone restart | — | — | — | — | — | DEVICE |

## 2. Blocked — must fail gracefully

| # | Check | Status |
|---|---|---|
| B1 | `/` → redirected to inbox | PASS (auto + browser) |
| B2 | `/reels/` and every Reels entry point blocked | PASS (auto + browser) |
| B3 | `/explore/`, `/explore/tags/*`, search grid blocked | PASS (auto + browser) |
| B4 | In a reel opened from a DM, swipe up does nothing | PASS (auto: vertical touchmove cancelled; browser: slides hidden) |
| B5 | Profile Reels tab / grid video → single view only | PASS (auto: any non-pinned reel id blocked) |
| B6 | Links inside DMs to reels/explore blocked | PASS (auto + browser: anchor intercepted before navigation) |
| B7 | Browser back/forward cannot sneak into a blocked route | PASS (auto: `popstate` handler) |
| B8 | "Use the app" banner never visible | PASS (browser: `data-di-removed="app-banner"`) |
| B9 | Deep link to a single reel with no DM origin is blocked | PASS (auto: host decision; browser: cold load redirects) |
| B10 | Unknown route while logged in is blocked | PASS (auto) |
| B11 | Profile grid tile (`/<user>/p/<code>/`) opens one frozen item, not a browser | PASS (auto: tile shape parses to a single id; unpinned → blocked) |
| B12 | Stories archive (`/archive/stories/`) follows the Stories toggle instead of falling through as an unknown route | PASS (auto) |

## 3. Surfaces

| Surface | Status |
|---|---|
| iOS app, real device + iPhone SE size | DEVICE (typechecked only) |
| Loading surface — glass card with sheen sweep on iOS, Material surface + spinner on Android; one component, shown per load | DEVICE (typechecked only) |
| Android tab bar — solid tonal surface, active pill indicator, ripple, bold active label (no `Glass` blur: Android cannot sample a WebView) | DEVICE (typechecked only) |
| Unread DM badge on the DM tab + app-icon badge + local alert when the count rises away from the inbox | DEVICE (typechecked only; no push by design — D031, so nothing arrives while the app is closed) |
| Safari on iPhone with the extension enabled | DEVICE (needs the app build) |
| Chrome at 1440px and at ~800px | PASS (browser, fixture: 390 / 1440; 800 is the layout switch point, unit-tested via `detectLayout`) |
| Firefox desktop | DEVICE (build produced, not loaded) |
| Safari macOS | DEVICE (needs `safari-web-extension-converter`) |
| Website 375 / 768 / 1440 | PASS (375 and 1440 measured: no horizontal overflow, cards stack, nav collapses) |

## 4. Robustness

| # | Check | Status |
|---|---|---|
| R1 | Airplane mode → friendly screen, recovers | DEVICE |
| R2 | Rotate / small / large screen | DEVICE (layout detection unit-tested) |
| R3 | Simulate a broken selector → blocking still holds | PASS (auto: every cosmetic path is independent of the guard; `routeVerdict` has no selector input) |
| R4 | Malformed URL (`/%E0%A4%A`, `/%2e%2e/explore`) | PASS (auto) |
| R5 | Oversized / wrong-version bridge messages dropped | PASS (auto) |
| R6 | Extension storage unavailable | PASS (code falls back to defaults; not unit-tested — the wrapper is try/catch) |
| R7 | Redeem: blocked nav while a toast is showing | PASS (browser) |
| R8 | Boot overlay never holds the page hostage: it waits for real text, and after a 2.5 s deadline it goes anyway | PASS (code review; polling loop is bounded, untested) |
| R9 | Turning Stories back on after they were hidden restores the hidden chrome without a reload | PASS (auto: `restoreRemovals` reinstates the original inline `display`) |
| R10 | Notification permission refused → no alerts, everything else unchanged | PASS (code: every call is permission-gated and try/catch) |
| R11 | Unread count message cannot carry content: only an integer 0–999 survives validation | PASS (auto: `di:unread` drops strings, negatives, fractions and extra fields) |

## 5. Manual checklist for the things I cannot see

Run this logged in, on a phone and at 1440px. About fifteen minutes. The right-hand column is the
point: a bare “works” cannot change a selector, but a path or a pasted report can. `03-findings.md`
§5 has the reasoning behind the older ones.

| # | Do this | A complete answer contains |
|---|---|---|
| 1 | Tap a thread from the inbox. | The path after the tap — `/direct/t/<id>/`, `/direct/t/<id>`, or neither — and whether the DM tab stayed highlighted. |
| 2 | From that thread, tap a reel a friend sent. | Whether the path is `/reel/<code>/` or `/reels/<code>/`. |
| 3 | In that reel, swipe up once. | Whether a second reel appeared (it must not) and whether the path changed when you swiped. |
| 4 | On the desktop at 1440px, right-click Explore, then Reels in the sidebar. | For each: a copied link URL, or “no link, it is a button” — `href`-based hiding needs real links. |
| 5 | In the desktop reel modal, press `j`, then `k`, then tap the up and down chevrons. | Which of the four moved to another reel, and whether the path changed each time. |
| 6 | Open mobile web in Safari, outside the app. | Whether the “Use the app” banner has a close button or only an ✕ that returns, and whether that banner ever appeared inside Directly (it must not). |
| 7 | Tap the activity (heart) tab. | The path you land on — `/accounts/activity/` or something else. |
| 8 | Sit on the Profile tab and have someone DM you. | Whether the DM tab badge appeared and what number it showed, how many alerts arrived (one / several / none), and whether the number dropped after you opened and read the thread. |
| 9 | Turn Debug logging on, then open Lock. | The exact “Unread: …” line. “Nothing yet” means neither the DM link, its parent row, nor either one's `aria-label` carried a count, so `unread.ts` needs the real markup; `0` with a timestamp means the link was found and had no badge. |
| 10 | On that same card, tap **Copy diagnostics** and paste it into a note. | The pasted report verbatim — five lines: version, platform, signed-in handle, path, unread. Nothing about a message should appear. An empty paste means the clipboard module did not link. |
| 11 | Compare Directly's DM badge with the count Instagram itself draws next to its Messages icon, same account, in Safari. | Both numbers, or “Instagram shows none”. A number there and nothing in Directly means the count lives somewhere other than the link, its subtree or its parent row — that markup is the finding to send back. |
| 12 | Open your own profile, then its Reels tab. | Grid or single reel, and the path afterwards. |
| 13 | From a profile, press back twice. | Where each press lands. The feed is a bug, not a preference. |
| 14 | Open Stories from the inbox tray (top row). | Whether they open, and whether you can get out without the archive. |

Send the answers as text, with a screenshot of anything surprising; a Debug report on the Lock screen
covers items 9–11 in one paste. Item 11 is the one that decides whether the unread badge is a real
feature or a guess.

## 6. Unit-test map

| File | Covers |
|---|---|
| `test/routes.test.ts` | every allow/block/conditional pattern, normalisation, tabs, id extraction |
| `test/guard.test.ts` | pushState, replaceState, popstate, clicks, pin arming, dispose |
| `test/reelLock.test.ts` | pin attribute, slide hiding, touch/wheel/key cancellation, loop, disarm |
| `test/cleanup.test.ts` | IG nav hidden, banners removed, blocked links hidden, stories gating, idempotence |
| `test/host.test.ts` | host-layer decisions incl. deep-link block and strict mode |
| `test/protocol.test.ts` | settings coercion, page/host message validation |

## 7. Build log — checks run against downloaded artifacts

Rows in §1–§3 stay DEVICE until someone runs them on a phone. This table records the other half: what
was verifiable on the published files themselves, downloaded from the release rather than rebuilt
locally.

| Date | Build | Checked | Result |
|---|---|---|---|
| 2026-11-17 | `v0.1.0`, CI build from `26eb582` | APK signature (`apksigner verify --print-certs`) and manifest | PASS — v2 scheme, one signer, `CN=Android Debug` (sideloadable, not a Play upload key); `com.directly.app`, 0.1.0, versionCode 1, targetSdk 36 |
| 2026-11-17 | same | IPA is a device build and is unsigned, as advertised | PASS — `arm64` non-fat, 0.1.0, `com.directly.app`, no `embedded.mobileprovision`, `codesign` reports "code object is not signed at all" |
| 2026-11-17 | same | `tools/resign-ipa.sh` on that IPA, ad-hoc | PASS — nested frameworks signed deepest-first, each verified, then the repackaged IPA re-extracted and passed `codesign --verify --deep --strict`; entitlements and profile embedded |
| 2026-11-17 | same | signer refusals: wrong bundle id, expired profile, unlisted UDID, identity from another team | PASS — exit 1, each message naming the mismatch |
| 2026-11-17 | `v0.2.0`, CI build from `a21af6c` | the version bump reaches both artifacts | PASS — IPA 0.2.0 / build 2, APK versionName 0.2.0 / versionCode 2, both `com.directly.app`; APK still signed v2, IPA still `arm64` and unsigned |
| 2026-11-17 | `v0.2.1`, CI build from `08875f4` | versions, signatures, and that the app code actually shipped | PASS — APK 0.2.1 / versionCode 3, signed v2; IPA 0.2.1 / build 3, `arm64`, unsigned; `main.jsbundle` carries the easter-egg string, so the Lock-screen change is in the binary |
| 2026-11-17 | same | the version footer no longer lies | PASS (bundle) — `app.json` is bundled (`predictiveBackGestureEnabled` present) and `0.2.1` is in the Metro output; the hardcoded `0.1.0` is gone from the app source |
| 2026-11-17 | same | release body comes from the notes file | PASS — body byte-identical to `docs/releases/v0.2.1.md`; the job logged `notes: docs/releases/v0.2.1.md` |
| 2026-11-18 | `v1.3.0`, CI build from `34afd83` | versions, signature, and that the new UI actually shipped | PASS — APK 1.3.0 / versionCode 4, signed v2; IPA 1.3.0 / build 4, `arm64`, unsigned; the bundle carries the alerts copy, `Switch account`, and the embedded in-page script's `accountChevron` candidate and menu toast |
| 2026-11-18 | same | release body comes from the notes file | PASS — body equals `docs/releases/v1.3.0.md` apart from the trailing newline `gh` adds |
| 2026-11-18 | `v1.3.1`, CI build from `35be5d7` | versions, signature, and that both fixes actually shipped | PASS — APK 1.3.1 / versionCode 5, signed v2 (`CN=Android Debug`), minSdk 24, targetSdk 36; IPA 1.3.1 / build 5, `arm64`, unsigned; both JS bundles carry `di:open-profile`, the Facebook notice and the profile-link toast (the two notices only as UTF-16LE, because of their typographic apostrophes) |
| 2026-11-18 | same | the link policy is in the shipped bundle, not just the source | PASS — `l.instagram.com` is present in both bundles as an ASCII string, so the shim is classified rather than punted to Safari |
| 2026-11-18 | same | release body comes from the notes file | PASS — body equals `docs/releases/v1.3.1.md` apart from the trailing newline `gh` adds |
| 2026-11-18 | rolling `latest`, manual dispatch from `8ce20fd` | the rolling release serves the current build, and its tag names the commit it was built from | PASS — `refs/tags/latest` and the release's `target_commitish` both moved to `8ce20fd`; `directly-main.apk` is 1.3.1 / versionCode 5 and `directly-main-unsigned.ipa` is 1.3.1 / build 5, `arm64`, unsigned; both bundles carry the link-policy and open-profile strings. Note: the first dispatch lost its macOS runner with no log at all (job `cancelled`, empty runner name); the rerun of the failed jobs succeeded |
| — | — | Install on a physical iPhone and Android phone, then §1 and §5 | OPEN — needs the device and a signed-in Instagram session |
