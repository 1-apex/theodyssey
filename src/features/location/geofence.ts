import { haversineM, isWithinStage } from '../../lib/geo';
import type { LatLng, Stage } from '../../lib/types';

/** The next stage to reach: the lowest-order stage not yet cleared. */
export function currentTarget(stages: Stage[]): Stage | null {
  const pending = stages.filter((s) => s.cleared_at === null);
  if (pending.length === 0) return null;
  return pending.reduce((a, b) => (a.order < b.order ? a : b));
}

/** The target stage if the position is inside its radius, otherwise null. */
export function checkArrival(pos: LatLng, stages: Stage[]): Stage | null {
  const target = currentTarget(stages);
  return target !== null && isWithinStage(pos, target) ? target : null;
}

/** Metres left to the target stage's edge (0 when inside). Null when the voyage is over. */
export function distanceToTargetM(pos: LatLng, stages: Stage[]): number | null {
  const target = currentTarget(stages);
  if (target === null) return null;
  return Math.max(0, haversineM(pos, target) - target.radius_m);
}
