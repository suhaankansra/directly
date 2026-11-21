# 01 — Directly product requirements

Directly is an independent messaging-focused client for Instagram. This document
specifies Directly's behavior and identity; it is not a comparison with another app.
The filename remains stable for existing documentation links.

## Identity and presentation

Use **Directly** in app metadata, navigation, accessibility labels, help, and release
material. The app uses its own generated icon assets and original explanatory copy.
Do not ship third-party promotional artwork, recordings, screenshots, account
handles, or testimonials. Keep required dependency licenses and platform attribution.

Directly-owned controls follow the host platform: native iOS switches, sheets and
supported materials on iOS; Android controls, tonal navigation and state feedback
on Android. The website and extension use responsive web navigation. Platform
visual fidelity and accessibility require device checks, not just a successful build.

## Destinations

| Destination | Behavior |
|---|---|
| Chats | Default destination: `/direct/inbox/`; keep Instagram's own search, Notes, thread list and composer. |
| Stories | Optional; disabled by default. List only story links already rendered by the page. Show an honest empty state when none are available. |
| Activity | Open `/accounts/activity/`; explain if Instagram does not serve it. |
| Profile | Open the signed-in account's profile when its handle is known; use the page's own profile link otherwise. |
| More | Present Focus controls, supported preferences, account actions, diagnostics, help and privacy. |

The native app reuses one mounted WebView and one session across all destinations.
A native screen must not replace or reconstruct the Instagram message content.
Opening settings must preserve the conversation, scroll state and composer.

## Route protections

| Surface | Rule |
|---|---|
| DM inbox, threads, requests and compose | Allow. |
| Activity, deliberate profile visits, account/login/challenge flows | Allow according to the shared route table. |
| A single reel or post opened from a supported DM/profile surface | Allow only that item; prevent continuation to unrelated media. Strict mode disables this access. |
| Feed, Explore, global search and the endless Reels destination | Always block and return to the inbox. |
| Story viewer | Require Stories to be enabled and an explicit person selected. Continuation defaults off; when enabled, limit it to the captured story list. |
| Unknown route while signed in | Block. Unknown authentication steps while signed out follow the shared login fallback. |
| External link | Apply the shared outbound-link policy; do not expose credentials or broaden route access. |

Route decisions belong to `packages/core`, shared by the native and extension hosts.
Blocked-route rules fail closed. Cosmetic selectors fail open and must never hide
a thread, text field, composer or conversation surface. Use stable links, labels,
roles and structural hooks rather than Instagram's obfuscated classes.

## Privacy and reliability

- Never read cookies, credentials or passwords. Keep the session in its platform store.
- Do not read or recreate message bodies to build native presentation.
- Validate every page/host message; reject unknown types, malformed data and oversized payloads.
- Keep story metadata to bounded handles and seen flags, without media or captions.
- Do not load the blocked feed to populate Stories or invent people, counts or results.
- Injection must tolerate document start before the root element exists.
- Keep notifications honest about their current local, count-based behavior; do not claim closed-app push.

## Acceptance

Verify inbox → thread → send → back; Activity and Profile; one shared reel with no
next-item browsing; all fixed route protections under every settings combination;
Stories selection, full reload and exit; and settings persistence.

Verify iOS and Android appearance separately, including large text, screen readers,
keyboard/composer space, Reduce Motion and transparency/contrast fallbacks.
A URL guard does not establish that a story viewer cannot change people without a
URL change. That boundary remains a signed-in device acceptance check.

See [architecture](02-architecture.md), [test plan](09-test-plan.md), and the
[current Phase 1 report](38-v2-spec.md) for implementation evidence and limitations.
