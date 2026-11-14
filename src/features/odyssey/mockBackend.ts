// In-memory stand-in for Supabase. Holds one Odyssey and ignores the id argument.

import { isWithinStage } from '../../lib/geo';
import { mockMembers, mockOdyssey, mockStages } from '../../lib/mock';
import type { LedgerEntry, Member, Odyssey, Stage } from '../../lib/types';
import type { OdysseyBackend } from './backend';

export interface MockBackendSeed {
  odyssey?: Odyssey;
  stages?: Stage[];
  members?: Member[];
}

export function createMockBackend(seed: MockBackendSeed = {}): OdysseyBackend {
  const odyssey: Odyssey = { ...(seed.odyssey ?? mockOdyssey) };
  const stages: Stage[] = (seed.stages ?? mockStages).map((s) => ({ ...s }));
  const members: Member[] = (seed.members ?? mockMembers).map((m) => ({ ...m }));
  const ledger: LedgerEntry[] = [];
  const listeners = new Set<() => void>();

  const visibleStages = (): Stage[] => {
    const sorted = [...stages].sort((a, b) => a.order - b.order);
    if (odyssey.visibility_mode === 'open') return sorted;
    return sorted.filter((s) => s.cleared_at !== null || s.order === odyssey.current_stage_order);
  };

  return {
    getOdyssey: async () => ({ ...odyssey }),
    getVisibleStages: async () => visibleStages().map((s) => ({ ...s })),
    getMembers: async () => members.map((m) => ({ ...m })),
    getLedger: async () => ledger.map((e) => ({ ...e })),

    async clearStage({ stageId, memberId, position, manual = false }) {
      const stage = stages.find((s) => s.id === stageId);
      if (stage === undefined) return { status: 'rejected', reason: 'not_found' };
      if (stage.cleared_at !== null) return { status: 'already_cleared', stage: { ...stage } };
      if (stage.order !== odyssey.current_stage_order) return { status: 'rejected', reason: 'not_current_target' };
      if (!manual && (position === null || !isWithinStage(position, stage))) {
        return { status: 'rejected', reason: 'too_far' };
      }

      stage.cleared_at = new Date().toISOString();
      stage.cleared_by = memberId;

      // Every crew member earns the stage's Drachma.
      for (const m of members) {
        ledger.push({
          id: `ledger-${ledger.length + 1}`,
          odyssey_id: odyssey.id,
          member_id: m.id,
          stage_id: stage.id,
          points: stage.points,
          reason: 'stage_cleared',
        });
      }

      const next = stages.filter((s) => s.cleared_at === null).sort((a, b) => a.order - b.order)[0];
      if (next === undefined) odyssey.status = 'complete';
      else odyssey.current_stage_order = next.order;

      listeners.forEach((l) => l());
      return { status: 'cleared', stage: { ...stage } };
    },

    subscribe(_odysseyId, onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
  };
}
