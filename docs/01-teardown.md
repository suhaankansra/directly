# 01 — Teardown: what the 16-second demo actually shows

**Phase:** 1 of 11 · **Status:** complete · **Date:** 2026-11-01
**Source of truth:** the written teardown of the creator's 16-second iPhone screen recording (master prompt §1.1–1.9). We have no binary, no source, and we are not getting either.
**Our product name:** Directly. **Scope of this phase:** documentation only. No code, no scaffolding, no packages installed.

---

## 0. The product in one sentence

Instagram that opens on your DMs: the feed, Reels tab and Explore are gone, so you can read and answer messages, check notifications, look at profiles, and watch the one reel a friend sent you — and when you try to swipe to the next reel, nothing happens.

The mechanic in one line: **the app removes the surfaces you browse and keeps the surfaces you reply on.** Every decision below is judged against that.

---

## 1. Restated feature list

Grouped by surface. Each item is tagged with how well the video supports it:
**[seen]** demonstrated on screen · **[implied]** necessary for what is seen but not itself shown · **[assumed]** my inference, needs your confirmation (see §5).

### 1.1 Launch and identity

| # | What the app does | Support |
|---|---|---|
| F1 | Tapping the app icon lands **straight in the DM inbox**. No splash feed, no home screen, no onboarding card in the recording. | [seen] |
| F2 | App Store listing sits in **Photo & Video**, named "Konvo: DMs Only", subtitled "Reduce Screen Time", icon = white speech-bubble outline on a blue/indigo rounded square. | [seen] |
| F3 | Branding is essentially absent inside the app: you are looking at Instagram, restyled. There is no third-party logo, watermark or "powered by" chrome. | [seen] |

### 1.2 Global shell

| # | What the app does | Support |
|---|---|---|
| F4 | **Dark theme throughout** — near-black/charcoal surfaces, light grey text, no white flashes. | [seen] |
| F5 | **Purple accent replaces Instagram blue** — outgoing message bubbles and "Follow Back" buttons are purple. | [seen] |
| F6 | A **custom bottom tab bar with exactly four icons**, left → right: **chat bubble · heart · person · padlock**. The active item gets a soft rounded highlight behind the icon (not a filled icon + label, as Instagram does). | [seen] |
| F7 | Instagram's own bottom nav — Home, Search/Explore, Reels, Create, Profile — **does not exist**. The creator deliberately circles the bar to make the point that Feed, Reels and Explore are unreachable. | [seen] |
| F8 | The shell survives navigation: the tab bar stays put while the content area changes (it is a frame around Instagram, not part of the page). | [implied] |

### 1.3 DM inbox (tab 1)

| # | What the app does | Support |
|---|---|---|
| F9 | Header: **logged-in username with a ▾ chevron** (account switcher) on the left, **compose / new-message icon** top-right. | [seen] |
| F10 | **Search field** below the header, inside DMs. | [seen] |
| F11 | **Notes row** — a "What's new…" style bubble above your own avatar, labelled "Your note". | [seen] |
| F12 | **"Messages"** section heading, then a thread list: avatar, display name, preview line of the form `You: yo wassup · 1d`. | [seen] |
| F13 | Layout is **Instagram's mobile-web DM inbox**, re-skinned — not a native reimplementation of messaging. | [seen] |
| F14 | Compose opens a new-chat flow with contact search. | [assumed] |

### 1.4 DM thread

| # | What the app does | Support |
|---|---|---|
| F15 | Header: back arrow, avatar, **display name + @username**, ⓘ info button on the right. | [seen] |
| F16 | **Purple outgoing bubbles** ("ello", "yo wassup"); **centred timestamps** ("Fri 3:19 PM", "8:54 AM"); a **"New messages"** divider for unread messages. | [seen] |
| F17 | A **shared reel renders inline as a card** — sharer's handle at the top, thumbnail, play glyph. It sits in the message flow, not in a separate tab. | [seen] |
| F18 | **"Seen just now"** receipt under your last message. | [seen] |
| F19 | Composer: **"Message…" field** with **mic**, **image** and **sticker** icons. | [seen] |
| F20 | Typing and sending work normally; a **green ✓** appears on the sent message. | [seen] |
| F21 | Photos, voice notes, stickers, reactions, and replying to a specific message all work. | [implied] |

### 1.5 Reel opened from a DM (the centrepiece)

| # | What the app does | Support |
|---|---|---|
| F22 | Tapping the inline card opens **that one reel full-screen**: top bar with **back chevron**, **original sender's handle**, **"1m ago"**. | [seen] |
| F23 | The reel **plays normally**, with its caption overlay visible. | [seen] |
| F24 | You can **react / reply from inside the reel** — a "good" reply appears over the video. | [seen] |
| F25 | **Swiping up to reach the next reel does nothing.** The video stays, the gesture is inert. This is the single product mechanic everything else exists to serve. | [seen] |
| F26 | Back returns you to the thread you came from, at the same scroll position. | [implied] |

### 1.6 Notifications (tab 2)

| # | What the app does | Support |
|---|---|---|
| F27 | Title **"Notifications"**, bucketed into **This week / This month / Earlier / Suggested for you**. | [seen] |
| F28 | Rows like "justin.l1220 started following you. 4d" with a **purple Follow Back** button; already-followed accounts show a **"Following"** pill instead. | [seen] |
| F29 | System/account rows appear too, e.g. "We've updated one of your settings to manage what you see on Instagram." | [seen] |
| F30 | At the very bottom, a faint **"Use the app"** banner with an ✕ — Instagram's own mobile-web "open in the app" prompt, leaking through. | [seen] |
| F31 | Notifications is a list you can act on (follow back), not a browsing surface — nothing here scrolls into content. | [implied] |

### 1.7 Profile (tab 3)

| # | What the app does | Support |
|---|---|---|
| F32 | Your profile opens, **mostly blank/dark while loading**; both your profile and other people's are viewable. | [seen, briefly] |
| F33 | Profiles are a destination, not a feed — you arrive to look someone up, not to browse their grid for an hour. | [assumed] |

### 1.8 Lock tab (tab 4)

| # | What the app does | Support |
|---|---|---|
| F34 | There is a **padlock icon** as the fourth tab. **The video never opens it.** Its function is unknown — settings, focus mode, a timer, a paywall, or nothing at all. | [unknown] |

### 1.9 Theme and chrome

| # | What the app does | Support |
|---|---|---|
| F35 | Instagram's blue is gone in favour of our purple: outgoing bubbles, "Follow Back", and by implication links and primary buttons. | [seen for 2 elements] |
| F36 | Instagram's own promotional chrome is being removed, at least in intent — but the "Use the app" banner slipping through shows this removal is **incomplete in the shipped build**. Ours must be cleaner than the demo. | [seen, as a leak] |

---

## 2. Allowed vs blocked

The whole product is this table. "Route" column is the mobile-web path **we expect** to own each surface; every one of them is unverified until Phase 3.

| Surface | Expected route | Konvo (video) | Directly (our intent) | Evidence |
|---|---|---|---|---|
| Launch | — | inbox | inbox | F1 |
| DM inbox | `/direct/inbox/` | **allow** | allow | F9–F13 |
| DM thread | `/direct/t/<id>/` | **allow** | allow | F15–F21 |
| New message / contact search | `/direct/new/` · `/direct/inbox/` search | **allow** | allow | F19, F14 |
| Notes row | inside inbox | **allow** | allow | F11 |
| Notifications | `/accounts/activity/` (to verify) | **allow** | allow | F27–F30 |
| Follow back from notifications | same page | **allow** | allow | F28 |
| Own + others' profiles | `/<username>/` | **allow** | allow | F32 |
| One reel from a DM | `/reel/<id>/` | **allow**, frozen | allow, frozen | F22–F25 |
| Reels **tab** / next reel while watching | `/reels/` | **block** (red ✕ in video) | block | F7, §1.8 |
| Home feed | `/` | **block** | block | F7 |
| Explore / search grid | `/explore/`, `/explore/search/` | **block** | block | F7 |
| Stories | `/stories/<user>/` | unknown — never shown | **block by default** (toggle later) | ✗ |
| Post detail (`/p/<id>/`) | `/p/<id>/` | unknown — never shown | allow **single** post only, same freeze rule | ✗ |
| Account switching | from inbox ▾ | present, untested | allow, or hide cleanly — decide in Phase 2 | F9 |
| Login / 2FA / challenges | `/accounts/login/`, `/challenge/`, `/two_factor/` | assumed, not shown | allow — required for first run | ✗ |
| "Use the app" banner | overlay | leaks through | **must be removed** | F30, F36 |
| Any external (non-Instagram) link | — | unknown | open in system browser | ✗ |

---

## 3. Screen map

```
                          tap app icon
                                |
                                v
+---------------------------------------------------------------+
|  TAB 1 - DM INBOX                       /direct/inbox/        |
|                                                               |
|   username v                                   [ compose ]    |
|   [ Search                                     ]              |
|   ( ° )  Your note / "What's new..."                          |
|                                                               |
|   Messages                                                    |
|    o  jane         You: yo wassup . 1d                        |
|    o  justin.l1220        good . 3h                           |
|                                                               |
|                                                               |
+---------------------------------------------------------------+
|   [chat]        [heart]        [person]        [padlock]      |  <- our 4-tab bar
+----+----------------+----------------+--------------------+---+
     |                |                |                    |
     v                v                v                    v
 TAB 1 drill      TAB 2 notif.     TAB 3 profile        TAB 4 ????
     |            /accounts/       /<username>/         (never shown)
     |             activity/
     |
     +--> TAP A THREAD                     /direct/t/<id>/
          +---------------------------------------------------+
          |  <-  (o) jane  @jane.doe                      (i) |
          |                                                   |
          |                    Fri 3:19 PM                    |
          |                          +----------------+       |
          |                          |    purple      |       |
          |                          |    bubble      |       |
          |                          +----------------+       |
          |                    --------- New messages -------- |
          |                          +----------------+       |
          |                          |   bubble       |       |
          |                          +----------------+       |
          |                                                   |
          |   +-------------------------------------------+   |
          |   | jane . shared a reel                      |   |
          |   | [ thumbnail                       (play) ] |   |
          |   +-------------------------------------------+   |
          |                                                   |
          |                     Seen just now                 |
          |   [ Message...                     mic img sticker]|
          +--------------------------+------------------------+
                                     | tap the reel card
                                     v
          +---------------------------------------------------+
          |  <-   jane  .  1m ago                             |   REEL, frozen
          |                                                   |   /reel/<id>/
          |                                                   |
          |              [ video plays ]                      |
          |              caption overlay                      |
          |              your reply appears over it           |
          |                                                   |
          |            ^^^  swipe up = nothing  ^^^           |
          +---------------------------------------------------+
                                     |  <- back
                                     v
                            returns to the thread
```

**Navigation rules implied by the map**

1. The four tabs are siblings, always reachable, and never change into a fifth mode.
2. Everything else is a **push** (thread, reel) or an **in-place view** (profile, notifications) — there is no third level of browsing depth anywhere, except the thread → reel hop.
3. Nothing in the map leads to a surface with an infinite scroll of content. That is the design invariant, not a side effect.

---

## 4. Ambiguities in the recording

Numbered so you can answer them by number. Each has my default if you'd rather just say "as you suggest".

**A1 — The padlock.** Never opened. Default: settings + logout + strict-mode switch (proposed properly in Phase 2).
**A2 — Whether the bottom bar is native or an HTML overlay.** Cannot be told from a screen recording. Doesn't change the spec: ours is native on iOS, injected HTML in the extension.
**A3 — The green ✓.** Instagram's mobile web acknowledgement is not green, which suggests either a custom indicator or an iOS artefact. Default: verify in Phase 3 and recolour whatever IG actually renders with our accent.
**A4 — Profile "mostly blank/dark while loading".** Cannot distinguish our dark skeleton from IG's own loading state. Default: assume a dark skeleton we design, and confirm in Phase 3 what IG renders.
**A5 — Notes.** The video shows the Notes row existing; it does not show creating a note. Writing one may need camera/upload permissions inside a WebView. Default: display it, verify creation in Phase 3, and if it can't work in a WebView, leave it read-only.
**A6 — Account switcher.** Shown with a ▾ but never tapped. Default: leave Instagram's own switcher intact if it works; hide the chevron if it doesn't.
**A7 — "Suggested for you" in notifications.** This is the one place in the demo that recommends accounts to follow — mild discovery. Default: keep it, because it's what the reference build does and it has no infinite scroll; revisit if you want a stricter promise.
**A8 — What happens when you swipe up on the *first* reel after a DM.** Video shows the gesture producing no visible effect at all. Unclear whether there's a toast, a bounce, or nothing. Default: nothing at all — silence reads as "this app is just like that", a toast reads as broken.
**A9 — Reels opened from elsewhere.** A reel reached from a shared post, a profile grid, or a search result — the video never tries. Default: same freeze rule (one reel, no next), which makes the rule uniform and explainable.
**A10 — Reels that arrive as a *post* containing reels in a carousel** (Phase 6 mentions it). Unclear in the video. Default: horizontal swiping inside one post works, vertical/next-item does not.

---

## 5. Open questions for you

**Q1 — Stories.** The video never opens one, but story rings will be visible on avatars in the inbox and on profiles. Allow single-story viewing (consistent with "watch what friends sent me"), or block stories entirely in v1? *My recommendation: block by default, ship a "allow stories" switch in the Lock tab, because a story session is exactly the kind of endless tap-through the product exists to remove.*
**Q2 — Post detail.** A friend DMs you a normal photo post, not a reel. Blocking it is hostile; allowing it opens the same "next post" surface. *My recommendation: allow single post, freeze next — identical rule to reels.*
**Q3 — Profiles: how far in?** A profile can be a hub into their Reels tab and their tagged/feed grid. *My recommendation: allow the profile header and bio, freeze the grid (Phase 3 must confirm whether a profile grid can even be reached without the feed).* Alternatively: single-tap opens a photo, no grid scroll.
**Q4 — DMs only, literally?** The inbox header's compose icon leads to contact search. Do we allow Instagram's global Search anywhere (it's the main remaining discovery door)? *My recommendation: no global search anywhere; contact search inside DMs only.*
**Q5 — Offline.** Phase 9 wants a friendly offline screen. Instagram's web app already has its own offline/retry state. *My recommendation: keep IG's behaviour on the extension side, add one small native offline card in iOS; both must fail closed (still no feed).*
**Q6 — Unread badges.** The video shows no badge on the tab bar. *My recommendation: none in v1 — a badge is a pull back onto the phone, and the product is about the opposite.*
**Q7 — Voice notes and camera.** The composer shows a mic. Recording audio in a WKWebView needs a microphone usage string and a permission prompt; stickers may need the IG camera surface. *My recommendation: support mic (needs your Info.plist consent text in Phase 5), accept the system photo picker, and if the sticker/AR camera surface is broken in a WebView, hide the sticker button rather than ship a dead icon.*
**Q8 — Login breadth.** First run must survive login, 2FA, and an "unusual activity" challenge. That means allowing a fairly wide set of `/accounts/*` and `/challenge/*` paths, which is the loosest part of the allowlist. *My recommendation: allow broadly for `/accounts/*` and `/challenge/*`, then immediately redirect to the inbox once authenticated.*
**Q9 — Where does the repo live?** My sandbox workspace is empty and thread-scoped. Phase 4 will scaffold a pnpm monorepo. Do you want it here, or in a folder of your choosing (e.g. `~/dev/directly`) that you'll open as the project? *My recommendation: tell me a real path in Phase 4 so `git init` lands somewhere you'll actually work.*
**Q10 — Bundle id / handles.** Needed in Phase 4: reverse-DNS bundle id, and whether you own a domain for the website. *My recommendation: `com.directly.app` and `directly.app`, confirm or correct.*
**Q11 — Lock tab, final answer.** Per your settings this is decided in Phase 2; just confirming you want the three options laid out with a recommendation rather than a decision now.
**Q12 — One thing the prompt asserts that the video does not show:** §1.9 says stories and single posts aren't in the allowed list, but the composer and threads will surface them constantly. Do you want the *product promise* to be "DMs only" strictly (block everything not in the allowed list, including a photo a friend sends), or "no browsing" (allow a single item a friend sent, block everything that continues)? *My recommendation: "no browsing". It's the sentence the whole product is built on, and it's the only version a user won't find hostile.*

### Contradictions inside the master prompt (flagged, not silently resolved)

1. **§1.2 vs tab 3.** The prompt says Instagram's own nav "is gone" and lists Profile among the removed items, while our tab 3 *is* Profile. Not a real conflict — ours replaces theirs — but the store copy must not say "no profile".
2. **§2.2.3 leaves `/stories/<username>/` as "decide", and Phase 8 asks for an "allow Stories" toggle.** Both can't be settled in Phase 2 if Phase 8 is the toggle's home. I've queued it as Q1; the architecture doc will carry the default.
3. **§9 requires "Notes row usable" while §1.9's allowed list never mentions Notes.** Whether "usable" means *usable to create* is unresolved until Phase 3 confirms WebView camera/upload support (A5).
4. **§1.6's "Suggested for you" is a discovery surface** inside an otherwise non-discovery app, and §9 never checks it. Called out as A7.
5. **Phase 3 is asked to "confirm framing headers" and "ask me to log in"**, but no surface in the extension can be tested for logged-in DM behaviour without an account. I'll do public/layout reconnaissance in Phase 3 and leave logged-in selector confirmation to a checklist you run.

---

## 6. What the video proves about architecture

Not concluded here — that's Phase 2 — but the teardown hands it three pieces of evidence, recorded so Phase 2 has to argue *from* them rather than assert:

1. **F30 / F36 — the "Use the app" banner.** That banner is Instagram's *mobile-web* app-install prompt. It cannot appear in a native app that isn't a browser; its presence means the app is displaying Instagram's web app.
2. **F13 and F27 — web-shaped layouts.** The DM inbox and notifications match IG's web layouts (time-bucketed sections, mobile-web banner) rather than the native iOS app's.
3. **F16, F5, F7 — injected styling and removal.** Purple bubbles inside someone else's app and a deleted bottom nav are not settings; they are overrides applied on top of a page.

Together those point at one sentence: *a shell around Instagram's mobile web, restyled and pruned.* Phase 2 has to justify that, price it, and check the alternatives — plus the one thing the evidence does **not** settle: how a browser-side version can do the same without proxying anyone's session.

---

## 7. Phase 1 exit criteria

- [x] Feature list restated, 36 items, each tagged seen / implied / assumed / unknown.
- [x] Screen map, ASCII, with navigation rules.
- [x] Allowed vs blocked table including "unknown" rows, with expected routes.
- [x] 10 ambiguities and 12 open questions, each with a recommendation.
- [x] Five contradictions inside the master prompt flagged.
- [x] Architecture evidence recorded without concluding.
- [x] No code written.
