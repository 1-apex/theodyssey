import { useCallback, useEffect, useRef } from 'react';

import type { ClearStageResult } from '../odyssey/backend';
import { useVoyageContext } from '../odyssey/VoyageProvider';
import { clearStageManually } from './manualArrival';
import { startArrivalWatcher } from './watcher';

/** Clears stages automatically as the source enters their radius. Stops on unmount. */
export function useArrivalWatcher(odysseyId: string, onResult?: (r: ClearStageResult) => void): void {
  const { backend, source, memberId } = useVoyageContext();
  // Latest callback lives in a ref so a new function identity never restarts the watcher.
  const latest = useRef(onResult);
  useEffect(() => {
    latest.current = onResult;
  });
  useEffect(
    () => startArrivalWatcher({ backend, source, odysseyId, memberId, onResult: (r) => latest.current?.(r) }),
    [backend, source, odysseyId, memberId],
  );
}

/** Returns the "We have arrived" action for a given stage id (the one the user was looking at). */
export function useManualArrival(odysseyId: string): (stageId: string) => Promise<ClearStageResult> {
  const { backend, source, memberId } = useVoyageContext();
  return useCallback(
    (stageId: string) => clearStageManually(backend, source, odysseyId, memberId, stageId),
    [backend, source, odysseyId, memberId],
  );
}
