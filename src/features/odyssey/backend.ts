// The calls the game logic makes to the backend. DRAFT contract with Dev B:
// the Supabase implementation (RPCs + Realtime) must match this interface,
// and the mock in mockBackend.ts stands in for it until then.

import type { LatLng, LedgerEntry, Member, Odyssey, Stage } from '../../lib/types';

export interface ClearStageInput {
  odysseyId: string;
  stageId: string;
  memberId: string;
  /** Where the member is. Null only with `manual`. */
  position: LatLng | null;
  /** "We have arrived" button: skips the distance check. */
  manual?: boolean;
}

export type ClearStageResult =
  | { status: 'cleared'; stage: Stage }
  | { status: 'already_cleared'; stage: Stage }
  | { status: 'rejected'; reason: 'not_found' | 'not_member' | 'not_in_voyage' | 'not_current_target' | 'too_far' };

export interface OdysseyBackend {
  getOdyssey(odysseyId: string): Promise<Odyssey>;
  /** In fog mode this returns only cleared stages plus the current target. */
  getVisibleStages(odysseyId: string): Promise<Stage[]>;
  getMembers(odysseyId: string): Promise<Member[]>;
  getLedger(odysseyId: string): Promise<LedgerEntry[]>;
  /**
   * Idempotent. Validates distance unless `manual`. Checks run in this order: not_found, not_member,
   * already_cleared, not_in_voyage, not_current_target, too_far.
   * The real implementation must take the member from the authenticated user rather than trusting
   * `memberId`, and must be atomic and idempotent when two clears for the same stage arrive at once.
   */
  clearStage(input: ClearStageInput): Promise<ClearStageResult>;
  /**
   * Fires whenever anything about the Odyssey changes. Returns an unsubscribe function.
   * The real implementation must fire on any change to the Odyssey, its stages, members or ledger,
   * and again after a reconnect (changes may have been missed while offline).
   */
  subscribe(odysseyId: string, onChange: () => void): () => void;
}
