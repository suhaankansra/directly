/**
 * Settings storage. Local only: no network, no account, nothing leaves the
 * device. The schema and defaults are shared with the browser extension.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from '@directly/core';

const KEY = 'directly.settings.v1';

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

/**
 * The signed-in handle, remembered locally only so the Profile tab has a target.
 *
 * Instagram's DM inbox renders no link to your own profile, so on a cold start
 * the page cannot name the account until you visit a page that does. Storing the
 * handle the first time it is seen keeps Profile working across launches. It is
 * a username the page already rendered, never a credential or a cookie.
 */
const ACCOUNT_KEY = 'directly.account.v1';
const HANDLE = /^[A-Za-z0-9._]{1,30}$/;

export async function loadUsername(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNT_KEY);
    return raw && HANDLE.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function saveUsername(username: string | null): Promise<void> {
  try {
    if (username && HANDLE.test(username)) await AsyncStorage.setItem(ACCOUNT_KEY, username);
    else if (username === null) await AsyncStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // Best effort: the next detected handle is stored again.
  }
}

/**
 * DM alerts on or off.
 *
 * Host-only, unlike the switches in `Settings`: the page never needs to know
 * whether a notification will be raised, so it does not belong in the protocol.
 * Default on, because that was the behaviour before the switch existed.
 */
const ALERTS_KEY = 'directly.alerts.v1';

export async function loadAlerts(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(ALERTS_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export async function saveAlerts(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ALERTS_KEY, enabled ? '1' : '0');
  } catch {
    // Best effort: the switch reverts on the next launch rather than crashing.
  }
}
