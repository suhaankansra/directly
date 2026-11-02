# 03 — Findings against the real site

Phase 3 was run on 2026-11-01 from this machine (`curl`, iPhone Safari user agent,
`Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) … Version/18.0 Mobile/15E148 Safari/604.1`).
Everything below is either **verified** (I ran it and pasted the result), **reported** (secondary
evidence from Phase 2 research, with a source), or **unverified** (needs a logged-in session, which I
will not create).

---

## 1. The web constraint is confirmed, not assumed

```
GET https://www.instagram.com/            → HTTP/2 200
x-frame-options: DENY
content-security-policy: default-src *.facebook.com … (no frame-ancestors directive)

GET https://www.instagram.com/explore/    → HTTP/2 200
x-frame-options: DENY
```

**Verified.** Instagram sends `X-Frame-Options: DENY` on HTML responses and does not send
`frame-ancestors`. Both block framing; the effect is the same. A normal website cannot embed
instagram.com, and nothing in this project tries. (The IP-address note: `frame-ancestors` is the
modern directive, but `DENY` alone is enforced by every current browser.)

Consequence: the web surface **must** be an extension running on instagram.com, as decided in D010.
No website can host a logged-in Instagram view. This is now measured, not reasoned.

## 2. Routes: what a logged-out client actually gets

| Request | Response | Meaning |
|---|---|---|
| `/` | `200` + `x-frame-options: DENY` | the feed HTML shell is served to guests |
| `/direct/inbox/` | `302 → /accounts/login/?next=%2Fdirect%2Finbox%2F…` | inbox exists, gated |
| `/accounts/activity/` | `302 → /accounts/login/?next=%2Faccounts%2Factivity%2F…` | **notifications route confirmed** as `/accounts/activity/` — the Phase 2 guess was right |
| `/explore/` | `200` | guest-visible discovery shell |
| `/reels/` | `302 → /accounts/login/…` | reels tab gated |

**Verified.** Two things follow that are now in the code:

1. `next=` carries the requested route through login. A user who hits `/reels/` while logged out
   arrives back on `/reels/` after signing in — so the guard must catch the **post-login** navigation,
   not just the first request. `routeVerdict('/accounts/login/?next=%2Freels%2F')` returns `allow`
   (the login page must load), and the redirect after it is caught by the in-page guard and by the
   host layer. Tested in `test/routes.test.ts`.
2. `/accounts/activity/` is the right notifications path, so tab 2 in both apps points there.

## 3. Selectors: what is verified and what is not

**Unverified.** Every DM, activity, thread and reel selector needs a logged-in session. I did not log
in, and I will not ask for credentials. This is the honest state of Phase 3:

- The **structure** of the design does not depend on those selectors: the guard matches URLs, not
  DOM. If every selector in `selectors/*.json` were wrong tomorrow, the feed would still be
  unreachable (D017, fail closed).
- The **cosmetic** layer (hiding IG's nav, the "Use the app" banner, sibling reel slides) does depend
  on them, and is built to be verifiable and correctable without a release:
  `href` / `aria-label` / `role` hooks only, a JSON override file (data, not code), and a
  failure counter exposed as `window.__directly.api.diagnostics()`.
- The reel lock's primary mechanism — hide every non-active `article` that contains a `video` — is
  structural and does not need a specific selector at all. The selectors are the fallback for when
  Instagram has no `article` in the reel modal.

### How it was verified instead: a fixture in a real browser

`packages/core/test/fixtures/serve.mjs` serves a page shaped like Instagram mobile web (bottom nav
with feed/explore/reels links, a "Use the app" banner, a DM inbox, a three-slide reel overlay) and
injects the **real built** `dist/inpage.js`. Results in Chromium at 390×844 and 1440×900:

| Check | Result |
|---|---|
| Cold load of `/` | redirected to `/direct/inbox/` |
| Cold load of `/explore/tags/cats/` | redirected to `/direct/inbox/` |
| Cold deep link to `/reel/Cdeep/` (no DM origin) | redirected to `/direct/inbox/` |
| `/direct/t/42/` | loads normally |
| Tap reel inside a DM (`pushState /reel/Cabc/`) | allowed, pin armed (`Cabc`) |
| Slides after the first | `data-di-slide-hidden="true"` (second and third) |
| Active slide | `data-di-slide-active="true"`, video `loop = true` |
| Next/prev chevrons | hidden |
| `pushState /reel/Cdef/` while pinned | blocked, redirected to inbox |
| Clicking an `<a href="/reels/">` | intercepted, redirected, link never followed |
| Injected nav | 4 items, correct active tab from URL, bottom bar at 390px |
| At 1440px | nav becomes a 76×900 left rail, `padding-left: 76px` |
| IG's own `nav[role=navigation]` | `data-di-removed="ig-nav"` |
| "Use the app" banner | `data-di-removed="app-banner"` |
| Inline CSS injected | yes (`#di-theme` present, 49.5 kB script) |

That is the blocking layer exercised end to end in a browser, minus Instagram's own markup.

## 4. Phone browser extension support (reported, Phase 2 research)

| Browser | Extensions | How it ships | Confidence |
|---|---|---|---|
| Safari on iOS/iPadOS | yes, Safari Web Extensions | bundled **inside** a containing app | high |
| Firefox for Android | yes, from a curated collection | AMO only in practice; arbitrary sideload is not a general path | medium-high |
| Chrome for Android | **no** | — | high |
| Samsung Internet | **no** | — | high |
| Kiwi Browser | discontinued (Jan 2025) | — | high |
| Edge for Android | curated allowlist, effectively no | — | medium |

Not re-tested on a device here. This is the table the Phase 4 plan is built on, and it is why the web
surface is "extension + a site that points you at it" rather than "a phone web app".

## 5. What still needs your eyes (10 minutes, logged in)

Do this on a phone in Safari with Instagram logged in, and on a desktop at 1440px. Each line is one
observation; a screenshot of anything surprising is enough.

1. Open `https://www.instagram.com/direct/inbox/`. Confirm the inbox is the page we re-skin.
2. Note the URL after tapping a thread. Is it `/direct/t/<id>/`? (`/direct/t/<id>/` and
   `/direct/t/<id>` both normalise correctly in our code.)
3. From a thread, tap a reel a friend sent. Note the URL: `/reel/<code>/` or `/reels/<code>/`?
   Our table allows both when pinned (D019) — this confirms which one Instagram actually uses.
4. In that reel, swipe up once. Does the URL change? (Our guard and gesture lock cover both cases.)
5. Back to the thread, then tap the username at the top → profile. Note the URL shape.
6. Tap the profile's Reels tab. Does it open a grid or a single reel?
7. Press the browser back button twice from a profile. Does anything land on the feed?
8. Open Instagram in a desktop browser at 1440px wide. Confirm the left sidebar items and that
   Explore/Reels are links (right-click → copy link) rather than JS buttons — `href`-based hiding
   needs real links.
9. On the desktop reel modal, confirm the up/down chevrons exist and whether `j`/`k` work.
10. Confirm the "Use the app" banner appears at the bottom of mobile web, and whether it has a close
    button or only an ✕ that reopens later.

Report those ten and I will fold the answers into `selectors/*.json` and the route table. Nothing
blocks: the code already treats every one of these as "either shape works".

## 6. Changes to the plan after this phase

| Phase 2 said | Phase 3 changes it to | Why |
|---|---|---|
| Block `/reels/*` entirely | `/reels/` and `/reels/audio/*` blocked; `/reels/<code>/` allowed **only when it is the pinned id** | Instagram uses both `/reel/<code>` and `/reels/<code>` for a single item; blocking both would block a reel a friend sent |
| Host layer trusts the route table as-is | Host layer gets `hostVerdict()`: conditional routes are allowed only when the previous URL was a DM or a profile | The host cannot see a pin that layer 2 has not armed yet; without this, "tap the reel in the thread" would be blocked on a full load |
| Mobile Safari extension is "verify the list" | Confirmed shape: bundled in the app, enabled in Settings → Safari → Extensions | Research + App Store requirement |
| Selector work is Phase 6 | Selector *verification* is deferred to you (no credentials), but the failure modes are already implemented | Fail closed on routes, fail open on cosmetics |
