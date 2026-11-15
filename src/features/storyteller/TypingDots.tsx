import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { colors } from '../../components/PixelSprite';
import { useReducedMotion } from './useReducedMotion';

const DOTS = 3;

/** Three square dots that bounce in turn. Static when motion is reduced; the loop stops on unmount. */
export function TypingDots({ label }: { label: string }) {
  const reduced = useReducedMotion();
  const [dots] = useState(() => Array.from({ length: DOTS }, () => new Animated.Value(0)));

  useEffect(() => {
    if (reduced) {
      dots.forEach((d) => d.setValue(0));
      return;
    }
    const native = Platform.OS !== 'web';
    const hop = (v: Animated.Value) =>
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(v, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: native }),
        Animated.delay(280),
      ]);
    const loop = Animated.loop(Animated.stagger(170, dots.map(hop)));
    loop.start();
    return () => {
      loop.stop();
      dots.forEach((d) => d.setValue(0));
    };
  }, [reduced, dots]);

  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={styles.row}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
              transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 4 },
  dot: { width: 8, height: 8, backgroundColor: colors.ink },
});
