/**
 * Settings schema shared by the iOS app and the browser extension.
 *
 * This module is pure data/logic with no DOM access, so it can be imported by
 * the React Native bundle as well as by the in-page script.
 */

export const SETTINGS_SCHEMA_VERSION = 1 as const;

export type Settings = {
  /** Allow opening Stories at all. Off by default (D013). */
  allowStories: boolean;
  /**
   * Allow a reel or post that was sent in a DM to be opened (one item, frozen).
   * When false ("strict mode"), reels/posts are blocked everywhere.
   */
  allowReelsFromDms: boolean;
  /** Show text labels under our 4-item nav bar (extension only). */
  navLabels: boolean;
  /** Surface why a navigation was blocked in a small toast. */
  showBlockToast: boolean;
  /** Verbose console logging for debugging selector regressions. */
  debug: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  allowStories: false,
  allowReelsFromDms: true,
  navLabels: true,
  showBlockToast: true,
  debug: false,
};

const BOOLEAN_KEYS: ReadonlyArray<keyof Settings> = [
  'allowStories',
  'allowReelsFromDms',
  'navLabels',
  'showBlockToast',
  'debug',
];

/**
 * Coerce anything (storage contents, a remote config file, a message from the
 * page) into a valid Settings object.
 *
 * Unknown keys are dropped rather than merged, so a compromised or stale remote
 * payload can never introduce new behaviour. Missing keys fall back to `base`.
 */
export function mergeSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const out: Settings = { ...base };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  const record = input as Record<string, unknown>;
  for (const key of BOOLEAN_KEYS) {
    const value = record[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/** True when two settings objects differ in any field we care about. */
export function settingsEqual(a: Settings, b: Settings): boolean {
  return BOOLEAN_KEYS.every((key) => a[key] === b[key]);
}
