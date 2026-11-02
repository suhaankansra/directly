import { describe, expect, it } from 'vitest';
import {
  normalizePath,
  pathForTab,
  reelIdForPath,
  routeVerdict,
  tabForPath,
  type RouteContext,
} from '../src/routes';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';

type CtxOverrides = {
  settings?: Partial<Settings>;
  loggedIn?: boolean;
  pinId?: string | null;
};

function ctx(over: CtxOverrides = {}): RouteContext {
  return {
    settings: { ...DEFAULT_SETTINGS, ...(over.settings ?? {}) },
    loggedIn: over.loggedIn ?? true,
    pinId: over.pinId ?? null,
  };
}

function action(url: string, context: RouteContext = ctx()): string {
  return routeVerdict(url, context).action;
}

describe('normalizePath', () => {
  it('strips query and hash', () => {
    expect(normalizePath('https://www.instagram.com/direct/inbox/?x=1#y')).toBe('/direct/inbox');
    expect(normalizePath('/direct/t/1/?next=/reels/')).toBe('/direct/t/1');
  });

  it('decodes percent escapes once, then re-normalises dot segments', () => {
    expect(normalizePath('/%65xplore/')).toBe('/explore');
    expect(normalizePath('/%2e%2e/explore')).toBe('/explore');
    expect(normalizePath('/a/../explore/')).toBe('/explore');
  });

  it('collapses duplicate slashes and lowercases', () => {
    expect(normalizePath('//DIRECT//inbox//')).toBe('/direct/inbox');
  });

  it('returns / for malformed escapes, which is always blocked', () => {
    expect(normalizePath('/%E0%A4%A')).toBe('/');
    expect(normalizePath('')).toBe('/');
  });
});

describe('DMs', () => {
  it.each(['/direct/inbox/', '/direct/t/1234567890/', '/direct/new/', '/direct/requests/'])(
    'allows %s',
    (url) => {
      expect(action(url)).toBe('allow');
    },
  );

  it('allows /direct without a trailing slash', () => {
    expect(action('/direct')).toBe('allow');
  });

  it('does not treat /direct/inbox/ as the profile of a user named "direct"', () => {
    expect(routeVerdict('/direct/inbox/', ctx())).toMatchObject({ action: 'allow', reason: 'direct' });
  });
});

describe('home, explore, search and the reels tab', () => {
  it.each(['/', 'https://www.instagram.com/', '/?hl=en'])('blocks the feed (%s)', (url) => {
    expect(routeVerdict(url, ctx())).toMatchObject({ action: 'block', reason: 'home-feed' });
  });

  it.each(['/explore/', '/explore/tags/cats/', '/explore/locations/nyc/'])(
    'blocks explore (%s)',
    (url) => {
      expect(routeVerdict(url, ctx())).toMatchObject({ action: 'block', reason: 'explore' });
    },
  );

  it('blocks the search grid', () => {
    expect(routeVerdict('/explore/search/', ctx())).toMatchObject({ action: 'block', reason: 'search' });
  });

  it.each(['/reels/', '/reels/audio/123/', '/reels/audio_track/1/'])('blocks the reels tab (%s)', (url) => {
    expect(routeVerdict(url, ctx())).toMatchObject({ action: 'block', reason: 'reels-tab' });
  });

  it('always redirects a blocked route to the inbox', () => {
    const verdict = routeVerdict('/reels/', ctx());
    expect(verdict.action === 'block' && verdict.redirect).toBe('/direct/inbox/');
  });
});

describe('reels and posts are conditional on the pin', () => {
  it('blocks a reel when nothing is pinned', () => {
    expect(routeVerdict('/reel/Cabc123/', ctx())).toMatchObject({
      action: 'block',
      reason: 'not-pinned',
    });
  });

  it('allows the pinned reel', () => {
    expect(action('/reel/Cabc123/', ctx({ pinId: 'Cabc123' }))).toBe('allow');
  });

  it('is case-insensitive about the pin', () => {
    expect(action('/reel/Cabc123/', ctx({ pinId: 'cabc123' }))).toBe('allow');
  });

  it('blocks a different reel while one is pinned', () => {
    expect(action('/reel/other/', ctx({ pinId: 'Cabc123' }))).toBe('block');
  });

  it('treats /reels/<code>/ as the same single item when pinned (D019)', () => {
    expect(action('/reels/Cabc123/', ctx({ pinId: 'Cabc123' }))).toBe('allow');
  });

  it('blocks /reels/<code>/ when not pinned, because it is also the tab form', () => {
    expect(action('/reels/Cabc123/', ctx())).toBe('block');
  });

  it('applies the same rule to single posts', () => {
    expect(action('/p/Cxyz/', ctx({ pinId: 'Cxyz' }))).toBe('allow');
    expect(action('/p/Cother/', ctx({ pinId: 'Cxyz' }))).toBe('block');
  });

  it('blocks reels and posts entirely in strict mode', () => {
    const strict = ctx({ pinId: 'Cabc123', settings: { allowReelsFromDms: false } });
    expect(routeVerdict('/reel/Cabc123/', strict)).toMatchObject({
      action: 'block',
      reason: 'reels-disabled',
    });
    expect(routeVerdict('/p/Cabc123/', strict)).toMatchObject({ action: 'block' });
  });

  it('blocks a reel deep link with no DM origin (no pin)', () => {
    expect(action('/reel/Cdeep/', ctx({ pinId: null }))).toBe('block');
  });
});

describe('stories', () => {
  it('blocks stories by default', () => {
    expect(routeVerdict('/stories/alice/123/', ctx())).toMatchObject({
      action: 'block',
      reason: 'stories-disabled',
    });
  });

  it('allows stories when the setting is on', () => {
    expect(action('/stories/alice/123/', ctx({ settings: { allowStories: true } }))).toBe('allow');
  });
});

describe('login and account surfaces', () => {
  it.each([
    '/accounts/login/',
    '/accounts/login/two_factor/',
    '/accounts/password/reset/',
    '/challenge/1234/',
    '/accounts/edit/',
    '/accounts/privacy_and_security/',
    '/accounts/suspended/',
    '/oauth/authorize/',
  ])('allows %s so the user is never locked out', (url) => {
    expect(action(url)).toBe('allow');
  });

  it('blocks account creation', () => {
    expect(routeVerdict('/accounts/emailsignup/', ctx())).toMatchObject({ action: 'block', reason: 'signup' });
  });

  it('keeps the login page allowed even when it carries a blocked next= target', () => {
    expect(action('/accounts/login/?next=%2Freels%2F')).toBe('allow');
  });

  it('blocks the activity dashboard', () => {
    expect(action('/accounts/your_activity/')).toBe('block');
  });

  it('blocks unknown /accounts routes when logged in', () => {
    expect(action('/accounts/something_new/')).toBe('block');
  });
});

describe('profiles and legal pages', () => {
  it.each(['/alice/', '/alice/reels/', '/alice/tagged/', '/alice/followers/'])('allows %s', (url) => {
    expect(action(url)).toBe('allow');
  });

  it('allows legal and privacy pages', () => {
    expect(action('/legal/privacy/')).toBe('allow');
    expect(action('/about/')).toBe('allow');
  });

  it('does not mistake a reserved first segment for a username', () => {
    expect(action('/explore/')).toBe('block');
    expect(action('/reels/')).toBe('block');
    expect(action('/stories/')).toBe('block');
  });
});

describe('unknown routes fail closed when logged in, open when logged out', () => {
  it('blocks unknown paths for a logged-in user', () => {
    expect(routeVerdict('/something/unknown/here/', ctx({ loggedIn: true }))).toMatchObject({
      action: 'block',
      reason: 'unknown-route',
    });
  });

  it('allows them while logged out so a login flow can finish', () => {
    expect(action('/something/unknown/here/', ctx({ loggedIn: false }))).toBe('allow');
  });
});

describe('tabForPath', () => {
  it('maps routes to our four tabs', () => {
    expect(tabForPath('/direct/inbox/')).toBe('inbox');
    expect(tabForPath('/direct/t/1/')).toBe('inbox');
    expect(tabForPath('/accounts/activity/')).toBe('activity');
    expect(tabForPath('/alice/')).toBe('profile');
  });

  it('returns null for blocked and neutral routes', () => {
    expect(tabForPath('/')).toBeNull();
    expect(tabForPath('/explore/')).toBeNull();
    expect(tabForPath('/reel/abc/')).toBeNull();
  });

  it('builds tab paths, falling back to the inbox without a username', () => {
    expect(pathForTab('inbox')).toBe('/direct/inbox/');
    expect(pathForTab('activity')).toBe('/accounts/activity/');
    expect(pathForTab('profile')).toBe('/direct/inbox/');
    expect(pathForTab('profile', 'alice')).toBe('/alice/');
  });
});

describe('reelIdForPath', () => {
  it('reads an id from reel, reels and p paths', () => {
    expect(reelIdForPath('/reel/Cabc/')).toBe('Cabc');
    expect(reelIdForPath('/reels/Cabc/')).toBe('Cabc');
    expect(reelIdForPath('/p/Cabc/')).toBe('Cabc');
  });

  it('returns null for the tab, audio and non-media routes', () => {
    expect(reelIdForPath('/reels/')).toBeNull();
    expect(reelIdForPath('/reels/audio/123/')).toBeNull();
    expect(reelIdForPath('/direct/inbox/')).toBeNull();
  });
});
