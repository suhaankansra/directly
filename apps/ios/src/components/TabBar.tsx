import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { TabId } from '@directly/core';

import { colors, radius, spacing } from '../theme';

type Props = {
  active: TabId | null;
  onSelect: (tab: TabId) => void;
  bottomInset: number;
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

export function TabBar({ active, onSelect, bottomInset }: Props) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(bottomInset, spacing.sm) }]}>
      {ORDER.map((tab) => {
        const isActive = active === tab;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={LABELS[tab]}
            onPress={() => onSelect(tab)}
            style={({ pressed }) => [styles.item, isActive && styles.itemActive, pressed && styles.pressed]}
          >
            <Icon tab={tab} active={isActive} />
            <Text style={[styles.label, isActive && styles.labelActive]}>{LABELS[tab]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#111114',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
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
  itemActive: {
    backgroundColor: colors.accentSoft,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '500',
  },
  labelActive: {
    color: colors.accent,
  },
});
