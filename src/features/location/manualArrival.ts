import type { ClearStageResult, OdysseyBackend } from '../odyssey/backend';
import type { LocationSource } from './source';

/**
 * "We have arrived": clears the given stage with `manual: true` and the source's last position at call time.
 * No target lookup, so a double tap gets `already_cleared` and a stale stage id gets a rejection.
 */
export function clearStageManually(
  backend: OdysseyBackend,
  source: LocationSource,
  odysseyId: string,
  memberId: string,
  stageId: string,
): Promise<ClearStageResult> {
  return backend.clearStage({ odysseyId, stageId, memberId, position: source.getLast(), manual: true });
}
