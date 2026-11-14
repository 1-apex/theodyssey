import type { Stage } from '../../lib/types';
import { useBackendValue } from './useBackendValue';
import { loadVisibleStages } from './watchBackendValue';
import { useVoyageContext } from './VoyageProvider';

/** Visible stages only (fog respected), sorted by order. */
export function useVisibleStages(odysseyId: string): Stage[] | null {
  return useBackendValue(useVoyageContext().backend, odysseyId, loadVisibleStages);
}
