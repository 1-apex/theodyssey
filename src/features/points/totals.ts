import type { LedgerEntry } from '../../lib/types';

/** Drachma per member id. */
export function totalsByMember(ledger: LedgerEntry[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of ledger) totals[e.member_id] = (totals[e.member_id] ?? 0) + e.points;
  return totals;
}

/** Drachma earned by one member. */
export function memberTotal(ledger: LedgerEntry[], memberId: string): number {
  return totalsByMember(ledger)[memberId] ?? 0;
}
