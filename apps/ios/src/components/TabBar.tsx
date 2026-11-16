import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { TabId } from '@directly/core';

import { Glass } from './Glass';
import { colors, radius, spacing } from '../theme';

type Props = {
  active: TabId | null;
  onSelect: (tab: TabId) => void;
  bottomInset: number;
  /** Unread DMs, as a count only — the page never sends who or what. */
  unread?: number;
};

const ORDER: TabId[] = ['inbox', 'activity', 'profile', 'lock'];

const LABELS: Record<TabId, string> = {
  inbox: 'DMs',
  activity: 'Activity',
  profile: 'Profile',
  lock: 'Lock',
};

function Icon({ tab, active }: { tab: TabId; active: boolean }) {
  const stroke = active ? colors.accent : colors.muted;
  const common = {
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      {tab === 'inbox' ? (
        <Path
          {...common}
          d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.6-.7L3 21l1.9-4.8a8 8 0 0 1-.9-3.7 8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8 7.4Z"
        />
      ) : null}
      {tab === 'activity' ? (
        <Path
          {...common}
          d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1Z"
        />
      ) : null}
      {tab === 'profile' ? (
        <>
          <Circle cx={12} cy={8} r={3.6} {...common} />
          <Path {...common} d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </>
      ) : null}
      {tab === 'lock' ? (
        <>
          <Rect x={4.5} y={10.5} width={15} height={10} rx={2.5} {...common} />
          <Path {...common} d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </>
      ) : null}
    </Svg>
  );
}

const IOS = Platform.OS === 'ios';

export function TabBar({ active, onSelect, bottomInset, unread = 0 }: Props) {
  return (
    <View
      style={[
        styles.bar,
        IOS ? styles.barIos : styles.barAndroid,
        { paddingBottom: Math.max(bottomInset, spacing.sm) },
      ]}
    >
      {/* iOS floats a glass sheet over the page; Android uses a solid tonal
       * surface with a Material indicator, so there is nothing to blur. */}
      {IOS ? <Glass style={StyleSheet.absoluteFill} intensity={80} cornerRadius={0} /> : null}
      {ORDER.map((tab) => {
        const isActive = active === tab;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={LABELS[tab]}
            onPress={() => onSelect(tab)}
            android_ripple={IOS ? undefined : { color: 'rgba(255,255,255,0.07)', borderless: true }}
            style={({ pressed }) => [
              styles.item,
              !IOS && styles.itemAndroid,
              isActive && (IOS ? styles.itemActiveIos : styles.itemActiveAndroid),
              pressed && styles.pressed,
            ]}
          >
            {isActive && !IOS ? <View style={styles.indicator} pointerEvents="none" /> : null}
            <View style={styles.iconWrap}>
              <Icon tab={tab} active={isActive} />
              {tab === 'inbox' && unread > 0 ? (
                <View style={styles.badge} pointerEvents="none">
                  <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[
                styles.label,
                isActive && (IOS ? styles.labelActiveIos : styles.labelActiveAndroid),
                isActive && !IOS && styles.labelActiveAndroidWeight,
              ]}
            >
              {LABELS[tab]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  /** iOS: the Glass layer supplies fill, sheen and rim. */
  barIos: {
    backgroundColor: 'transparent',
  },
  /** Android: a navigation bar sits on its own tonal surface. */
  barAndroid: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    elevation: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 5,
    marginHorizontal: 4,
    borderRadius: radius.md,
  },
  itemAndroid: {
    // The frozen indicator is absolutely positioned; clipping keeps it a pill.
    overflow: 'hidden',
  },
  /** The pill that sits behind the icon, as Material's active indicator. */
  indicator: {
    position: 'absolute',
    top: 3,
    width: 64,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  itemActiveIos: {
    backgroundColor: 'rgba(108,92,231,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168,158,255,0.55)',
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  itemActiveAndroid: {
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.7,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Sits on the icon, not the label, so it reads as part of the DM tab. */
  badge: {
    position: 'absolute',
    top: -5,
    right: -11,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  label: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '500',
  },
  labelActiveIos: {
    color: colors.accent,
  },
  labelActiveAndroid: {
    color: colors.text,
  },
  labelActiveAndroidWeight: {
    fontWeight: '600',
  },
});
