/**
 * Settings storage. Local only: no network, no account, nothing leaves the
 * device. The schema and defaults are shared with the browser extension.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from '@only-inbox/core';

const KEY = 'onlyInbox.settings.v1';

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return mergeSettings(JSON.parse(raw), DEFAULT_SETTINGS);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage failures must not break the app; settings simply revert on relaunch.
  }
}
