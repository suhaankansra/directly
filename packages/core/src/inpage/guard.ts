/**
 * In-page route guard (layer 2 of 2).
 *
 * Instagram is a single-page app: almost every navigation goes through
 * `history.pushState`/`replaceState` or a `popstate`, so the host hook alone
 * never sees them. We patch those before Instagram's own scripts run
 * (`document_start`) and intercept clicks on links to blocked paths.
 *
 * A blocked navigation is not merely rewritten in the URL bar — the SPA has
 * already decided what to render, so the only fail-closed answer is to make the
 * document load the inbox (D017). `navigate` is injected so this module is
 * testable without a real browser.
 */

import { INBOX_PATH, routeVerdict, type RouteContext, type Verdict } from '../routes.js';
import type { Settings } from '../settings.js';

type BlockedVerdict = Extract<Verdict, { action: 'block' }>;

export type GuardDeps = {
  win: Window;
  getSettings: () => Settings;
  isLoggedIn: () => boolean;
  getPin: () => string | null;
  onBlocked: (verdict: BlockedVerdict) => void;
  /**
   * Called with the candidate path *before* it is evaluated, so the host can
   * arm a reel pin when the navigation starts inside a DM or a profile. Without
   * this a reel tapped in a thread would be blocked before its pin exists.
   */
  beforeCheck?: (path: string) => void;
  /** Called after every navigation we allowed through. */
  onNavigate?: (url: string) => void;
  /** Defaults to `location.replace`. */
  navigate?: (path: string) => void;
};

export type RouteGuard = {
  check: (url?: string) => boolean;
  dispose: () => void;
  lastVerdict: () => Verdict | null;
};

const SITE_HOSTS = new Set(['instagram.com', 'www.instagram.com']);

function isSameSite(url: URL, win: Window): boolean {
  if (SITE_HOSTS.has(url.hostname)) return true;
  try {
    return url.origin === win.location.origin;
  } catch {
    return false;
  }
}

export function installRouteGuard(deps: GuardDeps): RouteGuard {
  const { win } = deps;
  const doc = win.document;
  const history = win.history;
  const originalPush = history.pushState.bind(history);
  const originalReplace = history.replaceState.bind(history);
  const navigate = deps.navigate ?? ((path: string) => win.location.replace(path));

  let lastVerdict: Verdict | null = null;
  let disposed = false;
  let redirecting = false;

  const context = (): RouteContext => ({
    get settings() {
      return deps.getSettings();
    },
    get loggedIn() {
      return deps.isLoggedIn();
    },
    get pinId() {
      return deps.getPin();
    },
  });

  function evaluate(rawUrl: string): Verdict {
    const verdict = routeVerdict(rawUrl, context());
    lastVerdict = verdict;
    return verdict;
  }

  function goHome(verdict: BlockedVerdict): void {
    if (redirecting) return;
    redirecting = true;
    try {
      deps.onBlocked(verdict);
      navigate(verdict.redirect || INBOX_PATH);
    } finally {
      // Re-entrancy guard only: if following the redirect synchronously routes
      // again, it must not recurse. A later, separate navigation still redirects.
      redirecting = false;
    }
  }

  function check(url?: string): boolean {
    if (disposed) return true;
    const target = url ?? win.location.href;
    deps.beforeCheck?.(target);
    const verdict = evaluate(target);
    if (verdict.action === 'block') {
      goHome(verdict);
      return false;
    }
    return true;
  }

  const patchedPush: typeof history.pushState = function pushState(state, title, url) {
    if (url !== undefined && url !== null) {
      const resolved = resolveUrl(win, url);
      if (resolved) deps.beforeCheck?.(resolved);
      if (resolved && !check(resolved)) return;
    }
    originalPush(state, title, url as string | URL | null);
    deps.onNavigate?.(win.location.href);
  };

  const patchedReplace: typeof history.replaceState = function replaceState(state, title, url) {
    if (url !== undefined && url !== null) {
      const resolved = resolveUrl(win, url);
      if (resolved) {
        deps.beforeCheck?.(resolved);
        const verdict = evaluate(resolved);
        if (verdict.action === 'block') {
          // Keep the address bar out of the blocked route without a reload (a
          // reload here would fight Instagram's own state churn).
          originalReplace(state, title, verdict.redirect);
          deps.onBlocked(verdict);
          return;
        }
      }
    }
    originalReplace(state, title, url as string | URL | null);
    deps.onNavigate?.(win.location.href);
  };

  history.pushState = patchedPush;
  history.replaceState = patchedReplace;

  function onPopState(): void {
    if (!check()) return;
    deps.onNavigate?.(win.location.href);
  }

  function onClick(event: Event): void {
    if (disposed || event.defaultPrevented) return;
    const target = event.target as Element | null;
    if (!target || typeof target.closest !== 'function') return;
    const anchor = target.closest('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#')) return;

    let url: URL;
    try {
      url = new URL(href, win.location.href);
    } catch {
      return;
    }
    if (!isSameSite(url, win)) return;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

    deps.beforeCheck?.(url.href);
    const verdict = evaluate(url.href);
    if (verdict.action === 'block') {
      event.preventDefault();
      event.stopPropagation();
      goHome(verdict);
    }
  }

  win.addEventListener('popstate', onPopState, true);
  doc.addEventListener('click', onClick, true);

  return {
    check,
    lastVerdict: () => lastVerdict,
    dispose: () => {
      disposed = true;
      history.pushState = originalPush;
      history.replaceState = originalReplace;
      win.removeEventListener('popstate', onPopState, true);
      doc.removeEventListener('click', onClick, true);
    },
  };
}

function resolveUrl(win: Window, url: string | URL): string | null {
  try {
    return new URL(String(url), win.location.href).href;
  } catch {
    return null;
  }
}
