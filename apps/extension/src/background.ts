/**
 * Background worker: layer 1 of the route guard.
 *
 * The content script handles everything inside the page, but it never sees a
 * navigation that unloads the document — a real link click, a redirect after
 * login carrying `?next=/reels/`, or a pasted URL. `webNavigation` does, and
 * this is where those are stopped before Instagram renders them.
 *
 * Permissions used: `webNavigation` (one host), `storage`, `tabs` (to redirect a
 * blocked tab). Nothing else is requested, and no request body, header, message
 * or credential is ever read.
 */

import { DEFAULT_SETTINGS, hostVerdict, mergeSettings, normalizePath, type Settings } from '@only-inbox/core';

type TabPathMap = Map<number, string>;

const tabPaths: TabPathMap = new Map();
const INBOX_URL = 'https://www.instagram.com/direct/inbox/';

const chromeApi = (globalThis as unknown as { chrome?: typeof chrome; browser?: typeof chrome }).browser ??
  (globalThis as unknown as { chrome?: typeof chrome }).chrome;

if (!chromeApi) {
  // Nothing to do outside an extension context (e.g. if this file is imported by
  // a test runner).
} else {
  const api = chromeApi;

  async function currentSettings(): Promise<Settings> {
    try {
      const stored = await api.storage.local.get('settings');
      return mergeSettings(stored['settings'], DEFAULT_SETTINGS);
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  api.runtime.onInstalled.addListener(() => {
    void (async () => {
      const stored = await api.storage.local.get('settings');
      if (!stored['settings']) await api.storage.local.set({ settings: DEFAULT_SETTINGS });
    })();
  });

  api.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const type = (message as { type?: string } | null)?.type;
    if (type === 'oo:open-settings') {
      api.runtime.openOptionsPage();
      sendResponse({ ok: true });
    }
    return false;
  });

  function remember(tabId: number, url: string): void {
    try {
      tabPaths.set(tabId, normalizePath(url));
    } catch {
      /* ignore */
    }
  }

  api.tabs.onRemoved.addListener((tabId) => tabPaths.delete(tabId));

  // SPA navigations never fire onBeforeNavigate; tracking them here keeps the
  // "came from a DM" test honest for the next full load.
  api.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId !== 0) return;
    remember(details.tabId, details.url);
  });

  api.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) return;
    if (!/^https:\/\/(www\.)?instagram\.com\//.test(details.url)) return;

    void (async () => {
      const settings = await currentSettings();
      const previous = tabPaths.get(details.tabId) ?? null;
      const decision = hostVerdict(
        details.url,
        { settings, loggedIn: true, pinId: null },
        previous,
      );

      if (decision.action === 'block') {
        try {
          await api.tabs.update(details.tabId, { url: INBOX_URL });
        } catch {
          /* the tab may have closed */
        }
        return;
      }

      remember(details.tabId, details.url);
    })();
  });

  api.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    remember(details.tabId, details.url);
  });
}
