import { useEffect, useState } from 'react';

import type { LedgerEntry, Member, Odyssey, Stage } from '../../lib/types';
import type { OdysseyBackend } from './backend';

export interface VoyageSnapshot {
  odyssey: Odyssey;
  /** Visible stages only, sorted by order. */
  stages: Stage[];
  members: Member[];
  ledger: LedgerEntry[];
}

/** Everything a screen needs about one Odyssey, refreshed whenever the backend reports a change. */
export function useVoyage(backend: OdysseyBackend, odysseyId: string): VoyageSnapshot | null {
  const [snapshot, setSnapshot] = useState<VoyageSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      const [odyssey, stages, members, ledger] = await Promise.all([
        backend.getOdyssey(odysseyId),
        backend.getVisibleStages(odysseyId),
        backend.getMembers(odysseyId),
        backend.getLedger(odysseyId),
      ]);
      if (active) setSnapshot({ odyssey, stages, members, ledger });
    };
    void load();
    const unsubscribe = backend.subscribe(odysseyId, () => void load());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [backend, odysseyId]);

  return snapshot;
}
