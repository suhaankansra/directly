import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StoryRing } from '@directly/core';
import { useColors, type Palette, spacing } from '../theme';

type Props = { stories: StoryRing[]; enabled: boolean; autoAdvance: boolean; onOpen: (user: string) => void; onSettings: () => void };
export function StoriesScreen({ stories, enabled, autoAdvance, onOpen, onSettings }: Props) {
  const colors = useColors();
  const styles = makeStyles(colors);
  return <ScrollView style={styles.root} contentContainerStyle={styles.content}>
    <Text style={styles.title}>Stories</Text>
    <Text style={styles.note}>{!enabled ? 'Stories are off. Turn them on in More when you want to watch.' : autoAdvance ? 'Continue only to people in the available story list. Turn this off in More to stop after one person.' : 'Choose a person. Stop after their stories.'}</Text>
    {enabled && stories.length > 0 ? <View style={styles.rings}>{stories.map((story) => <Pressable key={story.username} accessibilityRole="button"
      accessibilityLabel={`Open ${story.username}’s stories${story.seen ? ', seen' : ''}`} onPress={() => onOpen(story.username)} style={styles.person}>
      <View style={[styles.ring, story.seen && styles.seen]}><Text style={styles.initial}>{story.username[0]?.toUpperCase()}</Text></View>
      <Text style={styles.name}>{story.username}</Text>
    </Pressable>)}</View> : <View style={styles.empty}><Text style={styles.heading}>{enabled ? 'No stories available here' : 'Your people, at your pace'}</Text>
      <Text style={styles.note}>{enabled ? 'Instagram hasn’t exposed story links on this page. Open a friend’s profile, then return to Stories. Directly won’t open the feed to populate this list.' : 'Stories stay off by default. Your messages are always available in Chats.'}</Text></View>}
    <Pressable accessibilityRole="button" onPress={onSettings} style={styles.button}><Text style={styles.buttonText}>Story settings</Text></Pressable>
  </ScrollView>;
}
const makeStyles = (colors: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg }, content: { padding: spacing.lg, paddingBottom: 130, gap: 18 },
  title: { color: colors.text, fontSize: 30, fontWeight: '700' }, note: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  rings: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, person: { width: 88, alignItems: 'center', gap: 9 },
  ring: { width: 66, height: 66, borderRadius: 33, borderWidth: 3, borderColor: '#b875e8', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  seen: { borderColor: colors.muted }, initial: { color: colors.text, fontSize: 24 }, name: { color: colors.text, textAlign: 'center', fontSize: 12 },
  empty: { paddingVertical: 32, gap: 12 }, heading: { color: colors.text, fontSize: 20, fontWeight: '600' },
  button: { alignSelf: 'flex-start', backgroundColor: colors.accent, padding: 14, borderRadius: 18 }, buttonText: { color: '#fff', fontWeight: '600' },
});
