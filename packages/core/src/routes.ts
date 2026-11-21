/**
 * Route allow/block rules. Pure functions, no DOM — unit-tested in
 * test/routes.test.ts and reused verbatim by the iOS WebView host layer, the
 * in-page guard and the extension's background navigation hook.
 *
 * Semantics are fixed by docs/02-architecture.md §4.1:
 *   - match on pathname only (query + hash are dropped, so they can never
 *     smuggle a blocked route through)
 *   - percent-decode once, collapse duplicate slashes, resolve dot segments
 *   - lowercase for matching (Instagram paths are case-insensitive)
 *   - block beats conditional beats allow; unknown → block when logged in,
 *     allow when logged out so the login flow can never be trapped
 */

import type { Settings } from './settings.js';

/** Canonical home. Every blocked navigation lands here. */
export const INBOX_PATH = '/direct/inbox/';
export const ACTIVITY_PATH = '/accounts/activity/';

export type Layout = 'mobile' | 'desktop';
export type TabId = 'inbox' | 'stories' | 'activity' | 'profile' | 'more';

export type BlockReason =
  | 'home-feed'
  | 'explore'
  | 'search'
  | 'reels-tab'
  | 'not-pinned'
  | 'reels-disabled'
  | 'stories-disabled'
  | 'story-not-pinned'
  | 'signup'
  | 'unknown-route';

export type Verdict =
  | { action: 'allow'; reason: string; path: string }
  | { action: 'block'; reason: BlockReason; path: string; redirect: string };

export type RouteContext = {
  /** The single reel/post id currently opened from a DM, if any (D012). */
  pinId?: string | null;
  /**
   * The one friend whose story the user chose from our Stories list. Stories
   * stay off by default; when on, only this handle's story is allowed until
   * `storiesAutoAdvance` is enabled (D033).
   */
  storyUser?: string | null;
  /** People already exposed in the story list; never authorize a guessed next user. */
  storyUsers?: readonly string[];
  settings: Settings;
  /** Whether a session exists. Only used for the unknown-route fallback. */
  loggedIn: boolean;
};

/**
 * First path segments that must never be read as a username, so that
 * `/direct/inbox/` can never be mistaken for the profile of a user named
 * "direct" (docs/02-architecture.md §4.1).
 */
const RESERVED = new Set([
  'direct',
  'accounts',
  'account',
  'explore',
  'reels',
  'reel',
  'p',
  'tv',
  'stories',
  'about',
  'legal',
  'privacy',
  'developer',
  'api',
  'session',
  'web',
  'challenge',
  'emailsignup',
  'oauth',
  'terms',
  'help',
  'directory',
  'your_activity',
  'settings',
  'static',
  'graphql',
  'ajax',
  'data',
  'emails',
  'lite',
  'session',
  'invites',
  'push',
  'download',
  'reels_audio',
  'nametag',
  'ar',
  'reg',
  'consent',
  'cookie',
  'gdpr',
  'plugins',
  'identity',
  'login',
  'logout',
  'signup',
  'create',
  'notifications',
  'saved',
  'popular',
  'topics',
  'archive',
]);

const SITE_ORIGIN = 'https://www.instagram.com';

/**
 * Reduce any URL-ish string to a comparable path.
 *
 * Returns `/` when the input cannot be understood, which is always blocked, so
 * malformed input fails closed (D017).
 */
export function normalizePath(raw: string): string {
  if (typeof raw !== 'string' || raw.length === 0) return '/';

  let pathname: string;
  const input = raw.trim();
  if (input.startsWith('/')) {
    // Parse as a path, never as a protocol-relative URL: `//DIRECT//inbox`
    // would otherwise become a host named DIRECT.
    pathname = input.split('?')[0]!.split('#')[0]!;
  } else {
    try {
      pathname = new URL(input, SITE_ORIGIN).pathname;
    } catch {
      pathname = input.split('?')[0]!.split('#')[0]!;
    }
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return '/';
  }

  // Resolve `..` / `.` segments after decoding, so `/%2e%2e/explore` is
  // normalised exactly like `/../explore`.
  try {
    decoded = new URL(decoded.replace(/\/{2,}/g, '/'), SITE_ORIGIN).pathname;
  } catch {
    /* keep the decoded value */
  }

  let out = decoded.replace(/\/{2,}/g, '/').toLowerCase();
  if (out.length > 1) out = out.replace(/\/+$/, '');
  return out.length === 0 ? '/' : out;
}

function segments(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

function allow(reason: string, path: string): Verdict {
  return { action: 'allow', reason, path };
}

function block(reason: BlockReason, path: string): Verdict {
  return { action: 'block', reason, path, redirect: INBOX_PATH };
}

/**
 * Decide what to do with a URL.
 *
 * The pin is compared case-insensitively and requires a non-empty id.
 */
export function routeVerdict(rawUrl: string, ctx: RouteContext): Verdict {
  const path = normalizePath(rawUrl);
  const seg = segments(path);
  const first = seg[0];
  const pin = typeof ctx.pinId === 'string' ? ctx.pinId.toLowerCase() : null;
  const reelsAllowed = ctx.settings.allowReelsFromDms;

  if (first === undefined) return block('home-feed', path);

  switch (first) {
    // ---------------------------------------------------------------- DMs
    case 'direct':
      // inbox, /direct/t/<id>, /direct/new, /direct/requests
      return allow('direct', path);

    // --------------------------------------------------------- login & co.
    case 'accounts': {
      const second = seg[1];
      if (second === 'login') return allow('login', path);
      if (second === 'activity') return allow('activity', path);
      if (second === 'emailsignup' || second === 'signup') return block('signup', path);
      if (second === 'password') return allow('password-reset', path);
      if (second === 'edit') return allow('account-edit', path);
      if (second === 'privacy_and_security') return allow('account-privacy', path);
      if (second === 'suspended') return allow('account-suspended', path);
      if (second === 'logout') return allow('logout', path);
      return block('unknown-route', path);
    }

    case 'challenge':
    case 'consent':
    case 'oauth':
      return allow('login-flow', path);

    case 'emailsignup':
    case 'signup':
    case 'reg':
      return block('signup', path);

    // ------------------------------------------------------------ blocked
    case 'explore':
      return block(seg[1] === 'search' ? 'search' : 'explore', path);

    case 'search':
      return block('search', path);

    case 'reels': {
      // `/reels/` is the endless tab. A single `/reels/<code>/` is the same
      // content as `/reel/<code>/` and Instagram uses both forms for links, so
      // it is treated as one pinned item rather than a feed (D019).
      const code = seg[1];
      if (seg.length === 1 || !code) return block('reels-tab', path);
      if (code === 'audio' || code === 'audio_track') return block('reels-tab', path);
      if (reelsAllowed && pin !== null && code === pin) return allow('pinned-reel', path);
      return block('not-pinned', path);
    }

    case 'reel':
    case 'p': {
      const code = seg[1];
      const kind = first === 'reel' ? 'reel' : 'post';
      if (!code) return block('not-pinned', path);
      if (!reelsAllowed) return block('reels-disabled', path);
      if (pin !== null && code === pin) return allow(`pinned-${kind}`, path);
      return block('not-pinned', path);
    }

    case 'stories': {
      if (!ctx.settings.allowStories) return block('stories-disabled', path);
      // Everything after `/stories/<handle>/` is Instagram's own viewer. The
      // handle is the only part we can police, so it is the boundary: one chosen
      // friend, unless the user deliberately turned auto-advance on.
      const handle = seg[1];
      if (!handle || !/^[a-z0-9._]{1,30}$/.test(handle) ||
          ['highlights', 'archive', 'stories', 'explore'].includes(handle)) {
        return block('unknown-route', path);
      }
      const pinned = typeof ctx.storyUser === 'string' ? ctx.storyUser.toLowerCase() : null;
      if (pinned !== null && handle === pinned) return allow('pinned-story', path);
      if (pinned && ctx.settings.storiesAutoAdvance && ctx.storyUsers?.some((user) => user.toLowerCase() === handle)) return allow('listed-story', path);
      return block('story-not-pinned', path);
    }

    // Your own stories archive, linked from your profile. Same switch as any
    // other story: off means it is not a tap target, on means it opens.
    case 'archive': {
      if (seg[1] !== 'stories') return ctx.loggedIn ? block('unknown-route', path) : allow('logged-out', path);
      if (!ctx.settings.allowStories) return block('stories-disabled', path);
      return allow('stories-archive', path);
    }

    // ------------------------------------------------------------ allowed
    case 'legal':
    case 'privacy':
    case 'terms':
    case 'about':
      return allow('legal', path);

    default:
      break;
  }

  // ----------------------------------------------------------- profiles
  if (RESERVED.has(first)) {
    return ctx.loggedIn ? block('unknown-route', path) : allow('logged-out', path);
  }

  // `/<username>/` and its tabs. Reserved words already handled above, so a
  // single segment here is a profile.
  if (seg.length === 1) return allow('profile', path);
  // A profile grid links its tiles as `/<username>/p/<code>/` (and
  // `/<username>/reel/<code>/` for a reel), not as a bare `/p/<code>/`. Same
  // rule as the bare forms: one pinned item, anything else is browsing.
  if (seg.length === 3) {
    const kind = seg[1]!.toLowerCase();
    if (kind === 'p' || kind === 'reel' || kind === 'reels') {
      const code = seg[2]!;
      if (!reelsAllowed) return block('reels-disabled', path);
      if (pin !== null && code === pin) return allow('pinned-profile-item', path);
      return block('not-pinned', path);
    }
  }
  if (seg.length === 2) {
    const sub = seg[1]!;
    if (
      sub === 'reels' ||
      sub === 'tagged' ||
      sub === 'followers' ||
      sub === 'following' ||
      sub === 'channel' ||
      sub === 'saved'
    ) {
      return allow('profile-tab', path);
    }
  }

  // Unknown: fail closed for a logged-in user, stay out of the way while
  // logged out so login/2FA/consent flows keep working (§4.1).
  return ctx.loggedIn ? block('unknown-route', path) : allow('logged-out', path);
}

/** A person in a story viewer URL, never an aggregate or a suggested tray. */
export function storyUserForPath(rawUrl: string): string | null {
  const seg = segments(normalizePath(rawUrl));
  const user = seg[1];
  if (seg[0] !== 'stories' || !user || !/^[a-z0-9._]{1,30}$/.test(user)) return null;
  return ['highlights', 'archive', 'stories', 'explore'].includes(user) ? null : user;
}

/** Convenience: does this URL get blocked? */
export function isBlocked(rawUrl: string, ctx: RouteContext): boolean {
  return routeVerdict(rawUrl, ctx).action === 'block';
}

/** True for `/alice/` but false for `/direct/inbox/` and every reserved route. */
export function isProfilePath(rawUrl: string): boolean {
  const seg = segments(normalizePath(rawUrl));
  if (seg.length !== 1) return false;
  return !RESERVED.has(seg[0]!);
}

/** Which of our four tabs owns the current URL (null = none of them). */
export function tabForPath(rawUrl: string): TabId | null {
  const path = normalizePath(rawUrl);
  const seg = segments(path);
  const first = seg[0];

  if (first === 'direct') return 'inbox';
  if (first === 'stories') return 'stories';
  if (first === 'archive' && seg[1] === 'stories') return 'stories';
  if (first === 'accounts' && seg[1] === 'activity') return 'activity';
  if (first === undefined) return null;
  if (RESERVED.has(first)) return null;
  if (seg.length === 1) return 'profile';
  return null;
}

/** Path for each tab, used by the iOS WebView and the extension nav. */
export function pathForTab(tab: TabId, username?: string | null): string {
  switch (tab) {
    case 'inbox':
      return INBOX_PATH;
    case 'activity':
      return ACTIVITY_PATH;
    case 'profile':
      return username ? `/${username}/` : INBOX_PATH;
    case 'stories':
      // The Stories tab is a native list of rings; a story is opened per friend
      // from that list, never by guessing a handle here.
      return INBOX_PATH;
    case 'more':
      return INBOX_PATH; // the More tab is a native/extension surface, not a route
  }
}

/**
 * Extract a reel/post id from `/reel/<id>/`, `/reels/<id>/` or `/p/<id>/`.
 * Used by the in-page reel lock to arm its pin.
 */
export function reelIdForPath(rawUrl: string): string | null {
  // Ids are case-sensitive: extract them from the raw pathname rather than the
  // lowercased normalised one.
  let pathname: string;
  const input = rawUrl.trim();
  if (input.startsWith('/')) {
    pathname = input.split('?')[0]!.split('#')[0]!;
  } else {
    try {
      pathname = new URL(input, SITE_ORIGIN).pathname;
    } catch {
      return null;
    }
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const seg = decoded.split('/').filter((s) => s.length > 0);
  const KINDS = new Set(['reel', 'reels', 'p']);
  const first = seg[0]?.toLowerCase();
  // `/p/<code>/` — or the profile-grid shape `/<username>/p/<code>/`, which is
  // how every tile on a profile is linked.
  const kind = first && KINDS.has(first) ? first : seg[1]?.toLowerCase();
  if (!kind || !KINDS.has(kind)) return null;
  const offset = kind === first ? 1 : 2;
  const code = seg[offset];
  if (!code) return null;
  if (kind === 'reels' && (code === 'audio' || code === 'audio_track')) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null;
  return code;
}
