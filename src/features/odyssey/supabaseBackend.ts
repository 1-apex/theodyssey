// The real OdysseyBackend: Supabase RPCs, RLS-protected selects and Realtime.
// Drop-in replacement for the mock at the VoyageProvider; hooks do not change.

import { AppState } from 'react-native';

import { supabase } from '../../lib/supabase';
import type {
  ClearStageResult as RpcClearStageResult,
  LedgerEntry,
  Member,
  Odyssey,
  Stage,
  VisibleStages,
} from '../../lib/types';
import type { ClearStageResult, OdysseyBackend } from './backend';

type Rejection = Extract<ClearStageResult, { status: 'rejected' }>['reason'];

const rejected = (reason: Rejection): ClearStageResult => ({ status: 'rejected', reason });

/** RPC outcomes that are not a clear, mapped to the app's rejection reasons. */
const OUTCOME_REASON: Record<string, Rejection> = {
  not_sailing: 'not_in_voyage',
  not_current: 'not_current_target',
  too_far: 'too_far',
};

/** Errors the RPC raises, mapped the same way. */
const ERROR_REASON: Record<string, Rejection> = {
  stage_not_found: 'not_found',
  not_crew: 'not_member',
  position_required: 'too_far',
  invalid_position: 'too_far',
};

// ---------------------------------------------------------------------------
// Change notifications. One Realtime channel per Odyssey, shared by every hook
// that subscribes, so five hooks on a screen do not open five channels.
// ---------------------------------------------------------------------------

interface Hub {
  listeners: Set<() => void>;
  fire: () => void;
  close: () => void;
}

const hubs = new Map<string, Hub>();

function openHub(odysseyId: string): Hub {
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  // One stage clear changes the odyssey row and several ledger rows. Collapse the burst into one reload.
  const fire = (): void => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      listeners.forEach((l) => {
        try {
          l();
        } catch {
          // One failing listener must not starve the others.
        }
      });
    }, 120);
  };

  // `stages` is not published (clients cannot select it). Every clear also
  // updates the odyssey row, so that is the signal to reload stages.
  const channel = supabase
    .channel(`odyssey-${odysseyId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'odysseys', filter: `id=eq.${odysseyId}` }, fire)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `odyssey_id=eq.${odysseyId}` }, fire)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'points_ledger', filter: `odyssey_id=eq.${odysseyId}` }, fire)
    .subscribe((status) => {
      // Also fires after a reconnect: changes may have been missed while offline.
      if (status === 'SUBSCRIBED') fire();
    });

  // Coming back to the app: reload, in case Realtime dropped events in the background.
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') fire();
  });

  return {
    listeners,
    fire,
    close: () => {
      if (timer !== null) clearTimeout(timer);
      appState.remove();
      void supabase.removeChannel(channel);
    },
  };
}

// ---------------------------------------------------------------------------

async function visibleStages(odysseyId: string): Promise<VisibleStages> {
  const { data, error } = await supabase.rpc('get_visible_stages', { p_odyssey_id: odysseyId });
  if (error) throw new Error(error.message);
  return data as VisibleStages;
}

export const supabaseBackend: OdysseyBackend = {
  async getOdyssey(odysseyId) {
    const { data, error } = await supabase.from('odysseys').select('*').eq('id', odysseyId).single();
    if (error) throw new Error(error.message);
    return data as Odyssey;
  },

  async getVisibleStages(odysseyId) {
    return (await visibleStages(odysseyId)).stages;
  },

  async getStageCount(odysseyId) {
    return (await visibleStages(odysseyId)).total_stages;
  },

  async getMembers(odysseyId) {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('odyssey_id', odysseyId)
      .order('joined_at');
    if (error) throw new Error(error.message);
    return data as Member[];
  },

  async getLedger(odysseyId) {
    const { data, error } = await supabase.from('points_ledger').select('*').eq('odyssey_id', odysseyId);
    if (error) throw new Error(error.message);
    return data as LedgerEntry[];
  },

  // `memberId` is not sent: the server takes the member from the signed-in user.
  async clearStage({ odysseyId, stageId, position, manual = false }) {
    const { data, error } = await supabase.rpc('clear_stage', {
      p_stage_id: stageId,
      p_lat: position?.lat ?? null,
      p_lng: position?.lng ?? null,
      p_manual: manual,
    });
    if (error) {
      const reason = ERROR_REASON[error.message];
      if (reason !== undefined) return rejected(reason);
      throw new Error(error.message);
    }

    const outcome = (data as RpcClearStageResult).result;
    if (outcome !== 'cleared' && outcome !== 'already_cleared') {
      return rejected(OUTCOME_REASON[outcome] ?? 'not_current_target');
    }

    // The RPC does not return the row. A cleared stage is always visible, even in fog.
    const stage: Stage | undefined = (await visibleStages(odysseyId)).stages.find((s) => s.id === stageId);
    if (stage === undefined) throw new Error('cleared stage is not visible');
    // Do not wait for Realtime to update this phone.
    if (outcome === 'cleared') hubs.get(odysseyId)?.fire();
    return { status: outcome, stage };
  },

  subscribe(odysseyId, onChange) {
    let hub = hubs.get(odysseyId);
    if (hub === undefined) {
      hub = openHub(odysseyId);
      hubs.set(odysseyId, hub);
    }
    const opened = hub;
    opened.listeners.add(onChange);
    return () => {
      opened.listeners.delete(onChange);
      if (opened.listeners.size === 0 && hubs.get(odysseyId) === opened) {
        hubs.delete(odysseyId);
        opened.close();
      }
    };
  },
};

/** Tell every hook watching this Odyssey to reload now (after a change this phone made itself). */
export function refreshOdyssey(odysseyId: string): void {
  hubs.get(odysseyId)?.fire();
}
