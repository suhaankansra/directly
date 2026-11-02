/**
 * Content script. Runs at `document_start` on instagram.com only.
 *
 * Important ordering choice: the core boots *immediately* with defaults, and the
 * stored settings are applied a few milliseconds later when storage answers.
 * Awaiting storage first would let Instagram's own scripts run unguarded and
 * would flash the feed on a blocked route — worse than briefly rendering with
 * default settings.
 */

import { boot, GLOBAL_KEY } from '@directly/core/inpage';
import { mergeSettings, type Settings } from '@directly/core';
import { api, openOptionsPage, readStoredState, DEFAULT_STORED_STATE } from './platform.js';

const booted = boot({
  host: 'extension',
  settings: DEFAULT_STORED_STATE.settings,
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
