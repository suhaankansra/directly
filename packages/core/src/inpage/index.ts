/**
 * In-page bootstrap. This is what the extension injects and what the iOS
 * WebView evaluates after every navigation.
 *
 * Contract: never throw into Instagram's page, never read message content, never
 * touch credentials. If anything fails, we fail closed for routes and open for
 * cosmetics (D017).
 */

import { parseHostMessage, PROTOCOL_VERSION, type PageMessage } from '../bridge.js';
import {
  INBOX_PATH,
  isProfilePath,
  normalizePath,
  reelIdForPath,
  tabForPath,
  type Layout,
  type TabId,
} from '../routes.js';
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from '../settings.js';
import { runCleanup } from './cleanup.js';
import { installRouteGuard, type RouteGuard } from './guard.js';
import { createNavBar, type NavBar } from './navBar.js';
import { createObserver, type Observer } from './observer.js';
import { installReelLock, type ReelLock } from './reelLock.js';
import { detectLayout, SelectorResolver } from './selector.js';
import { bootOverlay, injectStyles } from './styles.js';
import { createToast, type Toast } from './toast.js';

export const CORE_VERSION = '0.1.0';

/** Marker the extension and the iOS host use to confirm injection. */
export const GLOBAL_KEY = '__directly';

export type BootOptions = {
  win?: Window;
  host?: 'ios' | 'extension' | 'manual';
  settings?: Partial<Settings>;
  /** Where page → host messages go. Defaults to the RN bridge, else postMessage. */
  post?: (message: PageMessage) => void;
  /** Opens the settings surface (extension options page). */
  openSettings?: () => void;
  showNav?: boolean;
  /** Injectable for tests: default `location.replace`. */
  navigate?: (path: string) => void;
  loggedIn?: () => boolean;
  /** Initial pin, for a full document load that came from a DM. */
  initialPin?: string | null;
};

export type Booted = {
  version: string;
  guard: RouteGuard;
  reelLock: ReelLock;
  nav: NavBar | null;
  settings: () => Settings;
  applySettings: (next: unknown) => void;
  setPin: (id: string | null) => void;
  pin: () => string | null;
  layout: () => Layout;
  refresh: () => void;
  destroy: () => void;
  diagnostics: () => unknown;
};

type BridgeWindow = Window & {
  ReactNativeWebView?: { postMessage: (payload: string) => void };
  webkit?: { messageHandlers?: Record<string, { postMessage: (payload: unknown) => void }> };
};

function defaultPost(win: Window): (message: PageMessage) => void {
  return (message: PageMessage) => {
    const bridge = win as BridgeWindow;
    try {
      if (bridge.ReactNativeWebView?.postMessage) {
        bridge.ReactNativeWebView.postMessage(JSON.stringify(message));
        return;
      }
      const handler = bridge.webkit?.messageHandlers?.['directly'];
      if (handler?.postMessage) {
        handler.postMessage(message);
        return;
      }
      win.postMessage(message, win.location.origin);
    } catch {
      /* never break the page because a bridge is missing */
    }
  };
}

function guessLoggedIn(doc: Document, win: Window): boolean {
  try {
    if (/ds_user_id=/.test(doc.cookie)) return true;
  } catch {
    /* cookies can be blocked */
  }
  if (doc.querySelector('a[href^="/direct/inbox/"]')) return true;
  if (doc.querySelector('input[name="username"]')) return false;
  // Assume a session: an unknown route is then blocked rather than allowed.
  return win.location.pathname !== '/accounts/login/';
}

export function boot(options: BootOptions = {}): Booted {
  const win = options.win ?? window;
  const doc = win.document;
  const host = options.host ?? 'extension';

  let settings: Settings = mergeSettings(options.settings, DEFAULT_SETTINGS);
  let pin: string | null = options.initialPin ?? null;

  const resolver = new SelectorResolver(detectLayout(win));
  const toast: Toast = createToast(win);
  const overlay = bootOverlay(doc);
  injectStyles(doc);

  const post = options.post ?? defaultPost(win);

  function isLoggedIn(): boolean {
    return options.loggedIn ? options.loggedIn() : guessLoggedIn(doc, win);
  }

  const reelLock: ReelLock = installReelLock({
    win,
    resolver,
    layout: () => resolver.currentLayout,
    onChange: (id) => {
      pin = id;
    },
  });

  if (pin) reelLock.arm(pin);

  function armFromTransition(target: string): void {
    if (pin !== null) return;
    if (!settings.allowReelsFromDms) return;
    const id = reelIdForPath(target);
    if (!id) return;
    const from = normalizePath(win.location.href);
    const fromAllowedSurface = from.startsWith('/direct') || isProfilePath(from);
    if (!fromAllowedSurface) return;
    pin = id;
    reelLock.arm(id);
  }

  function cleanupNow(): void {
    try {
      runCleanup({
        win,
        resolver,
        getSettings: () => settings,
        isLoggedIn,
      });
    } catch {
      /* cosmetic only */
    }
  }

  const observer: Observer = createObserver({ win, onMutate: () => {
    try {
      reelLock.tick();
      cleanupNow();
    } catch {
      /* never break the page */
    }
  } });

  function currentLayout(): Layout {
    const layout = detectLayout(win);
    if (layout !== resolver.currentLayout) {
      resolver.setLayout(layout);
      nav?.setLayout(layout);
    }
    return resolver.currentLayout;
  }

  const nav: NavBar | null =
    options.showNav === false || host === 'ios'
      ? null
      : createNavBar({
          win,
          layout: () => resolver.currentLayout,
          labels: () => settings.navLabels,
          onNavigate: (tab: TabId) => {
            const target = tab === 'profile' ? profilePath(doc) : tabPath(tab);
            if (!target) return;
            navigate(target);
          },
          onOpenSettings: () => {
            try {
              options.openSettings?.();
            } catch {
              /* ignore */
            }
          },
        });

  if (nav) {
    nav.mount();
    nav.setLayout(resolver.currentLayout);
  }

  function navigate(path: string): void {
    if (options.navigate) {
      options.navigate(path);
      return;
    }
    win.location.assign(path);
  }

  function profilePath(doc: Document): string | null {
    // Read the logged-in username from the page's own links; we never touch
    // storage or credentials for this.
    const anchor = doc.querySelector<HTMLAnchorElement>("a[href^='/'][role='link'] img[alt*='profile']");
    const href = anchor?.parentElement?.getAttribute('href');
    if (href && /^\/[A-Za-z0-9._]+\/$/.test(href)) return href;
    return null;
  }

  function tabPath(tab: TabId): string | null {
    if (tab === 'inbox') return INBOX_PATH;
    if (tab === 'activity') return '/accounts/activity/';
    if (tab === 'profile') return null;
    return null;
  }

  let lastAccount: string | null | undefined;

  /**
   * The signed-in username, read from a profile link that Instagram already
   * renders. Used only to show "signed in as …" in the Lock tab — never stored,
   * never sent anywhere else, never used for a request.
   */
  function detectAccount(): string | null {
    const anchors = Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href^='/'][role='link']"));
    const candidates: string[] = [];
    for (const anchor of anchors) {
      const match = /^\/([A-Za-z0-9._]{1,30})\/$/.exec(anchor.getAttribute('href') ?? '');
      if (!match) continue;
      const name = match[1];
      if (!name) continue;
      candidates.push(name);
      if (anchor.querySelector("img[alt*='profile' i]")) return name;
    }
    return candidates[0] ?? null;
  }

  function publishAccount(): void {
    const username = detectAccount();
    if (username === lastAccount) return;
    lastAccount = username;
    post({ v: 1, type: 'di:account', username });
  }

  function publishUrl(): void {
    const path = normalizePath(win.location.href);
    post({ v: 1, type: 'di:url', path, layout: currentLayout(), pinId: pin });
    post({ v: 1, type: 'di:tab', tab: tabForPath(path) });
    nav?.sync(win.location.href);
    publishAccount();
  }

  const guard: RouteGuard = installRouteGuard({
    win,
    getSettings: () => settings,
    isLoggedIn,
    getPin: () => pin,
    beforeCheck: (target) => {
      try {
        armFromTransition(target);
      } catch {
        /* ignore */
      }
    },
    onNavigate: () => {
      handleRouteChange();
    },
    onBlocked: (verdict) => {
      if (settings.debug) {
        // eslint-disable-next-line no-console
        console.debug('[directly] blocked', verdict.reason, verdict.path);
      }
      post({ v: 1, type: 'di:blocked', path: verdict.path, reason: verdict.reason });
      if (settings.showBlockToast) toast.show('Directly — that’s not here');
    },
  });

  function handleRouteChange(): void {
    try {
      const path = normalizePath(win.location.href);
      const id = reelIdForPath(path);
      // Ids are compared case-insensitively: the pin keeps the id as written in
      // the URL, while the normalised path is lowercased.
      const sameId = id !== null && pin !== null && id.toLowerCase() === pin.toLowerCase();
      if (!id && pin !== null) {
        pin = null;
        reelLock.disarm();
      } else if (id && pin !== null && !sameId) {
        // The guard should already have stopped this; belt and braces.
        pin = null;
        reelLock.disarm();
      }
      observer.flush();
      cleanupNow();
      publishUrl();
      overlay.ready();
    } catch {
      /* never break the page */
    }
  }

  // ---------------------------------------------------------------- host in
  function onWindowMessage(event: MessageEvent): void {
    if (event.source !== win) return;
    if (event.origin !== win.location.origin) return;
    const message = parseHostMessage(event.data);
    if (!message) return;
    applyHostMessage(message);
  }

  function applyHostMessage(message: ReturnType<typeof parseHostMessage>): void {
    if (!message) return;
    switch (message.type) {
      case 'di:settings':
        settings = message.settings;
        observer.flush();
        cleanupNow();
        break;
      case 'di:navigate':
        navigate(message.path);
        break;
      case 'di:pin':
        pin = message.id;
        if (message.id) reelLock.arm(message.id);
        else reelLock.disarm();
        break;
    }
  }

  win.addEventListener('message', onWindowMessage);

  // --------------------------------------------------------------- lifecycle
  observer.start();
  guard.check(win.location.href);
  handleRouteChange();
  overlay.ready();

  const api: Booted = {
    version: CORE_VERSION,
    guard,
    reelLock,
    nav,
    settings: () => settings,
    applySettings: (next: unknown) => {
      settings = mergeSettings(next, settings);
      observer.flush();
      cleanupNow();
    },
    setPin: (id: string | null) => {
      pin = id;
      if (id) reelLock.arm(id);
      else reelLock.disarm();
    },
    pin: () => pin,
    layout: currentLayout,
    refresh: handleRouteChange,
    diagnostics: () => ({
      version: CORE_VERSION,
      protocol: PROTOCOL_VERSION,
      layout: resolver.currentLayout,
      pin,
      settings,
      url: win.location.href,
    }),
    destroy: () => {
      try {
        observer.dispose();
        guard.dispose();
        reelLock.dispose();
        nav?.destroy();
        toast.destroy();
        win.removeEventListener('message', onWindowMessage);
      } catch {
        /* ignore */
      }
    },
  };

  // The extension's popup and the iOS host both expect a stable global handle.
  (win as unknown as Record<string, unknown>)[GLOBAL_KEY] = {
    boot: (next: BootOptions = {}) => boot({ ...next, win }),
    applyHostMessage: (payload: unknown) => applyHostMessage(parseHostMessage(payload)),
    api,
  };

  return api;
}
