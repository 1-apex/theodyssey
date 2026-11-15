// The ship. Its position is ONE animated number, "progress" along the route in stops
// (0 = harbour, 1 = stage 1, ...), turned into x and y by a piecewise-linear interpolation over the
// route points. So it always travels along the dashed line, on the native driver, with no per-frame
// React renders. Clearing the next stage sails the last leg; anything else jumps.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { map } from '@/theme/copy';
import { distance, sailDurationMs, type Point } from './layout';
import { AsciiSprite, SHIP_ROWS, spritePalette, spriteSize } from './pixelArt';

/** 5.5 px per sprite pixel: about 1.8x the ship the old map drew. */
export const SHIP_SIZE = 5.5;
const BOX = spriteSize(SHIP_ROWS, SHIP_SIZE, true);
/** The ship sits with its keel this far below the stop point. */
const KEEL_DROP = -2;
/** While a simulated trip is under way the ship eases this far along the leg. */
const CREEP = 0.3;
const CREEP_MS = 2400;
let sailToken = 0;

export interface MapShipProps {
  /** Harbour, then every stop in order. */
  points: Point[];
  /** Index into `points` the ship should be at when idle: the last cleared stage, 0 before stage 1. */
  at: number;
  /** A simulated trip towards the next stop is under way but the stage is not cleared yet. */
  departing: boolean;
  reducedMotion: boolean;
  /** Called when the ship has reached `index`; `sailed` is true when it travelled there. */
  onArrive: (index: number, sailed: boolean) => void;
}

export function MapShip({ points, at, departing, reducedMotion, onArrive }: MapShipProps) {
  const [progress] = useState(() => new Animated.Value(at));
  const [bob] = useState(() => new Animated.Value(0));
  const settled = useRef(at); // where the ship is (or is heading) once it stops
  const creeping = useRef(false);
  const sailId = useRef(0); // non-zero while the confirmed leg is being sailed
  const atRef = useRef(at);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arriveRef = useRef(onArrive);
  const pointsRef = useRef(points);
  // Latest props for the animation callbacks below (refs are written in an effect, never in render).
  useEffect(() => {
    arriveRef.current = onArrive;
    atRef.current = at;
    pointsRef.current = points;
  });

  const { translateX, translateY } = useMemo(() => {
    const pts = points.length > 1 ? points : [points[0], points[0]];
    const input = pts.map((_, i) => i);
    return {
      translateX: progress.interpolate({ inputRange: input, outputRange: pts.map((p) => p.x - BOX.width / 2) }),
      translateY: progress.interpolate({ inputRange: input, outputRange: pts.map((p) => p.y + KEEL_DROP - BOX.height) }),
    };
  }, [points, progress]);

  useEffect(() => {
    if (returnTimer.current !== null) clearTimeout(returnTimer.current);
    returnTimer.current = null;
    if (at === settled.current && !creeping.current) return;
    const from = settled.current;
    const wasCreeping = creeping.current;
    creeping.current = false;
    running.current?.stop();
    settled.current = at;
    const pts = pointsRef.current;
    if (at === from + 1 && !reducedMotion && pts[at] !== undefined) {
      const leg = distance(pts[from], pts[at]);
      const remaining = wasCreeping ? 1 - CREEP : 1;
      const anim = Animated.timing(progress, {
        toValue: at,
        duration: Math.max(1800, sailDurationMs(leg) * remaining),
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      });
      running.current = anim;
      const id = ++sailToken;
      sailId.current = id;
      anim.start(({ finished }) => {
        if (sailId.current === id) sailId.current = 0;
        if (finished) arriveRef.current(at, true);
      });
    } else {
      sailId.current = 0;
      progress.setValue(at);
      arriveRef.current(at, false);
    }
  }, [at, progress, reducedMotion]);

  // Ease out of port while the simulated position is gliding, before the server confirms the arrival.
  useEffect(() => {
    if (reducedMotion) return;
    if (departing && atRef.current < pointsRef.current.length - 1 && !creeping.current && sailId.current === 0) {
      if (returnTimer.current !== null) clearTimeout(returnTimer.current);
      returnTimer.current = null;
      creeping.current = true;
      running.current?.stop();
      const anim = Animated.timing(progress, {
        toValue: atRef.current + CREEP,
        duration: CREEP_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
      running.current = anim;
      anim.start();
    } else if (!departing && creeping.current) {
      // The trip ended. If the stage was cleared the other effect takes over; if not, sail back to port after a beat.
      returnTimer.current = setTimeout(() => {
        returnTimer.current = null;
        if (!creeping.current) return;
        creeping.current = false;
        running.current?.stop();
        const anim = Animated.timing(progress, {
          toValue: settled.current,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        });
        running.current = anim;
        anim.start();
      }, 2500);
    }
  }, [departing, progress, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      bob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -3, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 2, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, reducedMotion]);

  useEffect(
    () => () => {
      running.current?.stop();
      if (returnTimer.current !== null) clearTimeout(returnTimer.current);
    },
    [],
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ship, { width: BOX.width, height: BOX.height, transform: [{ translateX }, { translateY }] }]}
    >
      <Animated.View style={{ transform: [{ translateY: bob }] }}>
        <AsciiSprite rows={SHIP_ROWS} palette={spritePalette} size={SHIP_SIZE} outline label={map.shipLabel} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({ ship: { position: 'absolute', left: 0, top: 0 } });
