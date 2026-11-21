import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { TabId } from '@directly/core';
import { Glass } from './Glass';
import { useColors, type Palette } from '../theme';

type Props = { active: TabId | null; onSelect: (tab: TabId) => void; bottomInset: number; unread?: number; onHeight?: (height: number) => void };
const ORDER: TabId[] = ['inbox', 'stories', 'activity', 'profile', 'more'];
const LABELS: Record<TabId, string> = { inbox: 'Chats', stories: 'Stories', activity: 'Activity', profile: 'Profile', more: 'More' };
function Icon({ tab, active }: { tab: TabId; active: boolean }) {
  const colors = useColors();
  const common = { stroke: active ? colors.text : colors.muted, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <Svg width={23} height={23} viewBox="0 0 24 24" aria-hidden>
    {tab === 'inbox' && <Path {...common} d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.6-.7L3 21l1.9-4.8a8 8 0 0 1-.9-3.7 8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8 7.4Z" />}
    {tab === 'stories' && <Circle {...common} cx={12} cy={12} r={9} strokeDasharray="5 3" />}
    {tab === 'activity' && <Path {...common} d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1Z" />}
    {tab === 'profile' && <><Circle {...common} cx={12} cy={8} r={3.6} /><Path {...common} d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>}
    {tab === 'more' && <>{[5, 12, 19].map((cx) => <Circle key={cx} {...common} cx={cx} cy={12} r={1} />)}</>}
  </Svg>;
}
export function TabBar({ active, onSelect, bottomInset, unread = 0, onHeight }: Props) {
  const colors = useColors();
  const styles = makeStyles(colors);
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(true);
  const slide = useRef(new Animated.Value(0)).current;
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const rail = Platform.OS === 'android' && windowWidth >= 840 && fontScale <= 1.4;
  const index = active ? ORDER.indexOf(active) : -1;
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReduceMotion(value); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; sub.remove(); };
  }, []);
  useEffect(() => {
    const animation = Animated.timing(slide, { toValue: Math.max(index, 0) * (rail ? 76 : width / 5), duration: reduceMotion ? 0 : 180, useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [index, width, rail, reduceMotion, slide]);
  return <View onLayout={(event) => { if (!rail) onHeight?.(event.nativeEvent.layout.height + Math.max(bottomInset, 12)); }} style={[styles.position, Platform.OS === 'android' && { left: 0, right: 0 }, rail ? { left: 0, right: undefined, top: 0, bottom: bottomInset, width: 88 } : { bottom: Platform.OS === 'android' ? bottomInset : Math.max(bottomInset, 12) }]}>
    <View style={[styles.bar, Platform.OS === 'android' && styles.androidBar, rail && styles.rail]} onLayout={(event) => setWidth(event.nativeEvent.layout.width - 10)}>
      {Platform.OS === 'ios' && <Glass style={StyleSheet.absoluteFill} intensity={62} cornerRadius={34} />}
      {index >= 0 && width > 0 && <Animated.View pointerEvents="none" style={[styles.pill, Platform.OS === 'android' && styles.androidPill, { width: rail ? 78 : width / 5, transform: rail ? [{ translateY: slide }] : [{ translateX: slide }] }]} />}
      {ORDER.map((tab) => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: active === tab }}
        accessibilityLabel={tab === 'inbox' && unread ? `${LABELS[tab]}, ${unread} unread` : LABELS[tab]}
        onPress={() => onSelect(tab)} android_ripple={Platform.OS === 'android' ? { color: '#6c5ce733' } : undefined} style={({ pressed }) => [styles.item, rail && styles.railItem, pressed && { opacity: 0.65 }]}>
        <View><Icon tab={tab} active={active === tab} />{tab === 'inbox' && unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>}</View>
        <Text style={[styles.label, active === tab && { color: colors.text }]}>{LABELS[tab]}</Text>
      </Pressable>)}
    </View>
  </View>;
}
const makeStyles = (colors: Palette) => StyleSheet.create({
  position: { position: 'absolute', left: 12, right: 12 },
  bar: { flexDirection: 'row', padding: 5, borderRadius: 34, minHeight: 68, backgroundColor: Platform.OS === 'android' ? colors.surface : 'transparent' },
  rail: { flex: 1, flexDirection: 'column', paddingTop: 5 },
  railItem: { flex: 0, height: 76 },
  androidBar: { borderRadius: 0, minHeight: 80 },
  androidPill: { top: 5, bottom: undefined, height: 32, borderRadius: 20, backgroundColor: colors.accentSoft },
  item: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 5 },
  pill: { position: 'absolute', top: 5, bottom: 5, left: 5, borderRadius: 29, backgroundColor: 'rgba(210,202,255,0.16)' },
  label: { fontSize: 10, color: colors.muted, textAlign: 'center' },
  badge: { position: 'absolute', right: -12, top: -6, backgroundColor: colors.accent, borderRadius: 10, minWidth: 17, paddingHorizontal: 4, alignItems: 'center' },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
