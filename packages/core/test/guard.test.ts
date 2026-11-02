import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reelIdForPath } from '../src/routes';
import { installRouteGuard, type RouteGuard } from '../src/inpage/guard';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';

type Harness = {
  guard: RouteGuard;
  navigate: ReturnType<typeof vi.fn>;
  onBlocked: ReturnType<typeof vi.fn>;
  beforeCheck: ReturnType<typeof vi.fn>;
  onNavigate: ReturnType<typeof vi.fn>;
  /** Escape hatch: set the URL without going through the patched history. */
  forceUrl: (url: string) => void;
  setPin: (id: string | null) => void;
};

let pin: string | null = null;
let settings: Settings = DEFAULT_SETTINGS;
let activeGuard: RouteGuard | null = null;

function setup(): Harness {
  activeGuard?.dispose();
  const originalReplace = window.history.replaceState.bind(window.history);
  const originalPush = window.history.pushState.bind(window.history);
  originalReplace({}, '', '/direct/inbox/');
  pin = null;
  settings = { ...DEFAULT_SETTINGS };

  const navigate = vi.fn();
  const onBlocked = vi.fn();
  const beforeCheck = vi.fn();
  const onNavigate = vi.fn();

  const guard = installRouteGuard({
    win: window,
    getSettings: () => settings,
    isLoggedIn: () => true,
    getPin: () => pin,
    onBlocked,
    onNavigate,
    beforeCheck: (path) => {
      beforeCheck(path);
      if (pin === null && window.location.pathname.startsWith('/direct/')) {
        pin = reelIdForPath(path);
      }
    },
    navigate,
  });

  activeGuard = guard;

  return {
    guard,
    navigate,
    onBlocked,
    beforeCheck,
    onNavigate,
    forceUrl: (url: string) => {
      if (url.startsWith('/direct/') || url === '/') originalReplace({}, '', url);
      else originalPush({}, '', url);
    },
    setPin: (id: string | null) => {
      pin = id;
    },
  };
}

describe('history patches', () => {
  let h: Harness;
  beforeEach(() => {
    h = setup();
  });

  it('lets an allowed navigation through and reports it', () => {
    h.guard.check('/direct/inbox/');
    window.history.pushState({}, '', '/direct/t/42/');
    expect(h.navigate).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/direct/t/42/');
    expect(h.onNavigate).toHaveBeenCalled();
  });

  it('blocks pushState to the feed and redirects instead of navigating', () => {
    window.history.pushState({}, '', '/');
    expect(h.navigate).toHaveBeenCalledWith('/direct/inbox/');
    expect(h.onBlocked).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/direct/inbox/');
  });

  it('blocks pushState to /explore/ and /reels/', () => {
    h.guard.check('/direct/inbox/');
    window.history.pushState({}, '', '/explore/');
    expect(h.navigate).toHaveBeenLastCalledWith('/direct/inbox/');
    h.navigate.mockClear();
    window.history.pushState({}, '', '/reels/');
    expect(h.navigate).toHaveBeenCalledWith('/direct/inbox/');
  });

  it('rewrites the URL on a blocked replaceState without a reload', () => {
    window.history.replaceState({}, '', '/explore/tags/cats/');
    expect(h.onBlocked).toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/direct/inbox/');
  });

  it('allows the pinned reel and blocks a different one', () => {
    h.setPin('Cabc');
    window.history.pushState({}, '', '/reel/Cabc/');
    expect(h.navigate).not.toHaveBeenCalled();

    window.history.pushState({}, '', '/reel/Cother/');
    expect(h.navigate).toHaveBeenCalledWith('/direct/inbox/');
  });

  it('arms a pin when a reel is opened from a DM (beforeCheck runs first)', () => {
    h.guard.check('/direct/inbox/');
    window.history.pushState({}, '', '/reel/Csent/');
    expect(h.beforeCheck).toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(pin).toBe('Csent');
  });

  it('does not arm a pin from an unrelated page', () => {
    h.forceUrl('/accounts/login/');
    h.guard.check();
    window.history.pushState({}, '', '/reel/Cdeep/');
    expect(pin).toBeNull();
    expect(h.navigate).toHaveBeenCalledWith('/direct/inbox/');
  });
});

describe('clicks', () => {
  let h: Harness;
  beforeEach(() => {
    h = setup();
    document.body.innerHTML = '<a id="ok" href="/direct/t/9/">ok</a><a id="bad" href="/explore/">bad</a>';
  });

  it('intercepts a link to a blocked route', () => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const bad = document.getElementById('bad')!;
    bad.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(h.navigate).toHaveBeenCalledWith('/direct/inbox/');
  });

  it('leaves allowed links alone', () => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.getElementById('ok')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(h.navigate).not.toHaveBeenCalled();
  });
});

describe('other entry points', () => {
  it('blocks popstate onto a blocked route', () => {
    const h = setup();
    h.forceUrl('/explore/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(h.navigate).toHaveBeenCalledWith('/direct/inbox/');
  });

  it('check() reports whether the current URL is allowed', () => {
    const h = setup();
    expect(h.guard.check('/direct/inbox/')).toBe(true);
    expect(h.guard.check('/explore/')).toBe(false);
  });

  it('dispose() restores the original history functions', () => {
    const h = setup();
    h.guard.dispose();
    window.history.pushState({}, '', '/explore/');
    expect(h.navigate).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/explore/');
  });

  it('redirects on each blocked navigation rather than swallowing later ones', () => {
    const h = setup();
    window.history.pushState({}, '', '/explore/');
    window.history.pushState({}, '', '/reels/');
    expect(h.navigate).toHaveBeenCalledTimes(2);
  });
});
