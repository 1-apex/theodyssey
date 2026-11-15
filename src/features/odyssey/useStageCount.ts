import type { OdysseyBackend } from './backend';
import { useBackendValue } from './useBackendValue';
import { useVoyageContext } from './VoyageProvider';

const load = async (backend: OdysseyBackend, odysseyId: string): Promise<number> =>
  backend.getStageCount ? backend.getStageCount(odysseyId) : (await backend.getVisibleStages(odysseyId)).length;

/** Total number of stages, including ones still hidden by fog. Null until loaded. */
export function useStageCount(odysseyId: string): number | null {
  return useBackendValue(useVoyageContext().backend, odysseyId, load);
}
