import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Strength of the translucent fill, 0-100. */
  intensity?: number;
  /** Corner radius of the shell; 0 for edge-to-edge bars. */
  cornerRadius?: number;
};

/**
 * A glass surface built from plain views: a translucent fill, a lighter sheen
 * across the top half, and a bright rim so the edge reads as material rather
 * than a painted slab.
 *
 * Deliberately dependency-free. A native backdrop blur cannot sample a WebView
 * on Android (it draws into its own surface), so the blur path only ever paid
 * off on iOS while adding a native module to both builds. Layered views give the
 * same material on both platforms with no native code.
 */
export function Glass({ children, style, intensity = 60, cornerRadius = 18 }: Props) {
  const alpha = Math.min(0.9, Math.max(0.25, intensity / 100 + 0.22));
  return (
    <View style={[styles.shell, { borderRadius: cornerRadius }, style]}>
      <View
        style={[styles.fill, { backgroundColor: `rgba(15,15,20,${alpha.toFixed(3)})` }]}
        pointerEvents="none"
      />
      <View
        style={[styles.sheen, { borderTopLeftRadius: cornerRadius, borderTopRightRadius: cornerRadius }]}
        pointerEvents="none"
      />
      <View style={[styles.rim, { borderRadius: cornerRadius }]} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  /** The specular highlight: brighter at the top edge, fading downward. */
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48%',
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  rim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
});
