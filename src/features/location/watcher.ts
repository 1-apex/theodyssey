// Glue: listens to a LocationSource and asks the backend to clear the target
// stage when the crew member enters its radius.

import { haversineM, isWithinStage } from '../../lib/geo';
import type { LatLng, Stage } from '../../lib/types';
import type { ClearStageResult, OdysseyBackend } from '../odyssey/backend';
import { currentTarget } from './geofence';
import type { LocationSource } from './source';

/**
 * After the backend rejects a clear (for example `too_far`), do not try the same stage again until the
 * position has moved this far or `RETRY_AFTER_MS` has passed. Client and server can disagree by a metre or
 * two at the radius edge, and without a backoff every GPS fix inside the radius would call the backend again.
 */
export const RETRY_AFTER_MOVE_M = 25;
export const RETRY_AFTER_MS = 15_000;

export interface ArrivalWatcherOptions {
  source: LocationSource;
  backend: OdysseyBackend;
  odysseyId: string;
  memberId: string;
  /** Called as soon as a clear attempt returns (before the follow-up refresh). */
  onResult?: (result: ClearStageResult) => void;
  /** Called when reading stages or clearing a stage fails. The watcher keeps running and retries later. */
  onError?: (error: unknown) => void;
}

/** Starts watching. Returns a stop function. Nothing fires after it is called. */
export function startArrivalWatcher({
  source,
  backend,
  odysseyId,
  memberId,
  onResult,
  onError,
}: ArrivalWatcherOptions): () => void {
  let target: Stage | null = null;
  let stopped = false;
  let busy = false;
  /** Something happened while busy: run the loop again when it finishes. */
  let rerun = false;
  /** The target may be out of date (backend change, failed read, just cleared). */
  let needRefresh = false;
  let readSeq = 0;
  let rejected: { stageId: string; pos: LatLng; at: number } | null = null;
  /** Stage ids this watcher has had a `cleared` or `already_cleared` result for. */
  const clearedIds = new Set<string>();

  const fail = (error: unknown): void => {
    if (stopped) return;
    try {
      onError?.(error);
    } catch {
      // A broken error callback must not break the watcher.
    }
  };

  /** Only the newest read may set the target. Returns false when the read failed. */
  const refreshTarget = async (): Promise<boolean> => {
    readSeq += 1;
    const mine = readSeq;
    try {
      const stages = await backend.getVisibleStages(odysseyId);
      if (!stopped && mine === readSeq) target = currentTarget(stages);
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  };

  const backedOff = (stage: Stage, pos: LatLng): boolean =>
    rejected !== null &&
    rejected.stageId === stage.id &&
    haversineM(pos, rejected.pos) <= RETRY_AFTER_MOVE_M &&
    Date.now() - rejected.at < RETRY_AFTER_MS;

  /** One pass: refresh if needed, then keep clearing while the position is inside the target. */
  const runOnce = async (): Promise<void> => {
    for (;;) {
      if (stopped) return;
      if (needRefresh) {
        needRefresh = false;
        if (!(await refreshTarget())) {
          needRefresh = true;
          return;
        }
        if (stopped) return;
      }
      const pos = source.getLast();
      if (pos === null || target === null || !isWithinStage(pos, target)) return;
      // Guard against a stale read (or a misbehaving backend) that still reports a stage we already cleared
      // as the target. Stop here, but re-read on the next position or event instead of keeping the stale target.
      if (clearedIds.has(target.id)) {
        needRefresh = true;
        return;
      }
      if (backedOff(target, pos)) return;

      const stage = target;
      let result: ClearStageResult;
      try {
        result = await backend.clearStage({ odysseyId, stageId: stage.id, memberId, position: pos });
      } catch (error) {
        fail(error);
        return; // not stuck: the next position or backend change retries
      }
      if (stopped) return;
      try {
        onResult?.(result);
      } catch (error) {
        fail(error);
      }
      needRefresh = true;
      if (result.status === 'rejected') {
        rejected = { stageId: stage.id, pos, at: Date.now() };
      } else {
        rejected = null;
        clearedIds.add(stage.id);
      }
    }
  };

  const pump = async (): Promise<void> => {
    if (stopped) return;
    if (busy) {
      rerun = true;
      return;
    }
    busy = true;
    try {
      do {
        rerun = false;
        await runOnce();
      } while (rerun && !stopped);
    } finally {
      busy = false;
    }
  };

  // Another crew member may clear the stage first, so follow backend changes too.
  const unsubBackend = backend.subscribe(odysseyId, () => {
    needRefresh = true;
    void pump();
  });
  let unsubSource: (() => void) | null = null;
  void refreshTarget().then((ok) => {
    if (!ok) needRefresh = true;
    if (!stopped) unsubSource = source.subscribe(() => void pump());
  });

  return () => {
    stopped = true;
    unsubBackend();
    unsubSource?.();
  };
}
