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

export function createSimulateSource({ start, stepMs: rawStepMs = 500, steps: rawSteps = 20 }: SimulateOptions): SimulateSource {
  // Bad numbers must not stop a sail from arriving: fewer than 1 step is 1, a bad delay is 0.
  const steps = Number.isFinite(rawSteps) && rawSteps >= 1 ? rawSteps : 1;
  const stepMs = Number.isFinite(rawStepMs) && rawStepMs >= 0 ? rawStepMs : 0;
  const listeners = new Set<PositionListener>();
  let current = start;
  let timer: ReturnType<typeof setInterval> | null = null;
  let finishSail: (() => void) | null = null;

  const emit = ({ lat, lng }: LatLng): void => {
    // Copy the two fields so a Stage passed as a target is not leaked to listeners.
    current = { lat, lng };
    listeners.forEach((l) => {
      try {
        l(current);
      } catch {
        // A throwing listener must not break the source or starve the other listeners.
      }
    });
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
      try {
        listener(current);
      } catch {
        // A throwing listener must not break the source.
      }
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
          const last = step >= steps;
          emit(last ? target : lerpLatLng(from, target, step / steps));
          if (last) stop();
        }, stepMs);
      });
    },
  };
}
