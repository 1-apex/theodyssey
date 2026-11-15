// Ornate progress bar: dark inset track, gold end caps, a gold fill, a notch per stage and a
// gold-carved diamond that slides to the new progress point when a stage clears.

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { map } from '@/theme/copy';
import { AsciiSprite, DIAMOND_PALETTE, DIAMOND_ROWS, INK, spriteSize } from './pixelArt';

const CAP = 12;
const TRACK_H = 18;
const DIAMOND = 3; // px per sprite pixel: 15 * 3 = 45
const D = spriteSize(DIAMOND_ROWS, DIAMOND, false).width;

export function VoyageProgress({ cleared, total, reducedMotion }: { cleared: number; total: number; reducedMotion: boolean }) {
  const [width, setWidth] = useState(0);
  const inner = Math.max(0, width - CAP * 2);
  const target = total > 0 ? (Math.min(cleared, total) / total) * inner : 0;
  const [x] = useState(() => new Animated.Value(0));
  const first = useRef(true);

  useEffect(() => {
    if (width === 0) return;
    if (first.current || reducedMotion) {
      first.current = false;
      x.setValue(target);
      return;
    }
    const anim = Animated.timing(x, { toValue: target, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [target, width, x, reducedMotion]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const notches = Array.from({ length: Math.max(0, total - 1) }, (_, i) => ((i + 1) / total) * inner);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={map.progressLabel(cleared, total)}
      accessibilityValue={{ min: 0, max: total, now: cleared }}
      onLayout={onLayout}
      style={styles.wrap}
    >
      <View style={styles.track}>
        <View style={[styles.cap, styles.capLeft]} />
        <View style={[styles.cap, styles.capRight]} />
        <View style={[styles.well, { left: CAP, width: inner }]}>
          {/* the gold fill slides in from the left on the same value as the diamond */}
          <Animated.View style={[styles.fill, { width: inner, transform: [{ translateX: Animated.subtract(x, inner) }] }]}>
            <View style={styles.fillShine} />
          </Animated.View>
          {notches.map((n, i) => (
            <View key={i} style={[styles.notch, { left: n - 1 }, n <= target + 1 ? styles.notchDone : styles.notchTodo]} />
          ))}
        </View>
      </View>
      {inner > 0 && (
        <Animated.View pointerEvents="none" style={[styles.diamond, { left: CAP - D / 2, transform: [{ translateX: x }] }]}>
          <AsciiSprite rows={DIAMOND_ROWS} palette={DIAMOND_PALETTE} size={DIAMOND} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: D + 6, justifyContent: 'center', marginHorizontal: 2, marginBottom: 10 },
  track: { height: TRACK_H + 8, justifyContent: 'center' },
  well: {
    position: 'absolute',
    top: 4,
    height: TRACK_H,
    overflow: 'hidden',
    backgroundColor: '#010d1d',
    borderTopWidth: 3,
    borderLeftWidth: 0,
    borderColor: '#000813',
    borderBottomWidth: 2,
    borderBottomColor: '#1b3f66',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#f0bb3b' },
  fillShine: { height: 4, backgroundColor: '#ffe39a' },
  cap: { position: 'absolute', top: 0, width: CAP, height: TRACK_H + 8, backgroundColor: '#f0bb3b', borderWidth: 2, borderColor: INK, boxShadow: 'inset 2px 2px 0 #ffe39a, inset -2px -2px 0 #b17000' },
  capLeft: { left: 0 },
  capRight: { right: 0 },
  notch: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  notchDone: { backgroundColor: '#8a5a08' },
  notchTodo: { backgroundColor: '#b17000', opacity: 0.8 },
  diamond: { position: 'absolute', top: 3 },
});
