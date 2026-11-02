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

import { normalizePath, routeVerdict, type RouteContext } from '../routes.js';
import type { Settings } from '../settings.js';
import type { SelectorResolver } from './selector.js';

export type CleanupDeps = {
  win: Window;
  resolver: SelectorResolver;
  getSettings: () => Settings;
  isLoggedIn: () => boolean;
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

function markRemoved(el: Element, label: string, deps: CleanupDeps): void {
  const html = el as HTMLElement;
  html.setAttribute('data-oo-removed', label);
  html.style.setProperty('display', 'none', 'important');
  deps.onRemoved?.(label);
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
  root.setAttribute('data-oo-cleaned', '1');

  // 1. Hide Instagram's own navigation: our four tabs (native bar on iOS, our
  //    injected bar in the extension) are the only navigation now.
  const navSelectors = resolver.currentLayout === 'desktop' ? ['sidebar'] : ['bottomNav'];
  for (const key of navSelectors) {
    for (const el of resolver.all(doc, key)) {
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
  };
  const anchors = Array.from(doc.querySelectorAll('a[href]'));
  for (const anchor of anchors) {
    if (anchor.closest('[data-oo-keep]')) continue;
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
    const inThread = anchor.closest("[role='dialog'], article, main");
    if (inThread && path.startsWith('/p/')) continue;
    if (routeVerdict(path, ctx).action === 'block') {
      markRemoved(anchor, 'blocked-link', deps);
    }
  }

  // 3. App-install banners and upsells ("Use the app" is the mobile-web nag
  //    visible in the reference recording).
  const candidates = Array.from(doc.querySelectorAll('div, span, section, h2, p, a'));
  for (const el of candidates) {
    if (el.children.length > 0) continue;
    const text = (el.textContent ?? '').trim().toLowerCase();
    if (text.length === 0 || text.length > 40) continue;
    if (!UPSell_PHRASES.some((phrase) => text.includes(phrase))) continue;
    markRemoved(closestBanner(win, el), 'app-banner', deps);
  }

  // 4. Stories: when disabled, hide the tray so there is no tap target.
  if (!settings.allowStories) {
    for (const el of resolver.all(doc, 'storiesRail')) {
      if (el.querySelector("a[href^='/direct/']")) continue;
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
