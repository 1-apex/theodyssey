// A stop on the chart: island (or temple for Ithaca) with its real place name inked beneath,
// or a fog patch for stages that have not been discovered. Tapping a visible stop opens its details.

import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { CLOUD_ROWS } from '@/components/PixelCloud';
import { shortPlaceName } from '@/features/odyssey/placeNames';
import { map } from '@/theme/copy';
import { fonts } from '@/theme/typography';
import type { Point } from './layout';
import {
  AsciiSprite,
  FLAG_ROWS,
  FOG_PALETTE,
  INK,
  ISLAND_ROWS,
  ITHACA_ROWS,
  markPalette,
  spritePalette,
  spriteSize,
  X_ROWS,
} from './pixelArt';

export type StopState = 'cleared' | 'current' | 'ahead';

const MARKER_H = 56;
const ISLAND_SIZE = 4;

export interface StopProps {
  order: number;
  name: string;
  at: Point;
  labelWidth: number;
  state: StopState;
  isFinal: boolean;
  reducedMotion: boolean;
  onPress: () => void;
}

/** The red X, gently pulsing until the stage is cleared. */
function XMark({ reducedMotion }: { reducedMotion: boolean }) {
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);
  return (
    <Animated.View pointerEvents="none" style={[styles.x, { transform: [{ scale: pulse }] }]}>
      <AsciiSprite rows={X_ROWS} palette={markPalette} size={2.5} outline />
    </Animated.View>
  );
}

export function MapStop({ order, name, at, labelWidth, state, isFinal, reducedMotion, onPress }: StopProps) {
  const place = shortPlaceName(name);
  const rows = isFinal ? ITHACA_ROWS : ISLAND_ROWS;
  const box = spriteSize(rows, ISLAND_SIZE, true);
  const status = state === 'cleared' ? map.status.cleared : state === 'current' ? map.status.current : map.status.ahead;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={map.stopLabel(place, order, status)}
      accessibilityHint={map.stopHint}
      onPress={onPress}
      hitSlop={6}
      style={[styles.stop, { left: at.x - labelWidth / 2, top: at.y - MARKER_H / 2, width: labelWidth }]}
    >
      <View style={styles.marker}>
        <View style={{ width: box.width, height: box.height }}>
          <AsciiSprite rows={rows} palette={spritePalette} size={ISLAND_SIZE} outline />
          {state === 'current' && <XMark reducedMotion={reducedMotion} />}
          {state === 'cleared' && (
            <View pointerEvents="none" style={styles.flag}>
              <AsciiSprite rows={FLAG_ROWS} palette={markPalette} size={3} />
            </View>
          )}
          <View pointerEvents="none" style={styles.number}>
            <Text style={styles.numberText}>{order}</Text>
          </View>
        </View>
      </View>
      <Text numberOfLines={3} style={styles.label}>
        {place}
      </Text>
    </Pressable>
  );
}

export function FogPatch({ at, labelWidth }: { at: Point; labelWidth: number }) {
  return (
    <View
      accessible
      accessibilityLabel={map.fogPatch}
      style={[styles.stop, { left: at.x - labelWidth / 2, top: at.y - MARKER_H / 2, width: labelWidth }]}
    >
      <View style={styles.marker}>
        <AsciiSprite rows={CLOUD_ROWS} palette={FOG_PALETTE} size={2} />
        <Text style={styles.question}>?</Text>
      </View>
      <Text numberOfLines={1} style={[styles.label, styles.fogLabel]}>
        {map.uncharted}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stop: { position: 'absolute', alignItems: 'center' },
  marker: { height: MARKER_H, alignItems: 'center', justifyContent: 'center' },
  x: { position: 'absolute', left: 25, top: 12 },
  flag: { position: 'absolute', right: -6, top: -10 },
  number: {
    position: 'absolute',
    left: -12,
    top: -8,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5ebce',
    borderWidth: 2,
    borderColor: INK,
  },
  numberText: { fontFamily: fonts.numeral, fontSize: 14, lineHeight: 17, color: INK },
  label: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 15,
    color: INK,
    textAlign: 'center',
    backgroundColor: 'rgba(240, 226, 186, 0.86)',
    paddingHorizontal: 3,
    paddingVertical: 1,
    marginTop: -2,
  },
  fogLabel: { fontStyle: 'italic', color: '#5d4630' },
  question: { position: 'absolute', fontFamily: fonts.heading, fontSize: 12, lineHeight: 16, color: '#5d4630', top: 20 },
});
