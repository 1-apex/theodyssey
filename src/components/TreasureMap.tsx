// The voyage map: an old treasure chart on a scroll. Everything on it (parchment, route, stops,
// fog patches, ship) is placed from one layout in map pixels, so the dashed line really passes
// through the markers and the ship sails along it. See src/features/voyageMap/.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';

import { useReducedMotion } from '@/features/storyteller/useReducedMotion';
import type { Stage } from '@/lib/types';
import { mapLayout, type Point } from '@/features/voyageMap/layout';
import { MapParchment } from '@/features/voyageMap/MapParchment';
import { MapRoute } from '@/features/voyageMap/MapRoute';
import { MapShip } from '@/features/voyageMap/MapShip';
import { FogPatch, MapStop, type StopState } from '@/features/voyageMap/MapStop';
import { AsciiSprite, FLAG_ROWS, markPalette } from '@/features/voyageMap/pixelArt';
import { map } from '@/theme/copy';
import { CONTENT_MAX_WIDTH, SCALE, sz, spx } from '@/theme/scale';
import { fonts } from '@/theme/typography';
import { Text } from 'react-native';
import { shortPlaceName } from '@/features/odyssey/placeNames';

export interface TreasureMapProps {
  /** Real number of stages. */
  total: number;
  /** The stages this Crew may see (fog hides the rest). */
  stages: Stage[];
  /** Name of the start, shown at the harbour. */
  harbour: string;
  /** Order of the stage being sailed for, or null once the voyage is complete. */
  targetOrder: number | null;
  /** A simulated trip is under way but the stage is not cleared yet. */
  travelling: boolean;
  onSelectStop: (order: number) => void;
}

/** A flag and a ring of splash that pops where the ship lands. */
function ArrivalPop({ at }: { at: Point }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.timing(t, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [t]);
  const scale = t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.25, 1] });
  const ring = t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] });
  const opacity = t.interpolate({ inputRange: [0, 0.2, 0.75, 1], outputRange: [0, 1, 1, 0] });
  const ringOpacity = t.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] });
  return (
    <View pointerEvents="none" style={[styles.pop, { left: at.x - sz(40), top: at.y - sz(40) }]}>
      <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ring }] }]} />
      <Animated.View style={{ opacity, transform: [{ scale }, { translateY: sz(-22) }] }}>
        <AsciiSprite rows={FLAG_ROWS} palette={markPalette} size={spx(5)} outline />
      </Animated.View>
    </View>
  );
}

export function TreasureMap({ total, stages, harbour, targetOrder, travelling, onSelectStop }: TreasureMapProps) {
  const reduced = useReducedMotion();
  const window = useWindowDimensions();
  // The Shell column is at most CONTENT_MAX_WIDTH wide with 16 padding each side; the map has 6 margin. onLayout refines this.
  const [width, setWidth] = useState(() => Math.round(Math.min(window.width, CONTENT_MAX_WIDTH) - sz(44)));
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setWidth((prev) => (prev === w ? prev : w));
  }, []);

  const layout = useMemo(() => mapLayout(width, total, SCALE), [width, total]);
  const byOrder = useMemo(() => new Map(stages.map((stage) => [stage.order, stage])), [stages]);
  const clearedAt = stages.reduce((max, stage) => (stage.cleared_at !== null ? Math.max(max, stage.order) : max), 0);
  const visibleOrders = useMemo(() => [...byOrder.keys()].sort((a, b) => a - b), [byOrder]);
  const points = useMemo(() => [layout.harbour, ...layout.stops], [layout]);

  // Where the ship has actually arrived (the legs up to here are inked as sailed), and the fresh landing.
  const [arrivedAt, setArrivedAt] = useState(clearedAt);
  const [fresh, setFresh] = useState<number | null>(null);
  const onArrive = useCallback((index: number, sailed: boolean) => {
    setArrivedAt(index);
    setFresh(sailed ? index : null);
  }, []);
  useEffect(() => {
    if (fresh === null) return;
    const timer = setTimeout(() => setFresh(null), 1400);
    return () => clearTimeout(timer);
  }, [fresh]);

  const stateOf = (order: number, cleared: boolean): StopState => (cleared ? 'cleared' : order === targetOrder ? 'current' : 'ahead');

  return (
    <View onLayout={onLayout} style={styles.wrap}>
      <View accessibilityLabel={map.mapLabel} style={{ width: layout.width, height: layout.height }}>
        <MapParchment layout={layout} />
        <MapRoute layout={layout} visibleOrders={visibleOrders} arrivedAt={arrivedAt} freshOrder={fresh} />

        <View pointerEvents="none" style={[styles.harbour, { left: layout.harbour.x - sz(60), top: layout.harbour.y + sz(20) }]}>
          <Text style={styles.harbourName}>{map.harbour}</Text>
          <Text numberOfLines={1} style={styles.harbourPlace}>
            {shortPlaceName(harbour)}
          </Text>
        </View>

        {Array.from({ length: total }, (_, i) => {
          const order = i + 1;
          const stage = byOrder.get(order);
          const at = layout.stops[i];
          return stage === undefined ? (
            <FogPatch key={order} at={at} labelWidth={layout.labelWidth} />
          ) : (
            <MapStop
              key={order}
              order={order}
              name={stage.name}
              at={at}
              labelWidth={layout.labelWidth}
              state={stateOf(order, stage.cleared_at !== null)}
              isFinal={order === total}
              reducedMotion={reduced}
              onPress={() => onSelectStop(order)}
            />
          );
        })}

        {fresh !== null && <ArrivalPop at={layout.stops[fresh - 1] ?? layout.harbour} />}
        <MapShip points={points} at={Math.min(clearedAt, total)} departing={travelling && targetOrder !== null} reducedMotion={reduced} onArrive={onArrive} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: sz(6), marginBottom: sz(12), alignItems: 'center' },
  harbour: { position: 'absolute', width: sz(120), alignItems: 'center' },
  harbourName: { fontFamily: fonts.numeral, fontSize: sz(15), lineHeight: sz(18), color: '#291508' },
  harbourPlace: { fontFamily: fonts.body, fontSize: sz(13), lineHeight: sz(15), color: '#291508' },
  pop: { position: 'absolute', width: sz(80), height: sz(80), alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: sz(60), height: sz(60), borderWidth: sz(4), borderColor: '#c1e6ed', borderRadius: sz(30), backgroundColor: 'transparent' },
});
