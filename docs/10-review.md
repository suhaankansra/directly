# 10 — Review, hardening, risks

Written after the build, reading the code back. Findings are listed with what was changed and what was
knowingly left.

## 1. Security review

| Area | Finding | Action |
|---|---|---|
| Credentials | Nothing in `packages/core` reads `document.cookie`, form fields, or storage. The only `document.cookie` use is `guessLoggedIn()` in `inpage/index.ts`, and it tests for the **presence** of `ds_user_id` without reading its value. | Keep. Consider dropping if it ever feels like a slippery slope; it only affects the unknown-route fallback. |
| Session storage | iOS relies on WKWebView's own cookie store (`sharedCookiesEnabled`); the extension relies on the browser's. No copy exists in app storage. | Keep. |
| Message content | The bridge protocol has no field that can carry a message. `di:url` carries a path, `di:account` a username, `di:blocked` a reason code. | Keep. A future feature that needs more must add a validated type, which is a visible diff. |
| Bridge trust | `parsePageMessage` / `parseHostMessage` enforce `v === 1`, a known type, path must start with `/`, no backslashes, ≤ 512 chars, payload ≤ 4 kB, pins/usernames regex-limited. | Tested. Unknown input is dropped, never forwarded, never evaluated. |
| Origin checks | Extension content script ignores `message` events unless `event.source === window` **and** `event.origin === location.origin`. iOS trusts only the WebView's own channel plus the same validation. | Keep. A cross-origin frame cannot drive the page's settings. |
| Remote config | Fetched as JSON only, `credentials: 'omit'`, 4 s timeout, ≤ 64 kB, merged through a whitelist: known keys, `string[]` values, ≤ 400 chars, no `{` and no newlines. No `eval`, no `new Function`, no dynamic import. | This is the policy-safe shape (data, not code). Tested indirectly; the merge rejects unknown keys. |
| Injected HTML | `navBar.ts` sets `innerHTML` from a **constant** icon map keyed by a union type. No user or page data reaches it. | Keep. If icons ever become configurable, use `createElementNS` instead. |
| Logging | `debug` logs go to the local console only: blocked reason, path, version. No payloads, no usernames, no message text. | Keep. |
| Extension permissions | `storage`, `webNavigation`, `tabs`, host `instagram.com`, `instagram.com` (apex). No `<all_urls>`, no scripting-on-demand, no webRequest, no cookies API. | `tabs` is only used to send a blocked tab to the inbox. Could be narrowed to `tabs.update` without `tabs` permission (same-origin URL update needs no extra permission) — worth verifying before store submission. |
| iOS deps | `@react-native-cookies/cookies` is used only by "Sign out". If it fails to load, the app falls back to Instagram's own logout page. | Keep, documented. |

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
- Cost measured: inpage bundle 49.5 kB unminified. Minifying would take it to roughly 20 kB, at the
  cost of debuggability on a device; not done yet — flag for release builds.

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
| R1 | **Instagram blocks logins inside WKWebView.** | Unresolved. I could not find current, credible evidence either way. If it does, the whole iOS surface collapses to "Safari + extension", which is lawful but much weaker. | Test first: install the dev build, log in. If blocked, pivot the app to a guide-and-check shell (see D021). This is the single biggest unknown in the project. |
| R2 | **Meta's terms.** | Wrapping their site and modifying its UI is not something their terms contemplate. Ad-blockers are a long-standing precedent, but precedent is not permission. | You should read Meta's Platform Terms and the Instagram Terms of Use yourself. This document is not legal advice, and no amount of engineering makes a policy question go away. |
| R3 | **App Store review.** | A thin wrapper around a third-party site is exactly the shape reviewers dislike: guideline 4.2 (minimum functionality) and possibly 5.2 (third-party content). Bundling a Safari extension helps the "does something" argument; a "DMs only" utility framing helps more. | Expect one rejection. Prepare a demo video showing the blocking, and emphasise the Safari extension as the substantive feature. Do not use Instagram's logo or name in the app icon or screenshots. |
| R4 | **Chrome Web Store policy.** | Single purpose ("reduce Instagram to its DM inbox") is clear. Remote *data* is allowed; remote *code* is not, which is why the config is JSON. `webNavigation` + `tabs` will be scrutinised. | Write the permission justification before submitting (see 11-ship-prep). Consider dropping `tabs`. |
| R5 | **Instagram changes its DOM.** | Certain to happen. | Blocking is URL-based and fails closed. Cosmetic rules are `href`/`aria-label`/`role`-based and fail open. Selector lists are hot-swappable data. |
| R6 | **Instagram blocks embedded WebViews outright** (user-agent sniffing). | Plausible; many social sites do this to in-app browsers. | Same detection path as R1: one login attempt answers it. Fallback: hide nothing, load in Safari via `SFSafariViewController`? — that has no injection, so it is not a fallback. |
| R7 | **Trademark.** | "Instagram" in the name or icon would be a problem. | Product name is "Directly"; marketing copy says "for Instagram" descriptively, never "Instagram DMs Only". The site carries a non-affiliation line. All icons are generated here, nothing traced. |
| R8 | **Telling users this reduces screen time.** | It is a plausible claim, not a measured one. | Do not put "reduce screen time" in the App Store subtitle without data. Say what it does instead. |
| R9 | **Sign-out on iOS.** | Requires a native cookie module; in Expo Go it cannot work. | `signOut()` tries the module and falls back; document the dev-build requirement. |
| R10 | **Android.** | Out of scope, but the code must not block it. | Route rules, guard and lock are platform-neutral; the WebView component takes `ApplicationName` and hardware back already. Nothing in core assumes iOS. |

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
