/**
 * Offline DM verification.
 *
 * Boots the real in-page core against markup shaped like Instagram mobile web —
 * a bottom navigation, a DM inbox, an inbox wrapped in its own navigation
 * element, a banner — so the DM claims are checked without an account, a
 * network, or a device. No Instagram response is involved: this asserts what our
 * script does *to* that markup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, type Booted } from '../src/inpage/index';
import type { PageMessage } from '../src/bridge';
import { DEFAULT_SETTINGS } from '../src/settings';

let api: Booted | null = null;
let post: ReturnType<typeof vi.fn>;
let navigate: ReturnType<typeof vi.fn>;

/** Instagram mobile web, reduced to the parts we touch. */
const MOBILE_DM_INBOX = `
  <header><a href="/" id="logo"><img alt="Instagram"></a></header>
  <nav role="navigation" id="ignav">
    <a href="/" id="nav-home">Home</a>
    <a href="/explore/" id="nav-explore">Search</a>
    <a href="/reels/" id="nav-reels">Reels</a>
    <a href="/direct/inbox/" id="nav-dms">Messages</a>
  </nav>
  <a href="/alice/" role="link" id="profile-link"><img alt="alice's profile picture"></a>
  <div id="inbox">
    <nav role="navigation" id="inbox-nav">
      <a href="/direct/t/42/" id="thread-42">bob</a>
      <a href="/direct/t/43/" id="thread-43">carol</a>
    </nav>
  </div>
  <div id="usebanner"><span>Use the app</span><button aria-label="Close">×</button></div>
`;

function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

function start(url = '/direct/inbox/'): void {
  window.history.replaceState({}, '', url);
  api = boot({
    win: window,
    host: 'ios',
    showNav: false,
    settings: DEFAULT_SETTINGS,
    post,
    navigate,
  });
}

function lastOfType(type: PageMessage['type']): PageMessage | undefined {
  const found = post.mock.calls.map(([message]) => message as PageMessage).filter((m) => m.type === type);
  return found.at(-1);
}

beforeEach(() => {
  post = vi.fn();
  navigate = vi.fn();
  api?.destroy();
  api = null;
  setViewport(390);
  document.head.innerHTML = '';
  document.body.innerHTML = MOBILE_DM_INBOX;
});

afterEach(() => {
  api?.destroy();
  api = null;
  document.body.innerHTML = '';
});

describe('DM inbox on a phone-width page', () => {
  it('boots to completion', () => {
    start();
    expect((window as unknown as Record<string, unknown>)['__directly']).toBeTruthy();
    expect(api?.layout()).toBe('mobile');
  });

  it("hides Instagram's own bottom navigation", () => {
    start();
    expect(document.getElementById('ignav')!.getAttribute('data-di-removed')).toBe('ig-nav');
  });

  it('does not hide an inbox that is wrapped in a navigation element', () => {
    // Regression: the inbox can be a <nav>, and hiding every navigation match
    // blanked the one screen this app exists for.
    start();
    const inboxNav = document.getElementById('inbox-nav')!;
    expect(inboxNav.hasAttribute('data-di-removed')).toBe(false);
  });

  it('never hides a navigation container that holds the message surface', () => {
    // Hardening: this one links to the feed (so the route test says "chrome")
    // but also wraps a thread and a composer. Hiding it would take the inbox and
    // the reply box with it.
    document.body.innerHTML = `
      <nav role="navigation" id="thread-nav">
        <a href="/">Home</a>
        <a href="/direct/t/42/">bob</a>
        <div role="textbox" contenteditable="true"></div>
      </nav>`;
    start();
    expect(document.getElementById('thread-nav')!.hasAttribute('data-di-removed')).toBe(false);
  });

  it('keeps every thread row tappable', () => {
    start();
    expect(document.getElementById('thread-42')!.hasAttribute('data-di-removed')).toBe(false);
    expect(document.getElementById('thread-43')!.hasAttribute('data-di-removed')).toBe(false);
  });

  it('reports the inbox route and the signed-in account', () => {
    start();
    // `normalizePath` strips the trailing slash; the host compares against that
    // form everywhere, so the expectation follows it.
    expect(lastOfType('di:url')).toMatchObject({ path: '/direct/inbox', layout: 'mobile' });
    expect(lastOfType('di:tab')).toMatchObject({ tab: 'inbox' });
    expect(lastOfType('di:account')).toMatchObject({ username: 'alice', signedIn: true });
  });

  it('removes the "Use the app" banner', () => {
    start();
    expect(document.getElementById('usebanner')!.getAttribute('data-di-removed')).toBe('app-banner');
  });

  it('opens a thread from the inbox', () => {
    start();
    window.history.pushState({}, '', '/direct/t/42/');
    expect(window.location.pathname).toBe('/direct/t/42/');
    expect(navigate).not.toHaveBeenCalled();
    expect(lastOfType('di:url')).toMatchObject({ path: '/direct/t/42' });
  });

  it('still blocks the feed from the inbox', () => {
    start();
    window.history.pushState({}, '', '/explore/');
    expect(navigate).toHaveBeenCalledWith('/direct/inbox/');
    expect(lastOfType('di:blocked')).toMatchObject({ reason: 'explore' });
  });
});

describe('a reel sent in a thread', () => {
  it('stays tappable, and tapping it pins that reel', () => {
    // End-to-end for the regression in cleanup.ts: boot → cleanup must leave the
    // friend's reel link visible → the click must arm the pin → the route is
    // allowed. Each link in that chain was true on its own while the chain was
    // broken at the first step.
    document.body.innerHTML = `
      <main>
        <a href="/direct/t/42/" id="thread-back">bob</a>
        <article id="msg">
          <a href="/reel/Csent/" id="sent-reel"><video></video></a>
        </article>
      </main>`;
    start('/direct/t/42/');
    const link = document.getElementById('sent-reel')!;
    expect(link.hasAttribute('data-di-removed')).toBe(false);

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(api?.pin()).toBe('Csent');
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('signed-out page', () => {
  it('reports no session instead of assuming one', () => {
    document.body.innerHTML = '<input name="username" /><button>Log in</button>';
    start('/accounts/login/');
    expect(lastOfType('di:account')).toMatchObject({ username: null, signedIn: false });
  });
});
