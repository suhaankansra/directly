import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, type Booted } from '../src/inpage/index';
import { readStoryRings } from '../src/inpage/stories';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/settings';
import { routeVerdict, storyUserForPath, tabForPath } from '../src/routes';
import { hostVerdict } from '../src/host';
import { parseHostMessage, parsePageMessage, type PageMessage } from '../src/bridge';

let api: Booted | null = null;
const settings = { ...DEFAULT_SETTINGS, allowStories: true };
beforeEach(() => {
  window.history.replaceState({}, '', '/direct/inbox/');
  document.body.innerHTML = '<main><a href="/direct/t/1/">Friend</a><textarea></textarea></main>';
});
afterEach(() => { api?.destroy(); api = null; document.body.innerHTML = ''; });
function apply(message: unknown) {
  const global = (window as unknown as { __directly: { applyHostMessage: (message: unknown) => void } }).__directly;
  global.applyHostMessage(message);
}

describe('story boundaries shared by both hosts', () => {
  it('requires explicit selection, even when stories are on', () => {
    expect(routeVerdict('/stories/alice/1/', { settings, loggedIn: true }).action).toBe('block');
    expect(routeVerdict('/stories/alice/1/', { settings, loggedIn: true, storyUser: 'ALICE' }).action).toBe('allow');
    expect(routeVerdict('/stories/bob/1/', { settings, loggedIn: true, storyUser: 'alice' }).action).toBe('block');
  });
  it('never authorizes unlisted people with continuation on', () => {
    const context = { settings: { ...settings, storiesAutoAdvance: true }, loggedIn: true, storyUser: 'alice', storyUsers: ['alice', 'bob'] };
    expect(routeVerdict('/stories/bob/1/', context).action).toBe('allow');
    expect(routeVerdict('/stories/suggested/1/', context).action).toBe('block');
    expect(hostVerdict('/stories/bob/1/', context, '/stories/alice/1/').action).toBe('allow');
    expect(hostVerdict('/stories/suggested/1/', context, '/stories/alice/1/').action).toBe('block');
  });
  it.each(['/stories/', '/stories/highlights/123', '/stories/archive/', '/stories/%3Cscript%3E/', '/stories/%E0%A4%A/'])('fails closed for %s', (url) => {
    expect(routeVerdict(url, { settings: { ...settings, storiesAutoAdvance: true }, loggedIn: true, storyUser: 'alice' }).action).toBe('block');
    expect(storyUserForPath(url)).toBeNull();
  });
  it('keeps every protection under all settings combinations', () => {
    for (const allowStories of [false, true]) for (const storiesAutoAdvance of [false, true]) for (const allowReelsFromDms of [false, true]) {
      const context = { settings: { ...DEFAULT_SETTINGS, allowStories, storiesAutoAdvance, allowReelsFromDms }, loggedIn: true, storyUser: 'alice', storyUsers: ['bob'] };
      for (const url of ['/', '/explore/', '/reels/', '/reel/unrelated/']) expect(routeVerdict(url, context).action).toBe('block');
      for (const url of ['/direct/inbox/', '/direct/t/1/', '/accounts/activity/', '/alice/']) expect(routeVerdict(url, context).action).toBe('allow');
    }
  });
  it('defaults old persisted settings safely', () => {
    expect(mergeSettings({ allowStories: true })).toMatchObject({ allowStories: true, storiesAutoAdvance: false });
    expect(mergeSettings({ storiesAutoAdvance: 'true' })).toEqual(DEFAULT_SETTINGS);
  });
});

describe('story ring data and protocol', () => {
  it('deduplicates and parses seen without mistaking not seen for seen', () => {
    document.body.innerHTML = '<a href="/stories/Alice/1" aria-label="Not seen">A</a><a href="/stories/alice/2">A</a><a href="/stories/bob/1" aria-label="Viewed">B</a><a href="/stories/highlights/1">H</a><a href="/stories/%3Cscript%3E/">X</a>';
    expect(readStoryRings(document)).toEqual([{ username: 'alice', seen: false }, { username: 'bob', seen: true }]);
    expect(readStoryRings(document, 0)).toEqual([]);
  });
  it('caps ring data and rejects malformed bridge entries', () => {
    const stories = Array.from({ length: 31 }, (_, i) => ({ username: `user${i}`, seen: false }));
    document.body.innerHTML = stories.map((ring) => `<a href="/stories/${ring.username}/">x</a>`).join('');
    expect(readStoryRings(document)).toHaveLength(30);
    expect(parsePageMessage({ v: 1, type: 'di:stories', stories })).toBeNull();
    for (const bad of [[{ username: 'alice', seen: 'false' }], [{ username: '../x', seen: false }], [null], {}]) {
      expect(parsePageMessage({ v: 1, type: 'di:stories', stories: bad })).toBeNull();
    }
    expect(parsePageMessage({ v: 1, type: 'di:stories', stories: [{ username: 'alice', seen: false, content: 'drop' }] })).toEqual({ v: 1, type: 'di:stories', stories: [{ username: 'alice', seen: false }] });
  });
  it('accepts only safe story selections and the five tab ids', () => {
    for (const user of ['../x', '', 'a'.repeat(31), 42, undefined]) {
      expect(parseHostMessage({ v: 1, type: 'di:story', user })).toBeNull();
      expect(parsePageMessage({ v: 1, type: 'di:story', user })).toBeNull();
    }
    for (const tab of ['inbox', 'stories', 'activity', 'profile', 'more']) expect(parsePageMessage({ v: 1, type: 'di:tab', tab })).toBeTruthy();
    expect(parsePageMessage({ v: 1, type: 'di:tab', tab: 'lock' })).toBeNull();
    expect(tabForPath('/stories/alice/')).toBe('stories');
  });
});

describe('real bootstrap lifecycle', () => {
  function delayedSelection() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    document.body.insertAdjacentHTML('beforeend', '<a id="story" href="/stories/alice/">A</a>');
    const navigate = vi.fn();
    const selectStory = vi.fn(() => pending);
    api = boot({ win: window, host: 'extension', settings, showNav: false, post: vi.fn(), navigate, selectStory });
    document.querySelector<HTMLAnchorElement>('#story')!.click();
    return { resolve, reject, navigate, selectStory };
  }

  it('waits for persisted selection and keeps the captured continuation list', async () => {
    const request = delayedSelection();
    expect(request.navigate).not.toHaveBeenCalled();
    expect(request.selectStory).toHaveBeenCalledWith('alice', ['alice']);
    document.body.insertAdjacentHTML('beforeend', '<a href="/stories/bob/">B</a>');
    api!.refresh();
    request.resolve();
    await Promise.resolve();
    expect(request.navigate).toHaveBeenCalledWith('/stories/alice/');
    window.history.pushState({}, '', '/stories/alice/');
    api!.applySettings({ storiesAutoAdvance: true });
    request.navigate.mockClear();
    window.history.pushState({}, '', '/stories/bob/');
    expect(request.navigate).toHaveBeenCalledWith('/direct/inbox/');
  });

  it.each(['api', 'bridge'])('cancels a pending story when disabled via %s, even after re-enabling', async (source) => {
    const request = delayedSelection();
    if (source === 'api') api!.applySettings({ allowStories: false });
    else apply({ v: 1, type: 'di:settings', settings: { ...settings, allowStories: false } });
    api!.applySettings({ allowStories: true });
    request.resolve();
    await Promise.resolve();
    expect(request.navigate).not.toHaveBeenCalled();
    window.history.pushState({}, '', '/stories/alice/');
    expect(request.navigate).toHaveBeenCalledWith('/direct/inbox/');
  });

  it('does not pull the user back into a story after navigating to a thread', async () => {
    const request = delayedSelection();
    window.history.pushState({}, '', '/direct/t/2/');
    request.resolve();
    await Promise.resolve();
    expect(request.navigate).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/direct/t/2/');
  });

  it('does not navigate after bootstrap is destroyed', async () => {
    const request = delayedSelection();
    api!.destroy(); api = null;
    request.resolve();
    await Promise.resolve();
    expect(request.navigate).not.toHaveBeenCalled();
  });

  it('serializes repeated taps and allows retry after a persistence error', async () => {
    const request = delayedSelection();
    document.querySelector<HTMLAnchorElement>('#story')!.click();
    expect(request.selectStory).toHaveBeenCalledTimes(1);
    request.reject(new Error('Storage unavailable'));
    await Promise.resolve();
    expect(request.navigate).not.toHaveBeenCalled();
    request.selectStory.mockImplementation(() => Promise.resolve());
    document.querySelector<HTMLAnchorElement>('#story')!.click();
    await Promise.resolve();
    expect(request.navigate).toHaveBeenCalledWith('/stories/alice/');
  });

  it('publishes rings while preserving the message surface and story tap targets', () => {
    document.body.insertAdjacentHTML('beforeend', '<a id="story" href="/stories/alice/">A</a>');
    const post = vi.fn();
    api = boot({ win: window, host: 'ios', settings, post, navigate: vi.fn() });
    expect(post).toHaveBeenCalledWith({ v: 1, type: 'di:stories', stories: [{ username: 'alice', seen: false }] });
    expect(document.querySelector('#story')?.getAttribute('data-di-removed')).toBeNull();
    expect(document.querySelector('textarea')?.closest('[data-di-removed]')).toBeNull();
    document.querySelector<HTMLAnchorElement>('#story')!.click();
    expect(post).toHaveBeenCalledWith({ v: 1, type: 'di:story', user: 'alice' });
  });
  it('restores only the intended selection across bootstrap and clears it on exit', () => {
    window.history.replaceState({}, '', '/stories/alice/1/');
    const navigate = vi.fn();
    api = boot({ win: window, host: 'ios', settings, initialStoryUser: 'alice', navigate });
    expect(navigate).not.toHaveBeenCalled();
    window.history.pushState({}, '', '/stories/alice/2/');
    expect(navigate).not.toHaveBeenCalled();
    window.history.pushState({}, '', '/stories/bob/1/');
    expect(navigate).toHaveBeenCalledWith('/direct/inbox/');
    window.history.pushState({}, '', '/direct/inbox/');
    navigate.mockClear();
    window.history.pushState({}, '', '/stories/alice/1/');
    expect(navigate).toHaveBeenCalledWith('/direct/inbox/');
  });
  it('does not authorize a different initial URL or an automatic replaceState', () => {
    window.history.replaceState({}, '', '/stories/bob/1/');
    const navigate = vi.fn();
    api = boot({ win: window, host: 'ios', settings, initialStoryUser: 'alice', navigate });
    expect(navigate).toHaveBeenCalledWith('/direct/inbox/');
    apply({ v: 1, type: 'di:story', user: 'bob' });
    navigate.mockClear();
    window.history.replaceState({}, '', '/stories/carol/1/');
    expect(navigate).toHaveBeenCalledWith('/direct/inbox/');
  });
  it('leaves the viewer immediately when stories are disabled', () => {
    window.history.replaceState({}, '', '/stories/alice/1/');
    const navigate = vi.fn();
    api = boot({ win: window, host: 'ios', settings, initialStoryUser: 'alice', navigate });
    api.applySettings({ allowStories: false });
    expect(navigate).toHaveBeenCalledWith('/direct/inbox/');
  });
  it('shows five extension destinations and an honest empty state', () => {
    api = boot({ win: window, host: 'manual', settings, showNav: true, post: vi.fn(), navigate: vi.fn() });
    const root = api.nav!.root()!.shadowRoot!;
    expect(root.querySelectorAll('nav button')).toHaveLength(5);
    root.querySelector<HTMLButtonElement>('[data-tab="stories"]')!.click();
    expect(root.querySelector('.panel')?.textContent).toContain('No story links are available');
    expect(root.querySelector('[data-tab="stories"]')?.getAttribute('aria-current')).toBe('page');
    root.querySelector<HTMLButtonElement>('.close')!.click();
    expect(root.querySelector('.panel')).toBeNull();
  });
  it('waits for the root without losing the navigation or guard', async () => {
    const root = document.documentElement;
    root.remove();
    try {
      const navigate = vi.fn();
      api = boot({ win: window, host: 'manual', settings, showNav: true, post: (_message: PageMessage) => undefined, navigate });
      window.history.pushState({}, '', '/explore/');
      expect(navigate).toHaveBeenCalledWith('/direct/inbox/');
    } finally { document.appendChild(root); }
    await vi.waitFor(() => expect(document.querySelector('#directly-nav')).not.toBeNull());
  });
});
