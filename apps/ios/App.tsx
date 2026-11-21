import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_SETTINGS,
  INBOX_PATH,
  pathForTab,
  normalizePath,
  tabForPath,
  type Layout,
  type Settings,
  type TabId,
  type StoryRing,
  storyUserForPath,
} from '@directly/core';

import appConfig from './app.json';
import { IgWebView, type IgWebViewHandle } from './src/components/IgWebView';
import { LoadingSurface } from './src/components/LoadingSurface';
import { TabBar } from './src/components/TabBar';
import { StoriesScreen } from './src/screens/StoriesScreen';
import { LockScreen } from './src/screens/LockScreen';
import { logEvent } from './src/lib/diagnostics';
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
import { useColors, type Palette, radius, spacing } from './src/theme';

// Read from app.json rather than typed here: the copy in this file said 0.1.0 for
// two releases, and the Lock screen's diagnostics report is the one place a stale
// version is actually harmful.
const VERSION: string = appConfig.expo.version;
const INBOX_ROUTE = normalizePath(INBOX_PATH);
const BLOCK_TOAST = 'Directly — that isn’t here';

/** What a tab says when Instagram sends the tap back to the inbox instead. */
const TAB_FAILED: Partial<Record<TabId, string>> = {
  activity: 'Instagram doesn’t serve Activity here',
  profile: 'Couldn’t open your profile',
};

function Shell() {
  const colors = useColors();
  const styles = makeStyles(colors);
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const rail = Platform.OS === 'android' && windowWidth >= 840 && fontScale <= 1.4;
  const insets = useSafeAreaInsets();
  const web = useRef<IgWebViewHandle>(null);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [tab, setTab] = useState<TabId | null>('inbox');
  const [path, setPath] = useState<string>(INBOX_PATH);
  const [username, setUsername] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [storiesOpen, setStoriesOpen] = useState(false);
  const [stories, setStories] = useState<StoryRing[]>([]);
  const [storyUsers, setStoryUsers] = useState<string[]>([]);
  const [storyUser, setStoryUser] = useState<string | null>(null);
  const [navHeight, setNavHeight] = useState(100);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
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
  /**
   * The tab that was just tapped, until the page confirms it got there. A tap
   * that Instagram redirects away ends on the inbox, which used to look exactly
   * like a dead tab: the highlight moved and nothing else happened.
   */
  const pendingTab = useRef<{ tab: TabId; at: number } | null>(null);
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
      void saveAlerts(false).then((saved) => { if (!saved) setToast('Alerts changed for this session, but couldn’t be saved.'); });
    });
  }, [signedIn]);

  const updateAlerts = useCallback((next: boolean) => {
    if (!next) {
      setAlerts(false);
      alertsRef.current = false;
      void saveAlerts(false).then((saved) => { if (!saved) setToast('Alerts changed for this session, but couldn’t be saved.'); });
      void clearAlerts();
      return;
    }
    void ensureNotificationPermission().then((granted) => {
      setAlertsBlocked(!granted);
      if (!granted) return;
      setAlerts(true);
      alertsRef.current = true;
      void saveAlerts(true).then((saved) => { if (!saved) setToast('Alerts changed for this session, but couldn’t be saved.'); });
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
    const pending = pendingTab.current;
    if (pending) {
      const settled = nextTab === pending.tab || Date.now() - pending.at > 5000;
      if (settled) pendingTab.current = null;
      else if (nextPath === INBOX_ROUTE && TAB_FAILED[pending.tab]) {
        pendingTab.current = null;
        logEvent('tab-failed', pending.tab);
        setToast(TAB_FAILED[pending.tab] ?? null);
      }
    }
    pathRef.current = nextPath;
    setPath(nextPath);
    setLayout(nextLayout);
    // The tab bar follows the URL the page reports, not the last thing tapped,
    // so a swipe back or an in-page link still moves the highlight.
    if (!storyUserForPath(nextPath)) setStoryUser(null);
    if (!lockOpen && !storiesOpen && nextTab) setTab(nextTab);
    else if (lockOpen) setTab('more');
  }, [lockOpen, storiesOpen]);

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
    if (!isSignedIn) { setStories([]); setStoryUser(null); setStoryUsers([]); }
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
    if (!lockRef.current && pathRef.current === INBOX_ROUTE) return;
    void notifyUnread(count);
  }, []);

  const saves = useRef(Promise.resolve());
  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    saves.current = saves.current.then(async () => {
      if (!await saveSettings(next)) setToast('Settings applied for this session, but couldn’t be saved. Please try again.');
    });
    web.current?.pushSettings(next);
  }, []);

  const openStory = useCallback((user: string) => {
    if (!settings.allowStories || !storyUserForPath(`/stories/${user}/`)) return;
    setStoryUsers(stories.map((ring) => ring.username));
    setStoryUser(user.toLowerCase());
    setStoriesOpen(false); setLockOpen(false); setTab('stories');
    setTarget({ path: `/stories/${user}/`, nonce: Date.now() });
  }, [settings.allowStories, stories]);

  const selectTab = useCallback(
    (next: TabId) => {
      logEvent('tap', next);
      if (next === 'stories') {
        setStoriesOpen(true); setLockOpen(false); setTab('stories'); return;
      }
      setStoriesOpen(false);
      if (next === 'more') {
        setLockOpen(true);
        setTab('more');
        return;
      }
      setLockOpen(false);
      setTab(next);
      pendingTab.current = { tab: next, at: Date.now() };
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
    setStories([]); setStoryUser(null); setStoryUsers([]); setUsername(null); void saveUsername(null);
    setUnread(0);
    unreadRef.current = 0;
    void setUnreadBadge(0);
    logEvent('sign-out');
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
      if (lockOpen || storiesOpen) {
        setLockOpen(false); setStoriesOpen(false); setTab(tabForPath(path) ?? 'inbox');
        return true;
      }
      if (path === INBOX_ROUTE) return false;
      web.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [lockOpen, storiesOpen, path]);

  if (!settingsReady) {
    // Same surface as a page load: the app should never show a second, different
    // "starting up" screen before the first one.
    return (
      <View style={styles.boot}>
        <StatusBar style={colors.bg === '#f5f5fa' ? 'dark' : 'light'} />
        <LoadingSurface visible />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style={colors.bg === '#f5f5fa' ? 'dark' : 'light'} />
      <View style={[styles.body, rail && { marginLeft: 88 }]}>
        <View pointerEvents={lockOpen || storiesOpen ? 'none' : 'auto'} accessibilityElementsHidden={lockOpen || storiesOpen} importantForAccessibility={lockOpen || storiesOpen ? 'no-hide-descendants' : 'auto'}
          style={[styles.webLayer, (lockOpen || storiesOpen) && styles.hidden, ((path.startsWith('/direct/') && path !== '/direct/inbox') || storyUserForPath(path)) && !keyboardOpen && !rail && { marginBottom: navHeight }]}>
          <IgWebView
            ref={web}
            settings={settings}
            onNotice={onNotice}
            onRoute={onRoute}
            onBlocked={onBlocked}
            onAccount={onAccount}
            onUnread={onUnread}
            onStories={setStories}
            onStoryRequest={openStory}
            storyUser={storyUser}
            storyUsers={storyUsers}
            bottomInset={navHeight}
            onLoadingChange={() => undefined}
            navigateTarget={target}
          />
        </View>

        {storiesOpen && <View style={styles.lockLayer}><StoriesScreen stories={stories} enabled={settings.allowStories} autoAdvance={settings.storiesAutoAdvance}
          onOpen={openStory} onSettings={() => { setStoriesOpen(false); setLockOpen(true); setTab('more'); }} /></View>}
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
          <View style={[styles.toast, { bottom: rail ? spacing.lg : navHeight + spacing.sm }]} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}
      </View>

      {!keyboardOpen && <TabBar active={tab} onSelect={selectTab} bottomInset={insets.bottom} onHeight={setNavHeight} unread={unread} />}
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

const makeStyles = (colors: Palette) => StyleSheet.create({
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
    backgroundColor: colors.surfaceRaised,
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
