# 09 — Test plan and acceptance

Legend: **PASS (auto)** = covered by `pnpm test` (120 tests). **PASS (browser)** = verified in
Chromium against the local fixture (`packages/core/test/fixtures/serve.mjs`). **DEVICE** = needs your
phone or laptop, because it needs a real Instagram session. **N/A** = surface does not exist yet.

## 0. Commands

```bash
pnpm install
pnpm build            # core → extension → web
pnpm test             # 120 core tests
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

## 3. Surfaces

| Surface | Status |
|---|---|
| iOS app, real device + iPhone SE size | DEVICE (typechecked only) |
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

## 5. Manual checklist for the ten things I cannot see

Run this logged in, on a phone and at 1440px, and send back answers (see `03-findings.md` §5 for why
each one matters). It takes about ten minutes:

1. Inbox URL shape after tapping a thread.
2. URL shape of a reel opened from a DM (`/reel/<code>/` vs `/reels/<code>/`).
3. Does swiping up in that reel change the URL?
4. Does the desktop sidebar use real `href` links for Explore/Reels?
5. Do `j`/`k` and the up/down chevrons work in the desktop reel modal?
6. Does the mobile-web "Use the app" banner have a close button?
7. Is `/accounts/activity/` still the notifications route after login?
8. Does the profile Reels tab open a grid or a single reel?
9. Does back from a profile ever land on the feed?
10. Do Stories open from the inbox tray (top row), and is that tap surface as endless as it looks?

## 6. Unit-test map

| File | Covers |
|---|---|
| `test/routes.test.ts` | every allow/block/conditional pattern, normalisation, tabs, id extraction |
| `test/guard.test.ts` | pushState, replaceState, popstate, clicks, pin arming, dispose |
| `test/reelLock.test.ts` | pin attribute, slide hiding, touch/wheel/key cancellation, loop, disarm |
| `test/cleanup.test.ts` | IG nav hidden, banners removed, blocked links hidden, stories gating, idempotence |
| `test/host.test.ts` | host-layer decisions incl. deep-link block and strict mode |
| `test/protocol.test.ts` | settings coercion, page/host message validation |
