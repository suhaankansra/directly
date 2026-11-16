import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';
import { Glass } from './Glass';

type Props = {
  /** True from the moment a load starts until its first real paint. */
  visible: boolean;
};

const IOS = Platform.OS === 'ios';

/**
 * The surface shown while Instagram loads.
 *
 * Two jobs: cover Instagram's own pre-hydration paint (it flashes its logo
 * before its app boots, which reads as someone else's splash screen), and do it
 * in the platform's own language — a layered, translucent sheet on iOS, a plain
 * Material surface with a single accent indicator on Android.
 *
 * Dependency-free on purpose, like Glass: a native blur cannot sample a WebView
 * on Android, so the material is built from translucent views instead.
 */
export function LoadingSurface({ visible }: Props) {
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  // Kept mounted through the fade-out so the surface never cuts mid-frame.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: visible ? 120 : 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [fade, visible]);

  useEffect(() => {
    if (!visible) return;
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    breathe.start();
    return () => breathe.stop();
  }, [pulse, visible]);

  useEffect(() => {
    if (!IOS || !visible) return;
    const sheen = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(420),
        Animated.timing(sweep, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    sheen.start();
    return () => sheen.stop();
  }, [sweep, visible]);

  if (!mounted) return null;

  const markScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.04] });
  const markOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-160, 220] });

  return (
    <Animated.View
      style={[styles.root, { opacity: fade }]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      {IOS ? (
        <View style={styles.card}>
          <Glass intensity={22} cornerRadius={28} style={styles.glass}>
            <Animated.View style={[styles.sweep, { transform: [{ translateX: sweepX }] }]} pointerEvents="none" />
            <Animated.View
              style={[styles.mark, { transform: [{ scale: markScale }], opacity: markOpacity }]}
              pointerEvents="none"
            />
            <Text style={styles.iosLabel}>Directly</Text>
          </Glass>
        </View>
      ) : (
        <View style={styles.androidBody}>
          <Animated.View style={[styles.mark, { transform: [{ scale: markScale }], opacity: markOpacity }]} />
          <ActivityIndicator size={26} color={colors.accent} style={styles.androidSpinner} />
          <Text style={styles.androidLabel}>Loading</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  /**
   * iOS: a floating sheet rather than a full-bleed spinner. The card carries its
   * own rim and sheen (Glass), and the sweep is clipped by its overflow.
   */
  card: {
    width: 196,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
  },
  glass: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  sweep: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    width: 84,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    transform: [{ rotate: '18deg' }],
  },
  mark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(108,92,231,0.65)',
  },
  iosLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  /** Android: Material's surface plus one accent indicator; no materials. */
  androidBody: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  androidSpinner: {
    marginTop: spacing.md,
  },
  androidLabel: {
    color: colors.muted,
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
