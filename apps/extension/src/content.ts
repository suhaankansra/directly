/**
 * Content script. Runs at `document_start` on instagram.com only.
 *
 * Important ordering choice: the core boots *immediately* with defaults, and the
 * stored settings are applied a few milliseconds later when storage answers.
 * Awaiting storage first would let Instagram's own scripts run unguarded and
 * would flash the feed on a blocked route — worse than briefly rendering with
 * default settings.
 */

import { boot, GLOBAL_KEY, installRouteGuard, whenRoot } from '@directly/core/inpage';
import { mergeSettings, parsePageMessage, storyUserForPath, type Settings } from '@directly/core';
import { api, openOptionsPage, readStoredState, DEFAULT_STORED_STATE } from './platform.js';

async function start() {
  const isStory = storyUserForPath(location.href) !== null;
  // A story load needs its explicit selection from the worker. Keep the viewer
  // concealed and intercept SPA changes until that bounded handshake finishes.
  let ready = false;
  const gate = isStory ? document.createElement('style') : null;
  if (gate) {
    gate.textContent = 'html { visibility: hidden !important; background: #101015 !important; }';
    whenRoot(document, () => { if (!ready) document.documentElement.append(gate); });
  }
  const pendingGuard = isStory ? installRouteGuard({ win: window,
    getSettings: () => DEFAULT_STORED_STATE.settings, getPin: () => null,
    isLoggedIn: () => true, onBlocked: () => undefined,
  }) : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stored = DEFAULT_STORED_STATE;
  let user: string | null = null;
  let users: string[] = [];
  if (isStory) {
    try {
      const result = await Promise.race([
        Promise.all([readStoredState(), api?.runtime?.sendMessage?.({ type: 'di:story-context' })]),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Story context timed out')), 2500); }),
      ]);
      stored = result[0];
      const context = result[1];
      if (context && typeof context === 'object') {
        const value = context as { user?: unknown; users?: unknown };
        const parsed = parsePageMessage({ v: 1, type: 'di:stories', stories: Array.isArray(value.users) ? value.users.map((username: unknown) => ({ username, seen: false })) : null });
        if (parsed?.type === 'di:stories') users = parsed.stories.map((ring) => ring.username);
        if (typeof value.user === 'string') user = value.user;
      }
    } catch { /* Defaults reject this load. */ }
    finally { clearTimeout(timer); pendingGuard?.dispose(); }
  }
  const booted = boot({
    host: 'extension',
    settings: stored.settings,
    initialStoryUser: user,
    initialStoryUsers: users,
    selectStory: async (user, users) => {
      const response = await api?.runtime?.sendMessage?.({ v: 1, type: 'di:story', user, users: users.map((username) => ({ username, seen: false })) });
      if (!response || typeof response !== 'object' || !('ok' in response) || response.ok !== true) throw new Error('Story selection was not saved');
    },
    showNav: true,
    openSettings: () => {
      // Ask the background to open the options page; a content script cannot.
      try {
        const sent = api?.runtime?.sendMessage?.({ type: 'di:open-settings' });
        if (sent && typeof (sent as Promise<unknown>).catch === 'function') {
          (sent as Promise<unknown>).catch(() => openOptionsPage());
        }
      } catch {
        openOptionsPage();
      }
    },
  });
  ready = true;
  if (booted.guard.lastVerdict()?.action === 'allow') gate?.remove();

  void readStoredState().then((stored) => {
    booted.applySettings(stored.settings);
    if (stored.settings.debug) {
      // Local-only diagnostics: which selector keys failed, and where we are.
      // eslint-disable-next-line no-console
      console.debug('[directly] live', booted.diagnostics());
    }
  });

  // Live updates from the popup: no reload required.
  try {
    api?.storage?.onChanged?.addListener((changes: unknown) => {
      const settings = (changes as Record<string, { newValue?: unknown }>)['settings']?.newValue;
      if (!settings) return;
      booted.applySettings(mergeSettings(settings as Partial<Settings>, booted.settings()));
    });
  } catch {
    /* storage events are best-effort */
  }

  // Expose a stable handle for manual debugging and for the fixture tests.
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
    ...(globalThis as Record<string, unknown>)[GLOBAL_KEY] as object,
    api: booted,
  };

}
void start().catch(() => location.replace('/direct/inbox/'));
