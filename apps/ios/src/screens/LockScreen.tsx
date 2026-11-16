import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { Settings } from '@directly/core';

import { colors, radius, spacing } from '../theme';

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
  onChange: (next: Settings) => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
  version: string;
};

type Row = {
  key: keyof Settings;
  title: string;
  detail: string;
};

const ROWS: Row[] = [
  {
    key: 'allowReelsFromDms',
    title: 'One reel or post from a DM',
    detail: 'Opens what a friend sent. Swiping to the next one stays off.',
  },
  {
    key: 'allowStories',
    title: 'Stories',
    detail: 'Off by default — a story session is an endless tap.',
  },
  {
    key: 'showBlockToast',
    title: 'Explain redirects',
    detail: 'Say “that’s not here” when something is blocked.',
  },
  {
    key: 'debug',
    title: 'Debug logging',
    detail: 'Local diagnostics only. Nothing leaves the phone.',
  },
];

export function LockScreen({
  settings,
  username,
  signedIn,
  unread,
  unreadAt,
  path,
  onChange,
  onOpenProfile,
  onSignOut,
  version,
}: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  // Deliberately the same facts the card shows: no message, no cookie, no
  // credential. Copying is how these get off a phone that has no console.
  const report = [
    `Directly ${version}`,
    `platform ${Platform.OS}`,
    signedIn ? `signed in as @${username ?? 'unknown'}` : 'not signed in',
    `path ${path}`,
    unreadAt === null
      ? 'unread unknown - no inbox link was read'
      : `unread ${unread} (read ${new Date(unreadAt).toISOString()})`,
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
      <Text style={styles.title}>Lock</Text>
      <Text style={styles.subtitle}>What this app is allowed to do.</Text>

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
              onPress={onSignOut}
              style={({ pressed }) => [styles.button, styles.buttonGhost, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, styles.buttonGhostText]}>Sign out</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What you keep</Text>
        {ROWS.map((row, index) => (
          <View key={row.key} style={[styles.row, index > 0 && styles.rowDivided]}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.note}>{row.detail}</Text>
            </View>
            <Switch
              accessibilityLabel={row.title}
              value={settings[row.key]}
              onValueChange={(value) => onChange({ ...settings, [row.key]: value })}
              trackColor={{ false: '#2a2a33', true: colors.accentSoft }}
              thumbColor={settings[row.key] ? colors.accent : '#7a7a86'}
              ios_backgroundColor="#2a2a33"
            />
          </View>
        ))}
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy diagnostics"
            onPress={() => void copyReport()}
            style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>{copied ? 'Copied' : 'Copy diagnostics'}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Privacy</Text>
        <Text style={styles.note}>
          There is no account, no analytics and no server. The app changes what Instagram shows you;
          it does not read, store or send your messages, and it never automates anything on your
          behalf. Your session lives in this app’s web view exactly as it would in a browser.
        </Text>
      </View>

      <Text style={styles.version}>Directly {version}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  title: { color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: -spacing.sm },
  card: {
    // Glass surface: translucent fill, bright rim, soft cast shadow.
    backgroundColor: 'rgba(23,23,28,0.72)',
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
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
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
  copyButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: '600' },
  version: { color: colors.muted, fontSize: 11.5, textAlign: 'center', marginTop: spacing.sm },
});
