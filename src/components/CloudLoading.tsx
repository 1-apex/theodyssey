// Loading screen: the ocean with pixel clouds drifting slowly across it, message in the middle.
// Each cloud is one native-driven transform loop; loops stop on unmount and are skipped
// (clouds sit still) when the system asks for reduced motion.

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from './PixelSprite';
import { SeaLines } from './PixelScene';
import { BigCloud, CLOUD_COLS, CLOUD_ROW_COUNT } from './BigCloud';
import { fonts } from '../theme/typography';

/** Height as a fraction of the screen, size as a fraction of 448, seconds to cross, starting phase 0..1. */
const CLOUDS = [
  { y: 0.06, size: 0.5, secs: 60, phase: 0.1 },
  { y: 0.2, size: 0.34, secs: 44, phase: 0.62 },
  { y: 0.36, size: 0.62, secs: 78, phase: 0.35 },
  { y: 0.58, size: 0.4, secs: 52, phase: 0.85 },
  { y: 0.72, size: 0.56, secs: 70, phase: 0.2 },
  { y: 0.87, size: 0.3, secs: 40, phase: 0.5 },
];

function DriftingCloud({ y, size, secs, phase, width, height, still }: (typeof CLOUDS)[number] & { width: number; height: number; still: boolean }) {
  const w = Math.min(width, 448) * size;
  const h = (w * CLOUD_ROW_COUNT) / CLOUD_COLS;
  const [t] = useState(() => new Animated.Value(phase));
  useEffect(() => {
    if (still) return;
    const native = Platform.OS !== 'web';
    const lap = (from: number) =>
      Animated.timing(t, { toValue: 1, duration: secs * 1000 * (1 - from), easing: Easing.linear, useNativeDriver: native });
    const animation = Animated.sequence([
      lap(phase),
      Animated.loop(Animated.timing(t, { toValue: 1, duration: secs * 1000, easing: Easing.linear, useNativeDriver: native })),
    ]);
    animation.start();
    return () => animation.stop();
  }, [t, secs, phase, still]);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [-w, width] });
  return (
    <Animated.View
      pointerEvents="none"
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
      style={{ position: 'absolute', top: y * height - h / 2, left: 0, transform: [{ translateX }], opacity: 0.92 }}
    >
      <BigCloud width={w} />
    </Animated.View>
  );
}

export function CloudLoading({ text }: { text: string }) {
  const { width, height } = useWindowDimensions();
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return (
    <View style={styles.root} accessible accessibilityRole="progressbar" accessibilityLabel={text} accessibilityLiveRegion="polite">
      <LinearGradient colors={[colors['ocean-deep'], colors.ocean]} style={StyleSheet.absoluteFill} />
      <SeaLines />
      {CLOUDS.map((c, i) => (
        <DriftingCloud key={i} {...c} width={width} height={height} still={reduced} />
      ))}
      <View style={styles.center} pointerEvents="none">
        <View style={styles.box}>
          <Text style={styles.text}>{text}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors['ocean-deep'], overflow: 'hidden' },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { backgroundColor: '#f2f4dc', borderWidth: 3, borderColor: '#3b5276', paddingVertical: 14, paddingHorizontal: 16, maxWidth: 360 },
  text: { fontFamily: fonts.heading, fontSize: 10, lineHeight: 18, color: '#3b5276', textAlign: 'center' },
});
