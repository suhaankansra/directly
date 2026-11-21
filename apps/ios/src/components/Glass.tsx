import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useColors } from '../theme';
import { useColorScheme } from 'react-native';
import { GlassView, isLiquidGlassAvailable, isGlassEffectAPIAvailable } from 'expo-glass-effect';

type Props = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Strength of the translucent fill, 0-100. */
  intensity?: number;
  /** Corner radius of the shell; 0 for edge-to-edge bars. */
  cornerRadius?: number;
};

/**
 * Native Liquid Glass on supported iOS builds; readable opaque fallback elsewhere.
 *
 * Reduce Transparency is observed live and defaults to the safe opaque state.
 */
export function Glass({ children, style, cornerRadius = 18 }: Props) {
  const colors = useColors();
  const scheme = useColorScheme();
  const [contrast, setContrast] = useState(true);
  const [opaque, setOpaque] = useState(true);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => { if (alive) setOpaque(value); });
    void AccessibilityInfo.isDarkerSystemColorsEnabled().then((value) => { if (alive) setContrast(value); }).catch(() => undefined);
    const contrastSub = AccessibilityInfo.addEventListener('darkerSystemColorsChanged', setContrast);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOpaque);
    return () => { alive = false; sub.remove(); contrastSub.remove(); };
  }, []);
  let available = false;
  try { available = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { /* native rebuild pending */ }
  if (!opaque && !contrast && available) return <GlassView glassEffectStyle="regular" colorScheme={scheme === 'light' ? 'light' : 'dark'} style={[styles.shell, { borderRadius: cornerRadius }, style]}>{children}</GlassView>;
  return <View style={[styles.shell, { borderRadius: cornerRadius, backgroundColor: colors.surfaceRaised }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
});
