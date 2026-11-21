/**
 * Cleanup: remove the parts of Instagram's web UI that lead somewhere we
 * blocked, plus the app-install nagging (docs/02-architecture.md §6, Phase 6.2).
 *
 * Everything here is *cosmetic*, so it fails open (D017): if a selector breaks,
 * the element stays visible — ugly, but usable — while blocked routes are still
 * blocked by the guard, which fails closed.
 *
 * We never remove the message composer, a thread, or anything a user typed.
 */

import { normalizePath, reelIdForPath, routeVerdict, storyUserForPath, type RouteContext } from '../routes.js';
import type { Settings } from '../settings.js';
import type { SelectorResolver } from './selector.js';

export type CleanupDeps = {
  win: Window;
  resolver: SelectorResolver;
  getSettings: () => Settings;
  isLoggedIn: () => boolean;
  getStoryUser?: () => string | null;
  onRemoved?: (label: string) => void;
};

const UPSell_PHRASES = [
  'use the app',
  'open in app',
  'get the app',
  'scan the qr code',
  'open instagram app',
];

const REMOVABLE_ROLES = new Set(['banner', 'dialog', 'complementary']);

/**
 * Elements that mean "this container is the inbox or a conversation".
 *
 * Anything matching is never removed by *any* rule below: the whole point of
 * the app is that losing the inbox is impossible (D017, invariant 4). The
 * thread link alone is not the whole story either — an empty inbox has no
 * `/direct/t/` link, which is why the navigation rule below also insists on
 * two dead ends, not one.
 */
const MESSAGE_SURFACE_SELECTOR = [
  "a[href*='/direct/t/']",
  'textarea',
  'input',
  "[contenteditable='true']",
  "[role='textbox']",
].join(', ');

function holdsMessageSurface(el: Element): boolean {
  return el.matches(MESSAGE_SURFACE_SELECTOR) || el.querySelector(MESSAGE_SURFACE_SELECTOR) !== null;
}

/**
 * A generic `div[role='list']` is only a stories tray if it shows stories.
 * Without this marker the rail candidate list can match the conversation list,
 * and hiding that is the one failure that must not happen.
 */
function looksLikeStoriesTray(el: Element): boolean {
  return (
    el.querySelector(
      "a[href*='/stories/'], [aria-label='Story' i], [aria-label='Stories' i], img[alt*='story' i]",
    ) !== null
  );
}

const REMOVED_ATTR = 'data-di-removed';
const DISPLAY_ATTR = 'data-di-display';

function markRemoved(el: Element, label: string, deps: CleanupDeps): void {
  const html = el as HTMLElement;
  if (!html.hasAttribute(REMOVED_ATTR)) {
    // Remember Instagram's own inline display value (usually empty) so a
    // restore puts back exactly what was there instead of guessing.
    html.setAttribute(DISPLAY_ATTR, html.style.getPropertyValue('display'));
  }
  html.setAttribute(REMOVED_ATTR, label);
  html.style.setProperty('display', 'none', 'important');
  deps.onRemoved?.(label);
}

/**
 * Undo every removal this script made on the current document.
 *
 * Hiding is otherwise one-way for as long as the document lives: Instagram is a
 * single-page app, so turning "allow stories" back on left the tray hidden by a
 * removal from an earlier settings value — it only came back after a reload.
 * Cleanup runs again straight after this, so anything still due to be hidden is
 * hidden again in the same task and never flashes.
 */
export function restoreRemovals(doc: Document): void {
  for (const el of Array.from(doc.querySelectorAll(`[${REMOVED_ATTR}]`))) {
    const html = el as HTMLElement;
    const previous = html.getAttribute(DISPLAY_ATTR);
    html.removeAttribute(REMOVED_ATTR);
    html.removeAttribute(DISPLAY_ATTR);
    if (previous) html.style.setProperty('display', previous);
    else html.style.removeProperty('display');
  }
}

function closestBanner(win: Window, el: Element): Element {
  let node: Element | null = el;
  for (let depth = 0; depth < 4 && node; depth += 1) {
    const role = node.getAttribute('role');
    if (role && REMOVABLE_ROLES.has(role)) return node;
    if (node.parentElement === win.document.body) return node;
    node = node.parentElement;
  }
  return el;
}

export function runCleanup(deps: CleanupDeps): void {
  const { win, resolver } = deps;
  const doc = win.document;
  const settings = deps.getSettings();
  const root = doc.documentElement;
  root.setAttribute('data-di-cleaned', '1');

  // 1. Hide Instagram's own navigation: our five destinations (native bar on iOS, our
  //    injected bar in the extension) are the only navigation now.
  const navSelectors = resolver.currentLayout === 'desktop' ? ['sidebar'] : ['bottomNav'];
  const navContext: RouteContext = { settings, loggedIn: deps.isLoggedIn(), pinId: null, storyUser: deps.getStoryUser?.() };
  for (const key of navSelectors) {
    for (const el of resolver.all(doc, key)) {
      // Hardening, first line of defence: never hide a container holding the
      // message surface. A navigation element that wraps a thread list or a
      // composer is not chrome, whatever it links to — taking it out would blank
      // the inbox or the reply box, the one failure this app must not have.
      if (holdsMessageSurface(el)) continue;

      // Second line: only hide a navigation container that carries several of
      // the routes we block. Some builds wrap the DM inbox in a <nav>, and an
      // empty inbox wrapper still has a single Home link — one dead end is not
      // a navigation bar, and hiding it would blank the screen.
      const blockedPaths = new Set<string>();
      for (const anchor of Array.from(el.querySelectorAll('a[href]'))) {
        const href = anchor.getAttribute('href');
        if (!href) continue;
        try {
          const absolute = new URL(href, win.location.href).href;
          if (routeVerdict(absolute, navContext).action === 'block') {
            blockedPaths.add(normalizePath(absolute));
          }
        } catch {
          /* unparsable href: not evidence of chrome */
        }
      }
      if (blockedPaths.size < 2) continue;
      markRemoved(el, 'ig-nav', deps);
    }
  }

  // 2. Any anchor inside the page chrome that points at a blocked route is
  //    hidden rather than left as a dead end. Anchors inside a DM thread are
  //    left alone: the guard intercepts them, and hiding a friend's link would
  //    look like data loss.
  const ctx: RouteContext = {
    settings,
    loggedIn: deps.isLoggedIn(),
    pinId: null,
    storyUser: deps.getStoryUser?.(),
  };
  const anchors = Array.from(doc.querySelectorAll('a[href]'));
  for (const anchor of anchors) {
    if (anchor.closest('[data-di-keep]')) continue;
    const href = anchor.getAttribute('href');
    if (!href) continue;
    let absolute: string;
    try {
      absolute = new URL(href, win.location.href).href;
    } catch {
      continue;
    }
    if (!absolute.includes('instagram.com') && !href.startsWith('/')) continue;
    const path = normalizePath(absolute);
    // These are deliberate selection targets. The guard pins them on a tap;
    // hiding every unselected friend would remove the entire Stories tray.
    if (settings.allowStories && storyUserForPath(path)) continue;
    const inThread = anchor.closest("[role='dialog'], article, main");
    // A single post or reel someone sent you is the one thing this app exists to
    // keep: the guard arms a pin when it is tapped, so the link must stay
    // tappable. Without this a `/reel/<id>` link in a thread was hidden before
    // the click could arm its pin (only `/p/` was exempt), and the promise
    // "watch the reel a friend sent you" broke at the first tap.
    const sentItem = reelIdForPath(path) !== null;
    if (inThread && sentItem && settings.allowReelsFromDms) continue;
    if (routeVerdict(path, ctx).action === 'block') {
      markRemoved(anchor, 'blocked-link', deps);
    }
  }

  // 3. App-install banners and upsells ("Use the app" is the mobile-web nag
  //    shown by Instagram’s mobile website).
  const candidates = Array.from(doc.querySelectorAll('div, span, section, h2, p, a'));
  for (const el of candidates) {
    if (el.children.length > 0) continue;
    const text = (el.textContent ?? '').trim().toLowerCase();
    if (text.length === 0 || text.length > 40) continue;
    if (!UPSell_PHRASES.some((phrase) => text.includes(phrase))) continue;
    const banner = closestBanner(win, el);
    // The close button of this nag usually sits on the inbox, and a shallow
    // page can make `closestBanner` climb to a wrapper that holds the whole
    // screen. Never let the nag take the message surface down with it.
    if (holdsMessageSurface(banner)) continue;
    markRemoved(banner, 'app-banner', deps);
  }

  // 4. Stories: when disabled, hide the tray so there is no tap target.
  if (!settings.allowStories) {
    for (const el of resolver.all(doc, 'storiesRail')) {
      if (holdsMessageSurface(el)) continue;
      // Fail open: an unmarked list stays visible rather than risk hiding the
      // conversation list, which is a `div[role='list']` too.
      if (!looksLikeStoriesTray(el)) continue;
      markRemoved(el, 'stories', deps);
    }
  }

  // 5. Desktop: the "Watch more reels" style cards inside a post modal.
  if (resolver.currentLayout === 'desktop') {
    for (const el of resolver.all(doc, 'upNextCard')) {
      markRemoved(el, 'up-next', deps);
    }
  }
}
