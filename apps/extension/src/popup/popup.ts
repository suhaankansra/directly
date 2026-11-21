/** Local settings. One serialized writer; visible errors if persistence fails. */
import { mergeSettings, type Settings } from '@directly/core';
import { readStoredState, writeSettings } from '../platform.js';
const KEYS: ReadonlyArray<keyof Settings> = [
  'allowReelsFromDms', 'allowStories', 'storiesAutoAdvance', 'showBlockToast', 'navLabels', 'debug',
];
const input = (key: string) => document.querySelector<HTMLInputElement>(`#${key}`);
function syncDependencies(): void {
  const continuation = input('storiesAutoAdvance');
  if (continuation) continuation.disabled = !input('allowStories')?.checked;
  const explanation = document.querySelector('#storyContinuationHint');
  if (explanation) explanation.textContent = input('allowStories')?.checked
    ? 'Continue only to people already in the available story list. Off by default.'
    : 'Turn on stories to change this.';
}
function collect(): Partial<Settings> {
  const result: Partial<Settings> = {};
  for (const key of KEYS) { const el = input(key); if (el) result[key] = el.checked; }
  return result;
}
void readStoredState().then((stored) => {
  let saves = Promise.resolve();
  for (const key of KEYS) {
    const el = input(key);
    if (!el) continue;
    el.checked = stored.settings[key];
    el.addEventListener('change', () => {
      syncDependencies();
      const next = mergeSettings(collect(), stored.settings);
      saves = saves.then(async () => {
        const status = document.querySelector('#saveStatus');
        try {
          await writeSettings(next);
          if (status) status.textContent = '';
        } catch {
          if (status) status.textContent = 'Settings couldn’t be saved. Please try again.';
        }
      });
    });
  }
  syncDependencies();
});
