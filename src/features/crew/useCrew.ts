import type { Member } from '../../lib/types';
import type { OdysseyBackend } from '../odyssey/backend';
import { useBackendValue } from '../odyssey/useBackendValue';
import { useVoyageContext } from '../odyssey/VoyageProvider';

const load = (backend: OdysseyBackend, odysseyId: string): Promise<Member[]> => backend.getMembers(odysseyId);

export function useCrew(odysseyId: string): Member[] | null {
  return useBackendValue(useVoyageContext().backend, odysseyId, load);
}
