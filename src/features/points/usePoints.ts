import { useMemo } from 'react';

import type { LedgerEntry } from '../../lib/types';
import type { OdysseyBackend } from '../odyssey/backend';
import { useBackendValue } from '../odyssey/useBackendValue';
import { useVoyageContext } from '../odyssey/VoyageProvider';
import { totalsByMember } from './totals';

const load = (backend: OdysseyBackend, odysseyId: string): Promise<LedgerEntry[]> => backend.getLedger(odysseyId);

export interface Points {
  ledger: LedgerEntry[];
  totals: Record<string, number>;
  /** Drachma of the member in the VoyageProvider. */
  myTotal: number;
}

export function usePoints(odysseyId: string): Points | null {
  const { backend, memberId } = useVoyageContext();
  const ledger = useBackendValue(backend, odysseyId, load);
  return useMemo(() => {
    if (ledger === null) return null;
    const totals = totalsByMember(ledger);
    return { ledger, totals, myTotal: totals[memberId] ?? 0 };
  }, [ledger, memberId]);
}
