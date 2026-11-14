import { beforeEach, describe, expect, it } from 'vitest';
import { runCleanup } from '../src/inpage/cleanup';
import { SelectorResolver } from '../src/inpage/selector';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import type { Layout } from '../src/routes';

let settings: Settings = DEFAULT_SETTINGS;

function cleanup(layout: Layout = 'mobile'): void {
  runCleanup({
    win: window,
    resolver: new SelectorResolver(layout),
    getSettings: () => settings,
    isLoggedIn: () => true,
  });
}

function removed(selector: string): boolean {
  const el = document.querySelector(selector);
  return el?.getAttribute('data-di-removed') !== null && el?.getAttribute('data-di-removed') !== undefined;
}

beforeEach(() => {
  settings = { ...DEFAULT_SETTINGS };
  document.documentElement.removeAttribute('data-di-cleaned');
  document.body.innerHTML = `
    <header><a href="/" id="logo"><img alt="Instagram"></a></header>
    <main>
      <section id="stories"><div role="list"><a href="/stories/alice/1/"><img alt=""></a></div></section>
      <a href="/direct/t/1/" id="thread"><span>alice</span></a>
      <a href="/p/Cpost/" id="dm-link">a post a friend sent</a>
      <a href="/reel/Creel/" id="dm-reel">a reel a friend sent</a>
      <a href="/reels/Cother/" id="dm-share-link">a shared reel link</a>
    </main>
    <nav role="navigation" id="ignav">
      <a href="/" id="nav-home"><svg aria-label="Home"></svg></a>
      <a href="/explore/" id="nav-explore"><svg aria-label="Search"></svg></a>
      <a href="/reels/" id="nav-reels"><svg aria-label="Reels"></svg></a>
      <a href="/reel/Cloose/" id="nav-reel-item"><svg aria-label="Reel"></svg></a>
      <a href="/direct/inbox/" id="nav-dms"><svg aria-label="Messages"></svg></a>
    </nav>
    <div id="usebanner"><span>Use the app</span><button aria-label="Close">×</button></div>
  `;
});

describe('runCleanup', () => {
  it('marks the document as cleaned', () => {
    cleanup();
    expect(document.documentElement.getAttribute('data-di-cleaned')).toBe('1');
  });

  it("hides Instagram's own navigation container", () => {
    cleanup();
    expect(document.getElementById('ignav')!.getAttribute('data-di-removed')).toBe('ig-nav');
  });

  it('hides links that lead to blocked routes', () => {
    cleanup();
    expect(removed('#nav-home')).toBe(true);
    expect(removed('#nav-explore')).toBe(true);
    expect(removed('#nav-reels')).toBe(true);
  });

  it('leaves allowed links alone', () => {
    cleanup();
    expect(document.getElementById('thread')!.hasAttribute('data-di-removed')).toBe(false);
    expect(document.getElementById('nav-dms')!.hasAttribute('data-di-removed')).toBe(false);
  });

  it('removes the "Use the app" banner', () => {
    cleanup();
    expect(removed('#usebanner')).toBe(true);
  });

  it('does not hide a post link inside a thread', () => {
    cleanup();
    expect(document.getElementById('dm-link')!.hasAttribute('data-di-removed')).toBe(false);
  });

  it('does not hide a reel a friend sent, so its pin can be armed on tap', () => {
    // Regression: the in-thread exemption only covered `/p/`, so a `/reel/<id>`
    // link was hidden before the guard could arm its pin — the one thing the
    // app promises to keep was unreachable inside a DM.
    cleanup();
    expect(document.getElementById('dm-reel')!.hasAttribute('data-di-removed')).toBe(false);
    expect(document.getElementById('dm-share-link')!.hasAttribute('data-di-removed')).toBe(false);
  });

  it('still hides a reel link that is page chrome, not something sent to you', () => {
    cleanup();
    expect(document.getElementById('nav-reel-item')!.getAttribute('data-di-removed')).toBe('blocked-link');
  });

  it('hides sent reel links in strict mode, where they cannot be opened', () => {
    settings = { ...DEFAULT_SETTINGS, allowReelsFromDms: false };
    cleanup();
    expect(document.getElementById('dm-reel')!.getAttribute('data-di-removed')).toBe('blocked-link');
  });

  it('hides the stories tray when stories are disabled', () => {
    cleanup();
    expect(document.querySelector('#stories > div')!.getAttribute('data-di-removed')).toBe('stories');
  });

  it('keeps the stories tray when stories are enabled', () => {
    settings = { ...DEFAULT_SETTINGS, allowStories: true };
    cleanup();
    expect(document.querySelector('#stories > div')!.hasAttribute('data-di-removed')).toBe(false);
  });

  it('is idempotent', () => {
    cleanup();
    cleanup();
    expect(document.getElementById('ignav')!.getAttribute('data-di-removed')).toBe('ig-nav');
  });
});
