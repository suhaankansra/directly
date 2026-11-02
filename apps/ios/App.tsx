import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DEFAULT_SETTINGS,
  INBOX_PATH,
  pathForTab,
  type Layout,
  type Settings,
  type TabId,
} from '@directly/core';

import { IgWebView, type IgWebViewHandle } from './src/components/IgWebView';
import { TabBar } from './src/components/TabBar';
import { LockScreen } from './src/screens/LockScreen';
import { loadSettings, saveSettings } from './src/lib/settings';
import { colors, radius, spacing } from './src/theme';

const VERSION = '0.1.0';
const BLOCK_TOAST = 'Directly — that isn’t here';

function Shell() {
  const insets = useSafeAreaInsets();
  const web = useRef<IgWebViewHandle>(null);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [tab, setTab] = useState<TabId | null>('inbox');
  const [path, setPath] = useState<string>(INBOX_PATH);
  const [username, setUsername] = useState<string | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [target, setTarget] = useState<{ path: string; nonce: number } | null>(null);
  const [, setLayout] = useState<Layout>('mobile');

  useEffect(() => {
    let cancelled = false;
    void loadSettings().then((loaded) => {
      if (cancelled) return;
      setSettings(loaded);
      setSettingsReady(true);
    });
    return () => {
      cancelled = true;
    };
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

  const onRoute = useCallback((nextPath: string, nextLayout: Layout, _pin: string | null, nextTab: TabId | null) => {
    setPath(nextPath);
    setLayout(nextLayout);
    // The tab bar follows the URL the page reports, not the last thing tapped,
    // so a swipe back or an in-page link still moves the highlight.
    if (nextTab) setTab(nextTab);
    else if (lockOpen) setTab('lock');
  }, [lockOpen]);

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
      const destination = pathForTab(next, username);
      setTarget({ path: destination, nonce: Date.now() });
    },
    [username],
  );

  const signOut = useCallback(async () => {
    // Best-effort: clearing the WebView's cookie jar requires the optional
    // native module, which is only present in a development/production build.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cookies = require('@react-native-cookies/cookies');
      await cookies.default.clearAll(true);
    } catch {
      // Expo Go has no native cookie module; signing out from Instagram's own
      // page below still ends the session server-side.
    }
    setLockOpen(false);
    setTab('inbox');
    web.current?.navigate('/accounts/logout/');
    web.current?.reload();
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
    return (
      <View style={styles.boot}>
        <StatusBar style="light" />
        <View style={styles.bootMark} />
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
            onRoute={onRoute}
            onBlocked={onBlocked}
            onAccount={setUsername}
            onLoadingChange={() => undefined}
            navigateTarget={target}
          />
        </View>

        {lockOpen ? (
          <View style={styles.lockLayer}>
            <LockScreen
              settings={settings}
              username={username}
              onChange={updateSettings}
              onOpenProfile={() => {
                setLockOpen(false);
                setTab('profile');
                if (username) setTarget({ path: `/${username}/`, nonce: Date.now() });
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

      <TabBar active={tab} onSelect={selectTab} bottomInset={insets.bottom} />
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
  boot: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  bootMark: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
  },
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: '#232329',
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  toastText: { color: colors.text, fontSize: 13, fontWeight: '500' },
});
