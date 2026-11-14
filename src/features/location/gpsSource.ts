// Real phone GPS as a LocationSource. The only file that imports expo-location.

import * as Location from 'expo-location';

import type { LatLng } from '../../lib/types';
import type { LocationSource, PositionListener } from './source';

/** 'denied': the user refused permission. 'error': anything else went wrong (e.g. location services off). */
export type GpsStartResult = 'granted' | 'denied' | 'error';

export interface GpsSource extends LocationSource {
  /** Asks for foreground permission and starts watching. Safe to call more than once. May resolve 'granted' even if stop() was called meanwhile. */
  start(): Promise<GpsStartResult>;
  /** Stops watching. Listeners stay registered so start() can resume. */
  stop(): void;
  /** Accuracy in metres of the last fix, if known. */
  getAccuracyM(): number | null;
}

export function createGpsSource(): GpsSource {
  const listeners = new Set<PositionListener>();
  let last: LatLng | null = null;
  let accuracy: number | null = null;
  let subscription: Location.LocationSubscription | null = null;
  /** Bumped by every start/stop so a stale async start can detect it was cancelled. */
  let generation = 0;
  let starting: Promise<GpsStartResult> | null = null;

  const onFix = (loc: Location.LocationObject): void => {
    last = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    accuracy = loc.coords.accuracy;
    listeners.forEach((l) => l(last as LatLng));
  };

  const begin = async (gen: number): Promise<GpsStartResult> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return 'denied';
    if (gen !== generation) return 'granted';
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 2 },
      (loc) => {
        // A watcher from a stopped or superseded start must never emit.
        if (gen === generation) onFix(loc);
      },
    );
    if (gen !== generation) sub.remove(); // stop() ran while we were waiting: do not leak the watcher
    else subscription = sub;
    return 'granted';
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (last !== null) listener(last);
      return () => {
        listeners.delete(listener);
      };
    },
    getLast: () => last,
    getAccuracyM: () => accuracy,
    start() {
      if (subscription !== null) return Promise.resolve('granted');
      if (starting === null) {
        const gen = generation;
        const attempt: Promise<GpsStartResult> = begin(gen)
          .catch((): GpsStartResult => 'error')
          .finally(() => {
            if (starting === attempt) starting = null;
          });
        starting = attempt;
      }
      return starting;
    },
    stop() {
      generation += 1;
      starting = null;
      subscription?.remove();
      subscription = null;
    },
  };
}
