/** Full-load guard and ephemeral, per-tab story selection. No page content is stored. */
import {
  DEFAULT_SETTINGS, hostVerdict, mergeSettings, normalizePath, parseHostMessage,
  parsePageMessage, storyUserForPath, type Settings,
} from '@directly/core';

type StoryContext = { user: string | null; users: string[] };
const emptyStory = (): StoryContext => ({ user: null, users: [] });
const tabPaths = new Map<number, string>();
const contexts = new Map<number, StoryContext>();
const INBOX_URL = 'https://www.instagram.com/direct/inbox/';
const SITE = /^https:\/\/(www\.)?instagram\.com\//;
const api = (globalThis as unknown as { browser?: typeof chrome; chrome?: typeof chrome }).browser ??
  (globalThis as unknown as { chrome?: typeof chrome }).chrome;

function validateContext(input: unknown): StoryContext {
  if (!input || typeof input !== 'object') return emptyStory();
  const raw = input as { user?: unknown; users?: unknown };
  const selected = parseHostMessage({ v: 1, type: 'di:story', user: raw.user });
  const list = parsePageMessage({ v: 1, type: 'di:stories', stories: raw.users });
  if (selected?.type !== 'di:story' || list?.type !== 'di:stories') return emptyStory();
  if (selected.user && !storyUserForPath(`/stories/${selected.user}/`)) return emptyStory();
  return { user: selected.user, users: list.stories.map((ring) => ring.username) };
}

if (api) {
  async function currentSettings(): Promise<Settings> {
    try { return mergeSettings((await api!.storage.local.get('settings'))['settings']); }
    catch { return DEFAULT_SETTINGS; }
  }
  async function selectedStory(tabId: number): Promise<StoryContext> {
    const stored = await api!.storage.session?.get(`storyContext:${tabId}`);
    const value = stored?.[`storyContext:${tabId}`];
    return value === undefined ? contexts.get(tabId) ?? emptyStory() : validateContext(value);
  }
  async function saveStory(tabId: number, context: StoryContext): Promise<void> {
    if (!context.user) {
      contexts.delete(tabId);
      await api!.storage.session?.remove(`storyContext:${tabId}`);
    } else {
      const serialized = { user: context.user, users: context.users.map((username) => ({ username, seen: false })) };
      // Commit the in-memory fallback only after persistence succeeds.
      await api!.storage.session?.set({ [`storyContext:${tabId}`]: serialized });
      contexts.set(tabId, context);
    }
  }
  function clearStory(tabId: number): void { void saveStory(tabId, emptyStory()).catch(() => undefined); }

  api.runtime.onInstalled.addListener(() => {
    void (async () => {
      const stored = await api!.storage.local.get('settings');
      if (!stored['settings']) await api!.storage.local.set({ settings: DEFAULT_SETTINGS });
    })().catch(() => undefined);
  });
  api.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    const type = (message as { type?: unknown } | null)?.type;
    const tabId = sender.tab?.id;
    const trusted = sender.id === api!.runtime.id && sender.frameId === 0 && SITE.test(sender.url ?? '');
    if (trusted && tabId !== undefined && type === 'di:story-context') {
      void selectedStory(tabId).then(respond).catch(() => respond(emptyStory()));
      return true;
    }
    if (trusted && tabId !== undefined && type === 'di:story') {
      if (storyUserForPath(sender.url ?? '')) { respond({ ok: false }); return false; }
      const context = validateContext(message);
      if (!context.user) { respond({ ok: false }); return false; }
      void saveStory(tabId, context).then(() => respond({ ok: true })).catch(() => respond({ ok: false }));
      return true;
    }
    if (type === 'di:open-settings' && sender.id === api!.runtime.id) {
      void api!.runtime.openOptionsPage(); respond({ ok: true });
    }
    return false;
  });
  api.tabs.onRemoved.addListener((tabId) => { tabPaths.delete(tabId); clearStory(tabId); });

  async function enforce(details: { frameId: number; tabId: number; url: string }): Promise<void> {
    if (details.frameId !== 0 || !SITE.test(details.url)) return;
    try {
      const [settings, story] = await Promise.all([currentSettings(), selectedStory(details.tabId)]);
      const decision = hostVerdict(details.url, {
        settings, loggedIn: true, pinId: null, storyUser: story.user, storyUsers: story.users,
      }, tabPaths.get(details.tabId) ?? null);
      if (decision.action === 'block') {
        await api!.tabs.update(details.tabId, { url: INBOX_URL });
        return;
      }
      tabPaths.set(details.tabId, normalizePath(details.url));
      if (!storyUserForPath(details.url)) clearStory(details.tabId);
    } catch {
      // A failed context read must never loosen story protection.
      if (storyUserForPath(details.url)) await api!.tabs.update(details.tabId, { url: INBOX_URL }).catch(() => undefined);
    }
  }
  api.webNavigation.onBeforeNavigate.addListener((details) => { void enforce(details); });
  api.webNavigation.onHistoryStateUpdated.addListener((details) => { void enforce(details); });
  api.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    tabPaths.set(details.tabId, normalizePath(details.url));
    if (!storyUserForPath(details.url)) clearStory(details.tabId);
  });
}
