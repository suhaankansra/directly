import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Settings } from '@directly/core';
import { colors, useColors, type Palette } from '../theme';

type Props = { visible: boolean; settings: Settings; onChange: (settings: Settings) => void; onClose: () => void };
export function FocusControls({ visible, settings, onChange, onClose }: Props) {
  const colors = useColors();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduceMotion(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; sub.remove(); };
  }, []);
  const ios = Platform.OS === 'ios';
  const full = height < 650 || fontScale > 1.4;
  function toggle(key: keyof Settings, label: string, detail: string, disabled = false) {
    return <View style={styles.row} key={key}>
      <View style={styles.copy}><Text style={styles.label}>{label}</Text><Text style={styles.detail}>{detail}</Text></View>
      <Switch accessibilityLabel={label} accessibilityHint={detail} disabled={disabled} value={settings[key]}
        onValueChange={(value) => onChange({ ...settings, [key]: value })} trackColor={{ true: colors.accent }} />
    </View>;
  }
  return <Modal visible={visible} onRequestClose={onClose} animationType={reduceMotion ? 'none' : 'slide'}
    allowSwipeDismissal={ios} presentationStyle={ios ? 'pageSheet' : 'overFullScreen'} transparent={!ios}>
    <View style={[styles.frame, !ios && styles.androidFrame]}>
      {!ios && <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Dismiss Focus controls" onPress={onClose} />}
      <View style={[styles.sheet, !ios && styles.androidSheet, !ios && !full && { maxHeight: height * 0.85 }, { paddingBottom: insets.bottom }]}>
        {!ios && <View style={styles.handle} />}
        <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>Focus controls</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.done} android_ripple={{ color: '#6c5ce733' }}><Text style={styles.doneText}>Done</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.detail}>Choose what stays out of your way.</Text>
          <Text accessibilityRole="header" style={styles.section}>Always protected</Text>
          <View style={styles.group}>{['Feed', 'Explore', 'Endless Reels'].map((name) => <View key={name} style={styles.row} accessible accessibilityLabel={`${name}, blocked`}>
            <Text style={styles.label}>{name}</Text><Text style={styles.blocked}>Blocked</Text>
          </View>)}</View>
          <Text accessibilityRole="header" style={styles.section}>Reels shared with you</Text>
          <View style={styles.group}>{toggle('allowReelsFromDms', 'Allow shared reels', 'One reel or post from a DM or profile. No next-item browsing.')}</View>
          <Text accessibilityRole="header" style={styles.section}>Stories</Text>
          <View style={styles.group}>
            {toggle('allowStories', 'Allow stories', 'Off by default. Choose a person to watch.')}
            {toggle('storiesAutoAdvance', 'Continue to another friend', settings.allowStories ? 'When off, stop after the friend you chose. When on, continue only to people in the available story list.' : 'Turn on stories to change this.', !settings.allowStories)}
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const makeStyles = (colors: Palette) => StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.bg }, androidFrame: { backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { flex: 1, backgroundColor: colors.bg }, androidSheet: { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  handle: { alignSelf: 'center', width: 32, height: 4, borderRadius: 2, backgroundColor: colors.muted, marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, gap: 8 },
  title: { flex: 1, color: colors.text, fontSize: 23, fontWeight: '700' }, done: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: colors.accent, fontSize: 16, fontWeight: '600' }, content: { padding: 20, paddingBottom: 40, gap: 12 },
  section: { color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 12 }, group: { borderRadius: Platform.OS === 'ios' ? 12 : 20, backgroundColor: colors.surfaceRaised, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingVertical: 12, gap: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  copy: { flex: 1, gap: 4 }, label: { fontSize: 16, color: colors.text }, detail: { fontSize: 13, lineHeight: 20, color: colors.muted }, blocked: { fontSize: 14, color: colors.muted },
});
