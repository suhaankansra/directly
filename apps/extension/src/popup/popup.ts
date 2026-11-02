/**
 * Settings UI. The same six switches as the iOS Lock tab, stored locally.
 * Nothing here reads or sends anything from Instagram.
 */

import { mergeSettings, type Settings } from '@only-inbox/core';
import { readStoredState, writeSettings } from '../platform.js';

const KEYS: ReadonlyArray<keyof Settings> = [
  'allowReelsFromDms',
  'allowStories',
  'showBlockToast',
  'navLabels',
  'debug',
];

function input(key: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`#${key}`);
}

void readStoredState().then((stored) => {
  for (const key of KEYS) {
    const el = input(key);
    if (!el) continue;
    el.checked = stored.settings[key];
    el.addEventListener('change', () => {
      const next: Settings = mergeSettings(
        { ...collect(), [key]: el.checked },
        stored.settings,
      );
      void writeSettings(next);
    });
  }
});

function collect(): Partial<Settings> {
  const out: Partial<Settings> = {};
  for (const key of KEYS) {
    const el = input(key);
    if (el) out[key] = el.checked;
  }
  return out;
}

// A single writer for every toggle keeps the six switches consistent even if two
// are flipped quickly.
document.addEventListener('change', () => {
  void readStoredState().then((stored) => {
    void writeSettings(mergeSettings(collect(), stored.settings));
  });
});
