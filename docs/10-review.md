# 10 — Review, hardening, risks

Current implementation review updated 2026-11-21. This file reflects the current five-destination
app and extension; older entries in the dated plan and release records remain historical.

Written after the build, reading the code back. Findings are listed with what was changed and what was
knowingly left.

## 1. Security review

| Area | Finding | Action |
|---|---|---|
| Credentials | Current code does not read `document.cookie`, password fields, or credentials. It reads a signed-in username from a profile link, story-tray usernames for the Stories feature, and the unread count when Instagram exposes one. | Keep the selectors limited to those routing and control needs. Do not read message contents or cookies. |
| Session storage | iOS relies on WKWebView's own cookie store (`sharedCookiesEnabled`); the extension relies on the browser's. No copy exists in app storage. | Keep. |
| Message content | The bridge has no field for message text. It carries paths, a signed-in username, story-tray usernames, route reasons and an unread count. | Keep the message-content boundary; additions require a validated protocol type and explicit review. |
| Bridge trust | `parsePageMessage` / `parseHostMessage` enforce `v === 1`, a known type, path must start with `/`, no backslashes, ≤ 512 chars, payload ≤ 4 kB, pins/usernames regex-limited. | Tested. Unknown input is dropped, never forwarded, never evaluated. |
| Origin checks | Extension content script ignores `message` events unless `event.source === window` **and** `event.origin === location.origin`. iOS trusts only the WebView's own channel plus the same validation. | Keep. A cross-origin frame cannot drive the page's settings. |
| Remote config | Fetched as JSON only, `credentials: 'omit'`, 4 s timeout, ≤ 64 kB, merged through a whitelist: known keys, `string[]` values, ≤ 400 chars, no `{` and no newlines. No `eval`, no `new Function`, no dynamic import. | This is the policy-safe shape (data, not code). Tested indirectly; the merge rejects unknown keys. |
| Injected HTML | `navBar.ts` sets `innerHTML` from a **constant** icon map keyed by a union type. No user or page data reaches it. | Keep. If icons ever become configurable, use `createElementNS` instead. |
| Logging | iOS diagnostics are bounded and held in memory. They include paths, route decisions, and the signed-in handle in an account event; they do not log message text. Extension debug output is local to the browser console. | Keep diagnostics local, bounded, and content-free. |
| Extension permissions | `storage` and `webNavigation`, plus Instagram-only host permissions for the apex and `www` hosts. No `<all_urls>`, cookies API, `webRequest`, or `tabs` permission. | Matches `apps/extension/scripts/build.mjs`; `tabs.update` and `tabs.onRemoved` are used without requesting the tabs permission. |
| Native session | Instagram's own WebView cookie store holds the login. Directly does not read cookies; sign out uses Instagram's logout route and clears local account metadata. | Keep session handling inside the platform WebView. |

## 2. Performance

- **One** MutationObserver for the whole script, `childList + subtree` only (never `attributes`,
  which is the expensive one), coalesced with a 150 ms floor and `requestIdleCallback` when available.
  Our own `data-di-*` attribute writes are ignored so we cannot loop.
- Cleanup runs on route change and on mutation batches, not on a timer. The text scan for "Use the
  app" only inspects leaf elements (`children.length === 0`) with ≤ 40 chars of text.
- The reel lock's `tick()` walks `article` elements, which on a reel page number in the low tens.
  It sets attributes rather than mutating React-owned DOM, so Instagram's own render is not disturbed.
- CSS is injected once, at `document_start`, before first paint: this removes the white flash *and*
  avoids a reflow storm later.
- Cost measured: inpage bundle 53.1 kB unminified, 30.3 kB minified. Release builds set
  `DIRECTLY_MINIFY=1` so the shipped script is the small one; dev builds stay unminified so a device
  WebView can still be inspected with remote debugging.

## 3. Remote selector config — the design, concretely

```
GET https://<your-host>/directly/selectors.mobile.json
{
  "version": 1,
  "selectors": { "reelScroller": ["div[style*='scroll-snap-type']", "…"] }
}
```

- Validated by `mergeSelectorConfig`: unknown keys rejected, non-string values rejected, over-long or
  brace/newline-containing selectors rejected. Anything rejected falls back to the bundled list.
- Bundled list always present, so a 404, a captive portal or an offline phone changes nothing.
- `version` is checked to be exactly `1`; a future format gets `version: 2` and an explicit code path,
  not a reinterpretation of the old one.
- The fetch is currently wired but **not enabled by default**: `remoteSelectorUrl` is `null` unless a
  user or a future settings toggle sets it. That is deliberate — a remote URL that ships on is a
  network call on every page load for no benefit until there is something to fix.

## 4. Risk register

| # | Risk | Honest assessment | Mitigation / decision needed |
|---|---|---|---|
| R1 | **Signed-in Instagram flows on real devices.** | Still unverified with an authenticated account: login/challenge, inbox, opening a thread, sending, and returning. | Complete the device checklist in `09-test-plan.md` on iOS and Android before claiming the native flow is verified. |
| R2 | **Meta's terms.** | Wrapping their site and modifying its UI is not something their terms contemplate. Ad-blockers are a long-standing precedent, but precedent is not permission. | You should read Meta's Platform Terms and the Instagram Terms of Use yourself. This document is not legal advice, and no amount of engineering makes a policy question go away. |
| R3 | **App Store review.** | No App Store submission or review outcome is recorded in this repository. Store approval remains an open platform decision. | Do not imply review is underway or predict a rejection. Use original Directly artwork and factual product copy in any future submission. |
| R4 | **Chrome Web Store policy.** | Single purpose ("reduce Instagram to its DM inbox") is clear. Remote *data* is allowed; remote *code* is not, which is why the optional selector config is JSON. The current manifest requests `storage` and `webNavigation` plus Instagram host access. | Keep the store disclosure matched to the generated manifest and the data described in 11-ship-prep. |
| R5 | **Instagram changes its DOM.** | Certain to happen. | Blocking is URL-based and fails closed. Cosmetic rules are `href`/`aria-label`/`role`-based and fail open. Selector lists are hot-swappable data. |
| R6 | **Instagram blocks embedded WebViews outright** (user-agent sniffing). | Plausible; many social sites do this to in-app browsers. | Same detection path as R1: one login attempt answers it. Fallback: hide nothing, load in Safari via `SFSafariViewController`? — that has no injection, so it is not a fallback. |
| R7 | **Trademark.** | "Instagram" in the name or icon would be a problem. | Product name is "Directly"; marketing copy says "for Instagram" descriptively, never "Instagram DMs Only". The site carries a non-affiliation line. All icons are generated here, nothing traced. |
| R8 | **Telling users this reduces screen time.** | It is a plausible claim, not a measured one. | Do not put "reduce screen time" in the App Store subtitle without data. Say what it does instead. |
| R9 | **Sign-out in the native app.** | Sign-out uses Instagram's logout route and clears Directly's locally remembered account metadata; Directly does not read cookies. | Verify the signed-in flow on physical iOS and Android devices. |
| R10 | **Android native behavior.** | Android is a supported host, but signed-in device acceptance, accessibility behavior and material fidelity remain open. | Use the Android device checks in `09-test-plan.md`; keep Android controls platform-native. |

## 5. Code review notes (readability)

- `routes.ts` is the one file that must never be clever. Its rules are ordered, commented and tested
  per branch; the reserved-word set is the only asymmetry (needed so a user named `direct` cannot
  shadow `/direct/inbox/`).
- `guard.ts` has a documented re-entrancy guard rather than a debounce, because a time window
  silently swallows a genuine second violation (found while testing: a 400 ms window suppressed a real
  navigation).
- `inpage/index.ts` is the only place that knows about both the guard and the reel lock. Keeping that
  knowledge in one bootstrap is why "arm the pin on the way in" lives there and not in either module.
- Two type escapes exist and both are commented: the WebView `ref` (the library's published types do
  not include it) and the `window` global handle for debugging.
- `reelLock.ts` sets `video.loop = true` on the active slide. That is a product decision disguised as
  a technical one: it removes Instagram's `ended` trigger, which is what starts the next reel.
