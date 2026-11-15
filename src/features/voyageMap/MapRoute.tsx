// The dashed ink route: faint for legs not yet sailed, stronger red-brown for legs already sailed.
// Drawn from the same points as the markers and the ship, so it passes through every stop.

import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { INK } from './pixelArt';
import type { MapLayout, Point } from './layout';

const SAILED = '#8a3a22';

function Legs({ legs, width, height, sailed, scale }: { legs: [Point, Point][]; width: number; height: number; sailed: boolean; scale: number }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      {legs.map(([a, b], i) => (
        <Line
          key={i}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={sailed ? SAILED : INK}
          strokeOpacity={sailed ? 0.95 : 0.32}
          strokeWidth={(sailed ? 3.5 : 3) * scale}
          strokeDasharray={(sailed ? [8, 5] : [7, 6]).map((n) => n * scale).join(' ')}
        />
      ))}
    </Svg>
  );
}

/** A newly sailed leg that is re-inked with a short fade instead of popping in. */
function FadingLeg({ leg, width, height, scale }: { leg: [Point, Point]; width: number; height: number; scale: number }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <Legs legs={[leg]} width={width} height={height} sailed scale={scale} />
    </Animated.View>
  );
}

export interface MapRouteProps {
  layout: MapLayout;
  /** Orders of the stops the Crew can see, ascending. */
  visibleOrders: number[];
  /** Highest order the ship has arrived at (0 = harbour). */
  arrivedAt: number;
  /** Order whose leg was just sailed and should fade in, if any. */
  freshOrder: number | null;
}

export function MapRoute({ layout, visibleOrders, arrivedAt, freshOrder }: MapRouteProps) {
  const { width, height, scale } = layout;
  const legs: { order: number; leg: [Point, Point] }[] = [];
  let prev: Point = layout.harbour;
  for (const order of visibleOrders) {
    const here = layout.stops[order - 1];
    legs.push({ order, leg: [prev, here] });
    prev = here;
  }
  const done = legs.filter((l) => l.order <= arrivedAt && l.order !== freshOrder).map((l) => l.leg);
  const fresh = legs.find((l) => l.order === freshOrder && l.order <= arrivedAt);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Legs legs={legs.map((l) => l.leg)} width={width} height={height} sailed={false} scale={scale} />
      <Legs legs={done} width={width} height={height} sailed scale={scale} />
      {fresh !== undefined && <FadingLeg key={fresh.order} leg={fresh.leg} width={width} height={height} scale={scale} />}
    </View>
  );
}
