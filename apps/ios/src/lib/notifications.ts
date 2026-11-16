/**
 * Local notifications for new DMs.
 *
 * A WebView cannot receive web push: service workers do not run inside WKWebView
 * or Android WebView, so Instagram's own browser notifications never arrive. The
 * only other way to know about a message while the app is closed would be a
 * server holding your Instagram session, which this app exists not to do
 * (invariant 2). So these are *local*: the page reports an unread count while it
 * is running, and a rising count becomes a notification and an app-icon badge.
 *
 * Nothing here reads, stores or carries message content — there is a count and
 * the fixed sentence below, and that is all we have.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Must match `defaultChannel` in app.json, or Android has nowhere to put it. */
const CHANNEL_ID = 'dms';

/** Foreground presentation: a DM should not need the app to be minimised. */
export function installNotificationHandler(): void {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });
  } catch {
    /* alerts are never load-bearing */
  }
}

/**
 * Ask once, and treat a refusal as final: no alerts is a smaller loss than
 * nagging for a permission the user already declined.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'New messages',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

export async function notifyUnread(count: number): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: count === 1 ? 'New message' : `${count} new messages`,
        body: 'Tap to open your DMs.',
      },
      // No trigger means deliver now.
      trigger: null,
    });
  } catch {
    /* ignore */
  }
}

/** The app-icon badge, which is the only alert that exists while it is closed. */
export async function setUnreadBadge(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    /* ignore */
  }
}
