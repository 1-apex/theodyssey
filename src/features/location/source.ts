// A LocationSource is anything that emits positions: real GPS or simulate mode.
// Everything downstream (geofence, watcher, hooks) only knows this interface.

import { lerpLatLng } from '../../lib/geo';
import type { LatLng } from '../../lib/types';

export type PositionListener = (pos: LatLng) => void;

export interface LocationSource {
  /** Start receiving positions. Returns an unsubscribe function. */
  subscribe(listener: PositionListener): () => void;
  /** Last known position, if any. */
  getLast(): LatLng | null;
}

export interface SimulateSource extends LocationSource {
  /** Glide from the current position to `target`. Resolves on arrival or when interrupted. */
  sailTo(target: LatLng): Promise<void>;
  /** Teleport. Used for "fast forward" in the demo. */
  jumpTo(target: LatLng): void;
  /** Cancel any sail in progress. */
  stop(): void;
}

export interface SimulateOptions {
  start: LatLng;
  /** Milliseconds between position updates. */
  stepMs?: number;
  /** Number of updates per sail. */
  steps?: number;
}

export function createSimulateSource({ start, stepMs = 500, steps = 20 }: SimulateOptions): SimulateSource {
  const listeners = new Set<PositionListener>();
  let current = start;
  let timer: ReturnType<typeof setInterval> | null = null;
  let finishSail: (() => void) | null = null;

  const emit = ({ lat, lng }: LatLng): void => {
    // Copy the two fields so a Stage passed as a target is not leaked to listeners.
    current = { lat, lng };
    listeners.forEach((l) => l(current));
  };

  const stop = (): void => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    finishSail?.();
    finishSail = null;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
    getLast: () => current,
    stop,
    jumpTo(target) {
      stop();
      emit(target);
    },
    sailTo(target) {
      stop();
      const from = current;
      let step = 0;
      return new Promise<void>((resolve) => {
        finishSail = resolve;
        timer = setInterval(() => {
          step += 1;
          emit(step >= steps ? target : lerpLatLng(from, target, step / steps));
          if (step >= steps) stop();
        }, stepMs);
      });
    },
  };
}
