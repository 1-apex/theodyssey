// Glue: listens to a LocationSource and asks the backend to clear the target
// stage when the crew member enters its radius.

import { isWithinStage } from '../../lib/geo';
import type { LatLng, Stage } from '../../lib/types';
import type { ClearStageResult, OdysseyBackend } from '../odyssey/backend';
import { currentTarget } from './geofence';
import type { LocationSource } from './source';

export interface ArrivalWatcherOptions {
  source: LocationSource;
  backend: OdysseyBackend;
  odysseyId: string;
  memberId: string;
  /** Called after every clear attempt. */
  onResult?: (result: ClearStageResult) => void;
}

/** Starts watching. Returns a stop function. */
export function startArrivalWatcher({ source, backend, odysseyId, memberId, onResult }: ArrivalWatcherOptions): () => void {
  let target: Stage | null = null;
  let busy = false;
  let stopped = false;

  const refreshTarget = async (): Promise<void> => {
    target = currentTarget(await backend.getVisibleStages(odysseyId));
  };

  const check = async (pos: LatLng): Promise<void> => {
    if (stopped || busy || target === null || !isWithinStage(pos, target)) return;
    busy = true;
    try {
      const result = await backend.clearStage({ odysseyId, stageId: target.id, memberId, position: pos });
      await refreshTarget();
      if (!stopped) onResult?.(result);
    } finally {
      busy = false;
    }
  };

  const recheck = (): void => {
    const last = source.getLast();
    if (last !== null) void check(last);
  };

  // Another crew member may clear the stage first, so follow backend changes too.
  const unsubBackend = backend.subscribe(odysseyId, () => {
    if (!busy) void refreshTarget().then(recheck);
  });
  let unsubSource: (() => void) | null = null;
  void refreshTarget().then(() => {
    if (!stopped) unsubSource = source.subscribe((pos) => void check(pos));
  });

  return () => {
    stopped = true;
    unsubBackend();
    unsubSource?.();
  };
}
