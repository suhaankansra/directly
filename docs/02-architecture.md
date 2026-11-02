# 02 — Architecture: how Directly works, and why this shape

**Phase:** 2 of 11 · **Status:** complete (design decisions made, one risk explicitly unresolved) · **Date:** 2026-11-01
**Depends on:** [01-teardown.md](01-teardown.md) · **Verified facts:** marked ✅ with source; everything else is marked ⚠️ and belongs to Phase 3.

---

## 0. What this document decides

1. The iOS app is a **thin native shell around Instagram's mobile web** in a WKWebView — not a native reimplementation, not an API client.
2. The web version is a **browser extension that runs on instagram.com**, plus a marketing/help site that never displays Instagram.
3. Shared logic lives in **`packages/core`**, platform-agnostic, with two hosts: a WebView injector and a content script.
4. Every blocked surface is enforced **twice** (native/extension navigation hook + in-page SPA patch), and blocked surfaces **fail closed** while cosmetic hiding **fails open**.
5. The padlock tab is **settings + focus lock**, recommended; three options given in §10.

---

## 1. Evidence

### 1.1 From the video teardown (Phase 1)

| Clue | What it rules in | What it rules out |
|---|---|---|
| "Use the app" banner with ✕ (§1.6, F30) | Instagram's **mobile-web** app-install prompt is being rendered | A native messaging UI; the native iOS Instagram app |
| DM inbox and notifications are byte-for-byte IG web layouts (F13, F27) | The page is `www.instagram.com` itself, restyled | A custom client drawing its own message list |
| Purple outgoing bubbles, deleted bottom nav (F5, F7) | Styling is **injected over** someone else's DOM | A settings switch, a themed build of IG |
| Reels screen crosses out with a red ✕ (§1.8) | Blocking is **navigation-level**, not just cosmetic | Hiding buttons alone (a route reachable by URL would still work) |
| Swipe-up on a reel does nothing (F25) | Gesture **and** route are both being contained | A single CSS hide |

### 1.2 Verified ecosystem facts

| # | Fact | Status | Source |
|---|---|---|---|
| E1 | `instagram.com` sends **`X-Frame-Options: DENY`** on `/`, `/accounts/login/` and `/oauth/authorize/`; its CSP has **no `frame-ancestors`** | ✅ verified 2026-11-01 | securityheaders.com scans of instagram.com |
| E2 | Therefore **no website can iframe Instagram** — the frame renders blank and stays cross-origin | ✅ follows from E1 | — |
| E3 | **Safari on iOS supports Safari Web Extensions**, which must ship **inside a containing app** and be enabled by the user in Settings → Apps → Safari → Extensions | ✅ | Apple WWDC26 session 216; Apple iPhone User Guide |
| E4 | Since WWDC26, developing/testing a Safari web extension no longer requires Xcode: Settings → Advanced → "Show features for web developers" allows loading an unsigned extension folder | ✅ | WWDC26 session 216 |
| E5 | **Firefox for Android** supports extensions, but in practice **only from AMO** (or a temporary `web-ext run` install over USB debugging) — no durable sideload for normal users | ✅ | Mozilla addons blog (2023-11-28, launch 2023-12-14); stefanvd.net (2026-01-12) |
| E6 | **Kiwi Browser is discontinued** (archived Jan 2025, removed from Play); Edge for Android supports extensions only from a Microsoft-curated set; Yandex supports unpacked; Samsung Internet does not; **Chrome for Android has no extension support** | ✅ | browsernative.com (2025-01-27); Microsoft Q&A; Yandex support docs; Samsung support |
| E7 | Chrome Web Store policy: "Remotely hosted code … does not include **data or things like JSON or CSS**"; "Configuration-driven features" are an explicitly sanctioned pattern; building an **interpreter for remote commands is a rejection reason** | ✅ | developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code; …/improve-security; …/webstore/troubleshooting |
| E8 | Instagram **may** challenge or restrict logins from embedded WebViews. I could **not** find current, authoritative evidence either way | ⚠️ **unresolved — R1 below** | searches returned no credible 2026 source |

E8 is the only claim in this document that could sink the iOS design, and I am not going to paper over it. **Phase 3's first task is a 20-minute spike: log in inside a bare WKWebView on your iPhone.** Nothing in Phase 4–5 should be built before that passes.

---

## 2. Seven candidate architectures, and why six lost

| # | Candidate | Verdict | Reasoning |
|---|---|---|---|
| A1 | **Website that iframes instagram.com** | ❌ impossible | E1/E2. `X-Frame-Options: DENY` is universal in current browsers; there is no "detect and fall back" because the child frame is cross-origin and blank. Also: even if it loaded, same-origin policy means our page could not inject CSS or read the URL. |
| A2 | **Proxy Instagram through our server**, rewrite the HTML, serve it from our domain | ❌ prohibited by the brief, and correctly so | To render someone's inbox the proxy must hold their session cookie, which means a server we operate can read every message. The brief forbids handling credentials, and it would be a permanent security liability. Rejected on principle, not technical grounds. |
| A3 | **Client for Instagram's private/unofficial API** (e.g. an `instagram-private-api`-style library) | ❌ prohibited, and fragile | Brief rule 3: no private APIs, no scraping, no automation. Beyond that: unofficial clients break on every IG change, get accounts flagged, and would require us to hold the password. |
| A4 | **Official Meta APIs** (Instagram Graph / Basic Display / Messaging) | ❌ doesn't do the job | Business/creator accounts only, requires app review, and no consumer DM inbox. There is no official API for "read my personal DMs and let me reply" for a consumer app. |
| A5 | **JS bookmarklet / userscript** (Tampermonkey) | ⚠️ works, rejected as the product | Technically identical to our core, and it would need zero store review — but it cannot be an App Store app, cannot be sold or supported, and on iOS requires an app that can run userscripts anyway. Kept as an internal debug harness only. |
| A6 | **iOS Safari content blocker** (declarative rules) | ❌ insufficient alone | Content blockers can hide elements and block URLs, but they cannot patch `history.pushState`, cannot cancel a `touchmove`, and cannot keep one reel alive while killing the next. Fine as a supplementary defence; cannot be the product. |
| A7 | **Native shell around Instagram mobile web in a WebView** | ✅ **selected for iOS** | It is the only lawful way to show a *logged-in* Instagram without us ever touching credentials: the user types their password into Instagram's own page, inside a WebKit cookie jar that we never read. It also matches every clue in §1.1. |
| A8 | **Browser extension on instagram.com** | ✅ **selected for web** | Runs on the real origin, so no framing and no proxy: same cookies as the user's own browser session, and full DOM access to apply the same blocking. E1 makes it the *only* legal web route. |

So: **A7 for iPhone, A8 for phone/desktop web, sharing one core.** That is also why the iOS app can ship the Safari extension inside it (E3): one App Store download gives the DMs-only app and DMs-only Instagram in Safari.

---

## 3. Component diagram

```
                         ┌──────────────────────────────────────────────┐
                         │              packages/core                   │
                         │   (pure TS + CSS + JSON, no platform code)   │
                         │                                              │
                         │  routes.ts        allow/block/conditional    │
                         │  selectors.*.json stable DOM hooks           │
                         │  styles.css       theme + hide rules         │
                         │  routeGuard.ts    pushState/popstate patch   │
                         │  reelLock.ts      gesture + nav freeze       │
                         │  cleanup.ts       banners, IG nav, upsells   │
                         │  navBar.ts        our 4 items (web only)     │
                         │  settings.ts      schema, defaults, merge    │
                         └───────┬───────────────────────┬──────────────┘
                                 │ imported as a bundle  │
                 ┌───────────────v───────┐       ┌───────v─────────────────┐
                 │      apps/ios         │       │      apps/extension     │
                 │  Expo + TS            │       │  MV3 content script     │
                 │                       │       │                         │
                 │  IgWebView.tsx  ──────┼──┐    │  content.ts             │
                 │    WKWebView          │  │    │   injects core at       │
                 │    one instance,      │  │    │   document_start        │
                 │    shared cookies     │  │    │                         │
                 │                       │  │    │  background.ts          │
                 │  TabBar.tsx (native)  │  │    │   none needed v1        │
                 │  bridge.ts            │  │    │                         │
                 │   page ⇄ native       │  │    │  popup/  settings UI    │
                 └───────┬───────────────┘  │    └───────┬─────────────────┘
                         │                  │            │
                         │ injects via       │            │ runs on the real
                         │ injectedJavaScript│            │ origin
                         v                  │            v
        ┌────────────────────────────────┐  │   ┌─────────────────────────────┐
        │  www.instagram.com (mobile web)│◄─┘   │ www.instagram.com (desktop  │
        │  real IG session, real cookies │      │ or mobile layout)           │
        │  our CSS + JS applied on top   │      │ our CSS + JS + nav bar      │
        └────────────────────────────────┘      └─────────────────────────────┘
                         ▲                                     ▲
                         │ user logs in here, by hand          │ user's own browser
                         │ (we never see the password)         │ session
                         │                                     │
                 ┌───────┴───────────────┐             ┌───────┴──────────────┐
                 │  apps/web (static)    │             │ chrome.storage.local │
                 │  landing / install /  │             │  settings mirror     │
                 │  help / privacy       │             └──────────────────────┘
                 │  never shows IG       │
                 └───────────────────────┘
```

**Repo layout** (Phase 4 scaffolds this):

```
packages/core/          src/routes.ts, routeGuard.ts, reelLock.ts, cleanup.ts,
                        navBar.ts, settings.ts, selectors/{mobile,desktop}.json,
                        styles/{theme,layout}.css, test/routes.test.ts
apps/ios/               app/, components/IgWebView.tsx, components/TabBar.tsx,
                        lib/bridge.ts, lib/inject.ts
apps/extension/         src/content.ts, src/popup/, manifest.{chrome,firefox}.json
apps/web/               landing + help + privacy, static build
docs/                   01…11 phase documents
```

---

## 4. Route model

### 4.1 Matching semantics (decided now, implemented in Phase 6)

- Match on `pathname` only. **Drop** `?query` and `#hash` before matching (IG puts state in both; a query string must never be able to smuggle a blocked route).
- Strip trailing slash and lowercase, **except** for username paths, which are case-insensitive but preserved for display.
- Decode percent-escapes **once** before matching, so `/%65xplore/` cannot slip through.
- Collapse duplicate slashes and resolve `..` segments.
- Rules are ordered: `block` beats `conditional` beats `allow`. Unknown path → **block** while a session is present, **allow** while logged out (login flows must never be trapped).
- Username paths (`/<username>/`) are matched **after** a reserved-word list (`direct, accounts, explore, reels, reel, p, stories, about, legal, developer, api, session, web, challenge, emaillogin, oauth, privacy, terms, help, directory, your_activity, settings`) so `/direct/inbox/` can never be mistaken for the profile of a user named "direct".

### 4.2 The table

| Path pattern | Verdict | Watch out for |
|---|---|---|
| `/direct/inbox/` | **allow** — canonical home | |
| `/direct/t/<thread_id>/` | **allow** | thread ids are opaque; do not validate beyond non-empty |
| `/direct/new/` | **allow** | compose / contact search lives here |
| `/direct/requests/` | **allow** | message requests are still DMs |
| `/accounts/activity/` | **allow** | verify this is still the notifications route in Phase 3 |
| `/accounts/login/`, `/accounts/login/two_factor/`, `/challenge/`, `/accounts/suspended/`, `/accounts/password/reset/` | **allow** | needed for first run; the loosest part of the table |
| `/accounts/emailsignup/`, `/emailsignup/` | **block** | no account creation from inside our app |
| `/accounts/edit/`, `/accounts/privacy_and_security/` | **allow** | reachable from your own profile; blocking it reads as broken |
| `/<username>/` | **allow** | reserved-word guard above; also allow `/explorer/…`? no — see below |
| `/<username>/reels/`, `/<username>/tagged/` | **allow**, grids frozen | see §4.3 — recommendation, flagged |
| `/` | **block** → inbox | the home feed |
| `/reels/`, `/reels/audio/<id>/`, `/reels/<any>` | **block** | the Reels tab and audio pages |
| `/explore/`, `/explore/tags/<t>/`, `/explore/locations/<l>/`, `/explore/search/` | **block** | the discovery grid |
| `/reel/<id>/` | **conditional** | allowed only if a reel was opened from a DM/profile tap **and** `<id>` equals the pinned id; any other id → block |
| `/p/<id>/` | **conditional** | same rule, single post |
| `/stories/<username>/<story_id>/`, `/stories/highlights/<id>/` | **block** by default | settings toggle can allow; a story session is the endless-tap surface the product exists to remove |
| `/legal/…`, `/privacy/…`, `/about/…` | **allow** | needed to read the privacy policy IG links to |
| `/<anything else>` | **block** → inbox | fail closed |

### 4.3 Two profile-grid options (needs your call — Q3 in Phase 1)

- **Option A (recommended): allow the profile page and let its grid scroll**, but a tap on a tile opens **one** item, frozen. Rationale: you looked this person up on purpose — that is intent, not algorithmic discovery — and cancelling scroll inside a virtualised grid produces a janky, obviously-broken page.
- **Option B: block `/<username>/reels/` and `/<username>/tagged/`, and freeze the main grid.** Consistent with "no grids", but the freeze is visibly broken and costs real implementation complexity in the reel lock.

I recommend A on honesty grounds: a half-frozen grid looks like a bug, and a bug is worse for retention than a profile you deliberately visited.

### 4.4 Redirect target

Blocked → **`/direct/inbox/`**, not an interstitial. Reason: the inbox is the product's home, an interstitial is a speed bump on every mistap, and "not here 🙂" screens read as a broken app to a normal user. We do show a **short toast** ("Directly — that's not here") once per navigation, so the user learns why the jump happened. Same behaviour on both platforms.

---

## 5. Route guard: two layers, one message protocol

```
        ┌──────────────────── LAYER 1 (host) ────────────────────┐
        │ iOS: WKWebView onShouldStartLoadWithRequest            │
        │ Ext: webNavigation.onBeforeNavigate + tabs.update      │
        │  sees only FULL document loads                          │
        └───────────────────────────┬─────────────────────────────┘
                                    │ allows / cancels
        ┌───────────────────────────v─────────────────────────────┐
        │  LAYER 2 (in-page, core) — where 99% of navigation dies  │
        │  patch history.pushState / replaceState                  │
        │  listen popstate                                         │
        │  listen click (capture) for <a href> to blocked paths     │
        │  every URL change → postMessage({type:'di:url', ...})     │
        └───────────────────────────┬─────────────────────────────┘
                                    │
                     blocked?  yes ─┴─> history.replaceState('/direct/inbox/')
                                        + toast + native/ext UI sync
```

- **Why both:** Instagram is a single-page app. Most navigation never triggers a document load, so the host hook alone is useless; and a page-level patch alone can be bypassed by a full load from an external link. Neither layer is sufficient.
- **Message protocol** (`lib/bridge.ts` ↔ `core`):
  - page → host: `{v:1, type:'di:url', path, layout:'mobile'|'desktop', pinId?:string}`; `{type:'di:blocked', path, reason, selector?}`; `{type:'di:reel_open'| 'di:reel_closed', id}`.
  - host → page: `{type:'di:settings', settings}`, `{type:'di:navigate', path}`, `{type:'di:pin', id|null}`, `{type:'di:logout'}`.
  - Every message is validated: `v === 1`, a known `type`, `path` must start with `/`, length caps. On iOS the handler checks `message.securityOrigin`-equivalent (WKWebView `window.origin` is not exposed; we gate on the WebView's current `URL` host being `instagram.com`); in the extension, `event.source === window` and `event.origin === location.origin`. Unknown messages are dropped, never `eval`'d, never forwarded.
- **Native tab sync:** the tab bar highlights from the **reported URL**, not the last tap, so a back-swipe or a deep link updates the UI (Phase 5A §3).

---

## 6. Injection plan

### 6.1 CSS (bundled, static, one file per concern)

| File | Job | Notes |
|---|---|---|
| `styles/theme.css` | force dark surfaces, map IG's blue tokens to `#6C5CE7` | use CSS custom properties on `:root` where IG exposes them, attribute/`href`-based fallbacks elsewhere |
| `styles/hide-chrome.css` | hide IG bottom nav, desktop left sidebar, create button, Reels/Explore links, app-install upsells, "Use the app" banner, login upsells | keyed off stable hooks (§8) |
| `styles/blocked.css` | hide reel siblings, search panel grid, explore grid, stories rail | |
| `styles/skeleton.css` | dark loading skeleton (iOS: also a native loading view behind the WebView) | prevents the white flash |
| `styles/navbar.css` | our 4-item bar (web only) | native tab bar on iOS |

All rules are written with `:where()`/low specificity so IG's own styles win in a fight we don't need to win, and every hide rule is paired with a `[data-di-off]` escape hatch for debugging.

### 6.2 JS modules, in boot order

1. `settings.ts` — merge remote/bundled defaults with host-provided settings; no I/O on iOS.
2. `routeGuard.ts` — install patches **before** IG's own scripts run (`document_start`) so we wrap `pushState` before IG captures a reference to it.
3. `reelLock.ts` — arms on reel entry, disarms on exit; owns the pin.
4. `cleanup.ts` — removes banners/upsells; MutationObserver with `requestIdleCallback` batching and a 150 ms trailing debounce.
5. `navBar.ts` — web only; injected HTML bar, mirrors the native bar, posts `di:navigate`.
6. `observer.ts` — one shared `MutationObserver` for all of the above, sub-tree, throttled, re-armed on route change; never observes `attributes` globally (too hot).

### 6.3 Lifecycle

`document_start` → read settings → inject CSS → install route guard → initial route check → mount observer → arm per-surface modules. On every `di:url` change: re-check route, re-run cleanup, re-arm or disarm reel lock, re-sync nav highlight. **Re-run, never assume** — IG re-renders aggressively.

---

## 7. Reel lock

Goal: exactly one reel may play, the URL may not move to another reel, and the gesture that would take you there does nothing.

**Mobile web (iOS WebView + mobile browser extension)**

| Layer | Mechanism |
|---|---|
| Route | pin `reelId` on entry from a DM; guard rejects any `/reel/<other-id>/` and any `/p/<other-id>/`; `history.replaceState` back to the pinned URL |
| DOM | hide (not remove) non-active slides in the reel container: `display:none` on siblings keeps them muted, prevents scroll-snap targets, and survives IG re-renders better than deletion |
| Gesture | capture-phase `touchstart`/`touchmove` on the reel container, `{passive:false}`: if `abs(dy) > 12 && abs(dy) > abs(dx) * 1.5` → `preventDefault() + stopPropagation()`. Horizontal swipes pass through so carousels still work |
| Scroll | `overscroll-behavior: contain` on the scroller; `scroll-snap-type: none` on the reel container; if IG uses a scroll container, clamp `scrollTop` on `scroll` events (cheap, and the last line of defence if a future IG version ignores touch handlers) |
| Autoplay-next | listen for `ended` on the video; if IG advances, the URL check catches it and reverts |
| Instrumentation | `data-di-reel-locked="<id>"` on `<html>` so tests and Phase 9 checks can assert the state rather than eyeball it |

**Desktop (extension)**

| Vector | Mechanism |
|---|---|
| Up/down chevron buttons in the modal | hidden by `hide-chrome.css`; hook via `aria-label`/`role` |
| Arrow keys, `j`/`k`, `PageUp/PageDown`, space | capture keydown on `document` **only while a reel modal is open**, ignored when the event target is an input/textarea/contenteditable (you must still be able to type a reply) |
| Mouse wheel over the modal | `wheel` preventDefault unless the target is inside the comment scroller/caption |
| Reels page and Explore grid behind the modal | route guard blocks them; modal cannot be opened from a surface that doesn't exist |
| Post modal with multiple items | horizontal carousel untouched; vertical/next blocked |

**Edge cases owned by Phase 6 tests:** two reels in one DM thread (each pin independent), back-swipe while pinned (allowed → thread), deep link straight to `/reel/<id>` while no pin exists (block, even if a DM contains it), reel whose author's profile you tap from inside (profile allowed, back returns to the still-pinned reel), rotation and small screens.

---

## 8. Selectors and remote config

**Stable hooks, in priority order:** `href` → `aria-label` → `role` → `data-*` → `svg` path match → (last resort) structural `:nth-child`. Obfuscated class names are **never** used.

`selectors/mobile.json` and `selectors/desktop.json` are flat maps of **known keys to arrays of candidate selectors**, e.g.

```json
{ "version": 3, "layout": "mobile",
  "reelsTabLink":   ["a[href=\"/reels/\"]", "a[aria-label=\"Reels\"]"],
  "bottomNav":      ["nav[role=\"navigation\"]", "div[role=\"navigation\"]"],
  "installBanner":  ["div[role=\"dialog\"]:has(button[aria-label=\"Close\"])"],
  "reelContainer":  ["main div[role=\"presentation\"] article"],
  "storyRing":      ["a[href^=\"/stories/\"]"] }
```

Rules that keep this policy-safe (E7): the JSON may only contain **keys we shipped** and **selector strings** that go straight into `querySelectorAll`; no expression language, no templating, no conditionals, no code. A remote file that tries anything else is rejected by schema validation (unknown key → ignored, non-string → ignored, over 200 keys → ignored). CSS is **bundled only** — remote config can flip behaviour, never restyle.

**Remote config shape:** `{ version, updatedAt, minimumAppVersion, selectors:{mobile,desktop}, routeOverrides:[{pattern, verdict}] }`, fetched over HTTPS from a URL we control, cached, and used only when `version > bundledVersion` **and** it validates. Bundled fallback is always shipped; a fetch failure is silent. Route overrides are restricted to pattern+verdict (data), never executable logic.

---

## 9. Desktop specifics

1. **Sidebar replacement.** On desktop, IG's left sidebar is the tab bar. `hide-chrome.css` hides it; `navBar.ts` injects a fixed 56–64 px vertical rail with our four items (DMs, Notifications, Profile, Lock) plus our wordmark, keeping IG's content width by adjusting the page's own left padding. The Lock item opens our settings panel (a small shadow-DOM panel), not an IG route.
2. **Two-pane DMs.** `/direct/inbox/` on desktop is list + conversation. We keep it: our rail sits outside it, and the content pane keeps IG's own two-pane layout. On narrow desktop windows IG collapses to one pane; our rail stays and still works (Phase 9 tests 1440 px and ~800 px).
3. **Reels/Explore on desktop** are full pages and full-screen modals respectively: both blocked at the route level, so the modal has no launching surface. Search panel's suggested grid is hidden and its input disabled.
4. **Keyboard shortcuts that sneak in:** `g h` (home), `g e` (explore), `g r` (reels), `/` (search), `j`/`k` navigation, arrow keys in modals. Route guard catches the resulting navigation; the guard also swallows the shortcuts while focus is outside an editable field.
5. **Layout detection at runtime:** `matchMedia('(min-width: 768px)')` **plus** a DOM probe (presence of the desktop sidebar) — either alone misclassifies IG's responsive breakpoints. Detection re-runs on resize (debounced 250 ms) and swaps selector sets without reloading.

---

## 10. The fourth tab (padlock) — three options

| Option | What it does | Cost | Fit |
|---|---|---|---|
| **P1 — Settings + focus lock (recommended)** | Account row, Log out, strict mode (no reels from DMs at all), allow-stories toggle, a **lock timer** (e.g. "lock in 15 min" → at expiry, DMs stay but the app shows a calm full-screen "Done for now" card with an unlock-in-60-seconds escape hatch), privacy statement, version, "report a broken screen" | Medium: timer state + one native screen | Matches the padlock metaphor literally, gives the tab a reason to exist, and the timer is the retention hook the reference app hints at but never shows |
| **P2 — Settings + logout only** | Plain settings page | Low | Honest, minimal, but the icon promises more than it delivers |
| **P3 — Paywall** | Free: blocking. Paid: strict mode, stories toggle, timer | Medium + commerce | Monetisable, but a paywall behind a padlock in a screen-time app invites App Store scrutiny of the value proposition, and it is the least defensible of the three at launch |

**Recommendation: P1, shipped in two steps** — settings/logout first (Phase 8 minimum), timer second only if you want it. The timer is the only feature here that makes the padlock feel earned, and it is also the one that could be sold later without a paywall rewrite.

---

## 11. Permissions, privacy, and the things we never touch

**Extension manifest (Chrome/Edge/Brave/Arc, Firefox, Safari):**
`"host_permissions": ["https://www.instagram.com/*"]`, `"permissions": ["storage"]`, one content script at `document_start` scoped to that host, no `tabs`, no `webNavigation` (the in-page guard covers SPA navigation; `webNavigation` is only added if Phase 6 proves a gap), no `<all_urls>`, no `scripting` on other origins, no remote JS. Dev-only convenience builds may add `http://localhost/*` for the harness — release builds must not.

**What our code does not do, structurally:**
- Never reads `input[type=password]`, never touches `document.cookie`, never inspects `localStorage`/`IndexedDB` for tokens.
- Never sends message contents anywhere: there is no network call in `core` except the optional selector-config fetch, which sends no identifiers and no page data.
- No analytics on content; if we ever add telemetry it is counters only (`blocked_route_count`), local by default.
- Session persistence is **the platform's** job: WKWebView's own cookie store on iOS, the browser's own profile on web. Log out = clear the WebView's cookie store (`WKWebsiteDataStore` removal) or instruct the user to log out on IG.

**Message hardening:** strict shape validation, origin/source checks, no `eval`, no `new Function`, no remote code, no `innerHTML` for anything derived from the page (only our own static templates), and `instanceof` checks before touching nodes.

---

## 12. How settings reach the core

| Platform | Store | Reaches core via |
|---|---|---|
| iOS | AsyncStorage/MMKV (Phase 8) | `TabBar`/Lock screen → `IgWebView` → injected `window.__OO_SETTINGS__` + `di:settings` message on change; core reads it at boot and on every change |
| Extension | `chrome.storage.local` | content script reads at `document_start`, subscribes to `storage.onChanged`, re-applies live |
| Website | none (static) | n/a |

Same schema, same defaults, same validation on both (`settings.ts` exports `merge(defaults, partial)`), so a setting that exists on iOS exists in the popup and vice versa. Unknown keys are dropped; a corrupt store falls back to defaults rather than throwing.

---

## 13. Fail-safe semantics (the rule that keeps this shippable)

| Failure | Behaviour | Rationale |
|---|---|---|
| Unknown/renamed selector for a **blocked route's link** | route guard still blocks the path; the button may stay visible but is inert | **fail closed** — a stale selector must never open the feed |
| Unknown selector for **cosmetic** hiding (nav, banner, upsell) | nothing is hidden; app looks like Instagram | **fail open** — ugly is recoverable, unfixable is not |
| Selector config fetch fails / invalid | bundled config wins | no remote dependency |
| IG changes DOM drastically | reel lock's route layer still holds; gesture layer degrades to no-op | the pin is the guarantee, the gesture is comfort |
| JS injection blocked entirely (iOS) | native allowlist still blocks document loads; user lands in inbox when navigating by URL | graceful minimum: tab bar still works, blocking is weaker |
| Offline | IG's own retry UI; iOS adds a native "You're offline" card above the WebView; no bypass to blocked routes | never trade blocking for connectivity |

**Local failure log:** a ring buffer (last 20 selector misses) in `core`, readable from the Lock tab and the popup. Never uploaded.

---

## 14. Risk register

| # | Risk | Likelihood | Impact | What we do |
|---|---|---|---|---|
| R1 | **Instagram restricts logins from embedded WebViews (E8 unverified)** | Medium | Fatal to iOS shell | Phase 3 spike before any build. If it fails: iOS falls back to **Safari + our extension only** (a guide-mode app that opens instagram.com in Safari and walks the user through enabling the extension), which keeps the product lawful but weakens it badly. Decide with you before redesigning. |
| R2 | Meta ToS: wrapping and modifying instagram.com may breach their terms | High (that it's arguable) | Store removal / account action | Flagged, not solved here. Mitigations: no automation, no scraping, no credential handling, user-driven only, clear non-affiliation, no IG marks. **This one is for you and a lawyer (Phase 10).** |
| R3 | App Store review: "web wrapper" / minimal functionality / third-party content | High | Rejection | Phase 10/11: frame as a screen-time utility, add real native value (lock timer, settings, offline card, skeleton), no IG branding, no "Instagram" in the name or subtitle. |
| R4 | IG DOM changes break hiding overnight | Certain, periodically | Cosmetic or functional break | Stable hooks, selector JSON, remote config with bundled fallback, local failure log, fail-open/fail-closed split (§13). |
| R5 | Reel lock bypassed by an IG rebuild (new gesture surface) | Medium | Product promise breaks | Layered defence (route pin + DOM + gesture + scroll clamp) and a Phase 9 test that asserts the pinned id, not just "looks fine". |
| R6 | Extension store policy: remote config misread as remote code | Low–Medium (E7 is favourable) | Rejection | Pure-data schema, no interpreter, CSS bundled, documented in the listing (§8, §11). |
| R7 | Safari extension enablement friction | High | Low conversion | iOS app ships with an onboarding screen for Settings → Safari → Extensions (Phase 11), plus a help page. |
| R8 | Firefox Android / mobile extension reality (E5, E6) | High | Mobile web reach is thinner than the brief assumes | Be honest in the website's install detection: iOS Safari + Firefox Android are the real phone targets; Chrome on Android is not. |
| R9 | Trademark: "Instagram" in marketing copy | Medium | Takedown / rejection | Nominal, non-stylised references only ("works with Instagram"), never in the app name, icon, or store title. |
| R10 | Battery/perf: MutationObserver + touch handlers on a heavy SPA | Medium | Bad experience, review complaints | One throttled observer, `requestIdleCallback` batching, capture listeners attached only while pinned, no polling |

---

## 15. Open questions for you

1. **Q3 (carried):** profile grid — allow the page with a scrolling grid (Option A, recommended) or freeze it (Option B)?
2. **Q1 (carried):** stories blocked by default with a toggle — confirmed?
3. **Padlock:** P1 (settings + lock timer) vs P2 (settings only) vs P3 (paywall)?
4. **Q9 (carried):** the repo path, before Phase 4 scaffolds.
5. **R1 fallback:** if the WebView login spike fails, is "Safari + extension, with a guide-mode app" an acceptable fallback, or do we stop and reconsider the whole iOS surface?

---

## 16. Phase 2 exit criteria

- [x] Evidence table, with the video clues and seven verified ecosystem facts (E1–E7) and one honestly unresolved (E8).
- [x] Eight candidate architectures weighed; six rejected with reasons; none of the rejections relies on "it's hard".
- [x] Component diagram covering iOS app, extension and website, plus the repo layout Phase 4 will build.
- [x] Full allow/block/conditional route table with matching semantics and the username-vs-reserved-word trap called out.
- [x] Two-layer route guard with a validated message protocol.
- [x] Injection plan: CSS by concern, JS modules in boot order, lifecycle.
- [x] Reel lock specified per platform per vector, with edge cases handed to Phase 6.
- [x] Selector strategy that is policy-safe under E7.
- [x] Desktop behaviour: sidebar replacement, two-pane DMs, modals, keyboard shortcuts, layout detection.
- [x] Permissions at the minimum, privacy rules stated as structural impossibilities rather than promises.
- [x] Padlock: three options, one recommendation, staged.
- [x] Fail-closed / fail-open matrix.
- [x] Ten-item risk register, including the two that can kill the project (R1, R2).
