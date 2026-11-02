/**
 * Chrome and Firefox both ship a `chrome.*` namespace, but the promise-returning
 * flavour lives on `browser.*` in Firefox (and on `chrome.*` in MV3 Chrome).
 * This wrapper picks the promise API when it exists and falls back otherwise, so
 * one codebase covers Chrome, Edge, Brave, Arc, Firefox and Safari.
 */

import { mergeSettings, DEFAULT_SETTINGS, type Settings } from '@directly/core';

type StorageArea = {
  get: (keys: string[] | string | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

type RuntimeLike = {
  openOptionsPage?: () => void;
  sendMessage?: (message: unknown) => Promise<unknown> | void;
  id?: string;
};

export type ExtensionApi = {
  storage: { local: StorageArea; onChanged: { addListener: (cb: (changes: unknown, area: string) => void) => void } };
  runtime: RuntimeLike;
};

type GlobalWithApis = typeof globalThis & {
  browser?: ExtensionApi;
  chrome?: ExtensionApi & { storage: { local: StorageArea } };
};

const globals = globalThis as GlobalWithApis;

export const api: ExtensionApi | null = globals.browser ?? globals.chrome ?? null;

export type StoredState = {
  settings: Settings;
  remoteSelectorUrl: string | null;
};

export const DEFAULT_STORED_STATE: StoredState = {
  settings: DEFAULT_SETTINGS,
  remoteSelectorUrl: null,
};

export async function readStoredState(): Promise<StoredState> {
  if (!api?.storage?.local) return DEFAULT_STORED_STATE;
  try {
    const stored = await api.storage.local.get(['settings', 'remoteSelectorUrl']);
    return {
      settings: mergeSettings(stored['settings'], DEFAULT_SETTINGS),
      remoteSelectorUrl:
        typeof stored['remoteSelectorUrl'] === 'string' && stored['remoteSelectorUrl'].startsWith('https://')
          ? (stored['remoteSelectorUrl'] as string)
          : null,
    };
  } catch {
    return DEFAULT_STORED_STATE;
  }
}

export async function writeSettings(settings: Settings): Promise<void> {
  if (!api?.storage?.local) return;
  await api.storage.local.set({ settings });
}

export function openOptionsPage(): void {
  try {
    api?.runtime?.openOptionsPage?.();
  } catch {
    /* the toolbar button has no options page in some builds */
  }
}
