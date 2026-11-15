import type { Odyssey } from '../../lib/types';
import type { OdysseyBackend } from './backend';
import { useBackendValue } from './useBackendValue';
import { useVoyageContext } from './VoyageProvider';

const load = (backend: OdysseyBackend, odysseyId: string): Promise<Odyssey> => backend.getOdyssey(odysseyId);

export function useOdyssey(odysseyId: string): Odyssey | null {
  return useBackendValue(useVoyageContext().backend, odysseyId, load);
}
