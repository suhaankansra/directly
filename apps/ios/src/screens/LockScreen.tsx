import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { Settings } from '@directly/core';

import { clearDiagnostics, clock, reportLines, useDiagnostics } from '../lib/diagnostics';
import { FocusControls } from './FocusControls';
import { useColors, type Palette, radius, spacing } from '../theme';

type Props = {
  settings: Settings;
  username: string | null;
  /** Whether a session exists in the web view — not the same as knowing the name. */
  signedIn: boolean;
  /** Last unread count the page reported; 0 until one arrives. */
  unread: number;
  /** When that count arrived, or null if the page has never reported one. */
  unreadAt: number | null;
  /** The route the page is on, so a copied report says where it went wrong. */
  path: string;
  /** DM alerts on or off, and whether the OS has ruled them out entirely. */
  alerts: boolean;
  alertsBlocked: boolean;
  onAlertsChange: (next: boolean) => void;
  onChange: (next: Settings) => void;
  onOpenProfile: () => void;
  /** Opens Instagram's own account menu — the only switcher that exists here. */
  onSwitchAccount: () => void;
  onSignOut: () => void;
  version: string;
};

export function LockScreen({
  settings,
  username,
  signedIn,
  unread,
  unreadAt,
  path,
  alerts,
  alertsBlocked,
  onAlertsChange,
  onChange,
  onOpenProfile,
  onSwitchAccount,
  onSignOut,
  version,
}: Props) {
  const colors = useColors();
  const styles = makeStyles(colors);
  const [focusOpen, setFocusOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Recorded whether or not the switch is on, so turning it on after something
  // went wrong still shows what led there; the switch decides what is shown.
  const diagnostics = useDiagnostics();

  // Five taps on the version footer. Nothing is stored and nothing unlocks: the
  // app has no feed, no account and no server, so the only reward it can offer is
  // saying so. Bounded on both ends — a tap cluster expires after a second, and the
  // line goes away again — because a permanent extra row would just be clutter.
  const taps = useRef<{ count: number; at: number }>({ count: 0, at: 0 });
  const [easterEgg, setEasterEgg] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!easterEgg) return;
    const timer = setTimeout(() => setEasterEgg(false), 6000);
    return () => clearTimeout(timer);
  }, [easterEgg]);

  const onVersionTap = useCallback(() => {
    const now = Date.now();
    const previous = taps.current;
    const count = now - previous.at < 1000 ? previous.count + 1 : 1;
    taps.current = { count, at: now };
    if (count >= 5) {
      taps.current = { count: 0, at: 0 };
      setEasterEgg(true);
    }
  }, []);

  // Deliberately the same facts the card shows: no message, no cookie, no
  // credential. Copying is how these get off a phone that has no console.
  const logLines = reportLines();
  const report = [
    `Directly ${version}`,
    `platform ${Platform.OS} ${String(Platform.Version)}`,
    signedIn ? `signed in as @${username ?? 'unknown'}` : 'not signed in',
    `path ${path}`,
    unreadAt === null
      ? 'unread unknown - no inbox link was read'
      : `unread ${unread} (read ${new Date(unreadAt).toISOString()})`,
    '--- decisions, oldest first ---',
    ...(logLines.length > 0 ? logLines : ['nothing recorded']),
  ].join('\n');

  const copyReport = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(report);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [report]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>More</Text>
      <Text style={styles.subtitle}>What this app is allowed to do.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Focus</Text>
        <Text style={styles.note}>Feed, Explore, and endless Reels are always blocked.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Focus controls" onPress={() => setFocusOpen(true)} style={styles.button}>
          <Text style={styles.buttonText}>Focus controls</Text>
        </Pressable>
      </View>
      <FocusControls visible={focusOpen} settings={settings} onChange={onChange} onClose={() => setFocusOpen(false)} />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Alerts</Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>New messages</Text>
            <Text style={styles.note}>
              {alertsBlocked
                ? 'Notifications are off for Directly in your device settings. This switch cannot override that.'
                : 'A banner while Directly is open. Instagram’s push cannot reach a web view, and there is no server here to forward it.'}
            </Text>
          </View>
          <Switch
            accessibilityLabel="New message alerts"
            value={alerts}
            disabled={alertsBlocked}
            onValueChange={onAlertsChange}
            trackColor={{ false: '#2a2a33', true: colors.accentSoft }}
            thumbColor={alerts ? colors.accent : '#7a7a86'}
            ios_backgroundColor="#2a2a33"
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Preferences</Text>
        <Text style={styles.note}>Appearance follows your device’s light or dark setting.</Text>
        <View style={styles.row}><View style={styles.rowText}><Text style={styles.rowTitle}>Explain redirects</Text><Text style={styles.note}>Explain when a blocked page returns to Chats.</Text></View>
          <Switch accessibilityLabel="Explain redirects" value={settings.showBlockToast} onValueChange={(value) => onChange({ ...settings, showBlockToast: value })} /></View>
        <View style={styles.row}><View style={styles.rowText}><Text style={styles.rowTitle}>Debug logging</Text><Text style={styles.note}>Local diagnostics only. Nothing leaves the phone.</Text></View>
          <Switch accessibilityLabel="Debug logging" value={settings.debug} onValueChange={(value) => onChange({ ...settings, debug: value })} /></View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.account}>
          {username ? `@${username}` : signedIn ? 'Signed in' : 'Not signed in'}
        </Text>
        <Text style={styles.note}>
          {signedIn
            ? 'You are signed in inside this app’s own web view. Directly never sees your password, your cookies or your messages.'
            : 'Sign in on the DMs tab. The session lives in this app’s own web view — Directly never sees your password, your cookies or your messages.'}
        </Text>
        {signedIn ? (
          <>
            <View style={styles.buttons}>
              <Pressable
                accessibilityRole="button"
                onPress={onOpenProfile}
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              >
                <Text style={styles.buttonText}>View profile</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Opens Instagram’s own account menu"
                onPress={onSwitchAccount}
                style={({ pressed }) => [styles.button, styles.buttonGhost, pressed && styles.pressed]}
              >
                <Text style={[styles.buttonText, styles.buttonGhostText]}>Switch account</Text>
              </Pressable>
            </View>
            <Text style={[styles.note, styles.accountNote]}>
              One session lives in this web view, so a second account is switched with Instagram’s own
              menu. Directly never stores a second login.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={onSignOut}
              style={({ pressed }) => [styles.button, styles.buttonGhost, styles.signOut, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, styles.buttonGhostText]}>Sign out</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      {settings.debug ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Diagnostics</Text>
          <Text style={styles.note}>
            {unreadAt === null
              ? 'Unread: nothing yet — no inbox link has been read on this page.'
              : `Unread: ${unread}, last read ${new Date(unreadAt).toLocaleTimeString()}.`}
          </Text>
          <Text style={styles.note}>
            Shown only while Debug logging is on. A count of 0 with a timestamp means the inbox link
            was found and had no badge; “nothing yet” means the selector never matched.
          </Text>
          <Text style={[styles.note, styles.logIntro]}>
            Every navigation decision, newest first. Kept in memory on this phone and gone when the
            app closes: routes, verdicts and link hosts — never a message.
          </Text>
          <View style={styles.log}>
            {diagnostics.length === 0 ? (
              <Text style={styles.logLine}>Nothing recorded yet — open a DM or tap a tab.</Text>
            ) : (
              [...diagnostics].reverse().map((entry, index) => (
                <Text key={`${entry.at}-${index}`} style={styles.logLine} numberOfLines={2}>
                  <Text style={styles.logTime}>{clock(entry.at)} </Text>
                  {entry.kind}
                  {entry.detail ? ` ${entry.detail}` : ''}
                </Text>
              ))
            )}
          </View>
          <View style={styles.buttons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy diagnostics"
              onPress={() => void copyReport()}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            >
              <Text style={styles.buttonText}>{copied ? 'Copied' : 'Copy diagnostics'}</Text>
            </Pressable>
            {diagnostics.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={clearDiagnostics}
                style={({ pressed }) => [styles.button, styles.buttonGhost, pressed && styles.pressed]}
              >
                <Text style={[styles.buttonText, styles.buttonGhostText]}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Support</Text>
        <Text style={styles.note}>
          There is no account, no analytics and no server. The app changes what Instagram shows you;
          it does not read, store or send your messages, and it never automates anything on your
          behalf. Your session lives in this app’s web view exactly as it would in a browser.
        </Text>
      </View>

      <View style={styles.buttons}>
        <Pressable accessibilityRole="link" style={styles.button} onPress={() => void Linking.openURL('https://suhaankansra.github.io/directly/help.html')}><Text style={styles.buttonText}>Help</Text></Pressable>
        <Pressable accessibilityRole="link" style={styles.button} onPress={() => void Linking.openURL('https://suhaankansra.github.io/directly/privacy.html')}><Text style={styles.buttonText}>Privacy policy</Text></Pressable>
      </View>
      <Pressable onPress={onVersionTap} hitSlop={12} style={styles.versionTarget}>
        <Text style={styles.version}>Directly {version}</Text>
        {easterEgg ? (
          <Text style={styles.easterEgg}>No feed down here either.</Text>
        ) : null}
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 130, gap: spacing.md },
  title: { color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: -spacing.sm },
  card: {
    // Glass surface: translucent fill, bright rim, soft cast shadow.
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  account: { color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: 4 },
  note: { color: colors.muted, fontSize: 12.5, lineHeight: 18 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  accountNote: { marginTop: spacing.sm },
  signOut: { alignSelf: 'flex-start', marginTop: spacing.sm },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 13.5 },
  buttonGhostText: { color: colors.text },
  pressed: { opacity: 0.75 },
  logIntro: { marginTop: spacing.sm },
  log: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: 10,
    gap: 3,
  },
  logLine: { color: colors.text, fontSize: 11, lineHeight: 15, fontVariant: ['tabular-nums'] },
  logTime: { color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: '600' },
  versionTarget: { alignItems: 'center', marginTop: spacing.sm },
  version: { color: colors.muted, fontSize: 11.5, textAlign: 'center' },
  easterEgg: { color: colors.accent, fontSize: 11.5, textAlign: 'center', marginTop: 2 },
});
