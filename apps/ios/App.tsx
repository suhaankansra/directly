import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_SETTINGS,
  INBOX_PATH,
  pathForTab,
  tabForPath,
  type Layout,
  type Settings,
  type TabId,
} from '@directly/core';

import appConfig from './app.json';
import { IgWebView, type IgWebViewHandle } from './src/components/IgWebView';
import { LoadingSurface } from './src/components/LoadingSurface';
import { TabBar } from './src/components/TabBar';
import { LockScreen } from './src/screens/LockScreen';
import {
  alertPermission,
  clearAlerts,
  ensureNotificationPermission,
  installNotificationHandler,
  notifyUnread,
  setUnreadBadge,
} from './src/lib/notifications';
import {
  loadAlerts,
  loadSettings,
  loadUsername,
  saveAlerts,
  saveSettings,
  saveUsername,
} from './src/lib/settings';
import { colors, radius, spacing } from './src/theme';

// Read from app.json rather than typed here: the copy in this file said 0.1.0 for
// two releases, and the Lock screen's diagnostics report is the one place a stale
// version is actually harmful.
const VERSION: string = appConfig.expo.version;
const BLOCK_TOAST = 'Directly — that isn’t here';

function Shell() {
  const insets = useSafeAreaInsets();
  const web = useRef<IgWebViewHandle>(null);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [tab, setTab] = useState<TabId | null>('inbox');
  const [path, setPath] = useState<string>(INBOX_PATH);
  const [username, setUsername] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [target, setTarget] = useState<{ path: string; nonce: number } | null>(null);
  const [, setLayout] = useState<Layout>('mobile');
  const [unread, setUnread] = useState(0);
  // When the count last arrived, so the Lock screen can say whether the page has
  // ever exposed it — the difference between "no messages" and "no badge found".
  const [unreadAt, setUnreadAt] = useState<number | null>(null);
  // Alerts are only ever local (see lib/notifications.ts), so the switch here is
  // the whole feature: on means a banner while the app is running, off means the
  // app stays quiet and drops the badge.
  const [alerts, setAlerts] = useState(true);
  /** The OS refused and will not prompt again — the switch cannot turn on. */
  const [alertsBlocked, setAlertsBlocked] = useState(false);

  // Read by `onUnread` without making its identity change on every route — the
  // WebView keeps the callback in a `useCallback` chain.
  const unreadRef = useRef(0);
  const pathRef = useRef<string>(INBOX_PATH);
  const lockRef = useRef(false);
  const askedForAlerts = useRef(false);
  const alertsRef = useRef(true);
  /** The first count of a session is the state of the world, not news. */
  const hydratedUnread = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadSettings(), loadUsername(), loadAlerts(), alertPermission()]).then(
      ([loaded, remembered, alertsOn, permission]) => {
        if (cancelled) return;
        setSettings(loaded);
        // Only fills the gap until the page reports the account again; a page
        // report always wins, so signing into another account corrects this.
        setUsername(remembered);
        setAlerts(alertsOn);
        alertsRef.current = alertsOn;
        // "Denied" outlives the switch: the OS will not prompt again, so the
        // screen says that instead of toggling on and silently doing nothing.
        setAlertsBlocked(alertsOn && permission === 'denied');
        setSettingsReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Registered once, before the first unread count can arrive.
    installNotificationHandler();
  }, []);

  useEffect(() => {
    lockRef.current = lockOpen;
  }, [lockOpen]);

  useEffect(() => {
    // Ask for alerts only once there is a session to alert about, and only once:
    // a refusal is remembered by the OS, so re-asking every launch achieves
    // nothing except irritation.
    if (!signedIn || askedForAlerts.current || !alertsRef.current) return;
    askedForAlerts.current = true;
    void ensureNotificationPermission().then((granted) => {
      if (granted) return;
      // A refusal is the OS's answer, not ours: reflect it rather than showing
      // an on switch next to an app that will never alert.
      setAlerts(false);
      alertsRef.current = false;
      setAlertsBlocked(true);
      void saveAlerts(false);
    });
  }, [signedIn]);

  const updateAlerts = useCallback((next: boolean) => {
    if (!next) {
      setAlerts(false);
      alertsRef.current = false;
      void saveAlerts(false);
      void clearAlerts();
      return;
    }
    void ensureNotificationPermission().then((granted) => {
      setAlertsBlocked(!granted);
      if (!granted) return;
      setAlerts(true);
      alertsRef.current = true;
      void saveAlerts(true);
      // The count the page already reported is still true; badge it now that
      // alerts are on, without waiting for the next message to arrive.
      void setUnreadBadge(unreadRef.current);
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const onBlocked = useCallback(
    (_reason: string, _blockedPath: string) => {
      if (!settings.showBlockToast) return;
      setToast(BLOCK_TOAST);
    },
    [settings.showBlockToast],
  );

  // Not a route block, so the "blocked route" switch does not apply: this is the
  // app being unable to do what was tapped, and staying quiet would repeat the
  // silent nothing that sent people to Facebook in the first place.
  const onNotice = useCallback((message: string) => setToast(message), []);

  const onRoute = useCallback((nextPath: string, nextLayout: Layout, _pin: string | null, nextTab: TabId | null) => {
    pathRef.current = nextPath;
    setPath(nextPath);
    setLayout(nextLayout);
    // The tab bar follows the URL the page reports, not the last thing tapped,
    // so a swipe back or an in-page link still moves the highlight.
    if (nextTab) setTab(nextTab);
    else if (lockOpen) setTab('lock');
  }, [lockOpen]);

  const onAccount = useCallback((name: string | null, isSignedIn: boolean) => {
    // The page can only name the account when your avatar link is rendered. On a
    // thread or a story it often is not, and forgetting the name there turned
    // the Profile tab into a no-op. Keep the last known handle while signed in.
    setUsername((previous) => {
      const next = name ?? (isSignedIn ? previous : null);
      if (next !== previous) void saveUsername(next);
      return next;
    });
    setSignedIn(isSignedIn);
  }, []);

  const onUnread = useCallback((count: number) => {
    setUnread(count);
    setUnreadAt(Date.now());
    if (!alertsRef.current) {
      unreadRef.current = count;
      // The tab bar still counts, but the icon badge is an alert: no alerts, no
      // badge. `unreadRef` keeps the count for when the switch goes back on.
      if (!hydratedUnread.current) hydratedUnread.current = true;
      return;
    }
    void setUnreadBadge(count);
    const previous = unreadRef.current;
    unreadRef.current = count;
    if (!hydratedUnread.current) {
      hydratedUnread.current = true;
      return;
    }
    // Only a rise is news: reading a thread lowers the count, and re-announcing
    // an unchanged number on every route change would be nagging.
    if (count <= previous) return;
    // On the inbox list the new thread is already in front of you.
    if (!lockRef.current && pathRef.current === INBOX_PATH) return;
    void notifyUnread(count);
  }, []);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    void saveSettings(next);
    web.current?.pushSettings(next);
  }, []);

  const selectTab = useCallback(
    (next: TabId) => {
      if (next === 'lock') {
        setLockOpen(true);
        setTab('lock');
        return;
      }
      setLockOpen(false);
      setTab(next);
      // Without a handle there is no path to build, and loading the inbox in its
      // place made the tab look dead. Let the page use the profile link it is
      // already showing.
      if (next === 'profile' && !username) {
        web.current?.openProfile();
        return;
      }
      const destination = pathForTab(next, username);
      setTarget({ path: destination, nonce: Date.now() });
    },
    [username],
  );

  const switchAccount = useCallback(() => {
    // The Lock screen sits on top of the web view (and the page is at opacity 0
    // behind it), so opening Instagram's menu from there would show it to nobody.
    // Close the overlay, move the tab highlight back to the page we reveal, then
    // click the page's own chevron.
    setLockOpen(false);
    setTab(tabForPath(path) ?? 'inbox');
    setTimeout(() => web.current?.openAccountMenu(), 80);
  }, [path]);

  const signOut = useCallback(async () => {
    // Sign-out is Instagram's own: its logout route ends the session server-side
    // and clears the cookies it set, so there is no cookie jar of ours to empty.
    // The native cookie module this used to call was removed — its Android build
    // script still invoked jcenter(), which Gradle 9 dropped, so it cannot be
    // built at all, and a dependency that will not compile is not worth having.
    setLockOpen(false);
    setTab('inbox');
    setUnread(0);
    unreadRef.current = 0;
    void setUnreadBadge(0);
    try {
      web.current?.clearCache?.(true);
    } catch {
      // Cache clearing is best-effort; the navigation below is what signs out.
    }
    web.current?.navigate('/accounts/logout/');
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (lockOpen) {
        setLockOpen(false);
        return true;
      }
      if (path === INBOX_PATH) return false;
      web.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [lockOpen, path]);

  if (!settingsReady) {
    // Same surface as a page load: the app should never show a second, different
    // "starting up" screen before the first one.
    return (
      <View style={styles.boot}>
        <StatusBar style="light" />
        <LoadingSurface visible />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.body}>
        <View style={[styles.webLayer, lockOpen && styles.hidden]}>
                      <IgWebView
            ref={web}
            settings={settings}
            onNotice={onNotice}
            onRoute={onRoute}
            onBlocked={onBlocked}
            onAccount={onAccount}
            onUnread={onUnread}
            onLoadingChange={() => undefined}
            navigateTarget={target}
          />
        </View>

        {lockOpen ? (
          <View style={styles.lockLayer}>
            <LockScreen
              settings={settings}
              username={username}
              signedIn={signedIn}
              unread={unread}
              unreadAt={unreadAt}
              path={path}
              alerts={alerts}
              alertsBlocked={alertsBlocked}
              onAlertsChange={updateAlerts}
              onSwitchAccount={switchAccount}
              onChange={updateSettings}
              onOpenProfile={() => {
                setLockOpen(false);
                setTab('profile');
                if (username) setTarget({ path: `/${username}/`, nonce: Date.now() });
                else web.current?.openProfile();
              }}
              onSignOut={() => void signOut()}
              version={VERSION}
            />
          </View>
        ) : null}

        {toast ? (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}
      </View>

      <TabBar active={tab} onSelect={selectTab} bottomInset={insets.bottom} unread={unread} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  webLayer: { flex: 1 },
  hidden: { opacity: 0 },
  lockLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
  },
  boot: { flex: 1, backgroundColor: colors.bg },
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    // Glass: translucent fill, a bright specular rim and a soft cast shadow.
    backgroundColor: 'rgba(35,35,41,0.82)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  toastText: { color: colors.text, fontSize: 13, fontWeight: '500' },
});
