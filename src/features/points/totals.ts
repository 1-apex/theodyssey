import type { LedgerEntry } from '../../lib/types';

function sumByMember(ledger: LedgerEntry[]): Map<string, number> {
  // A Map, so ids such as 'constructor' or '__proto__' are ordinary keys.
  const totals = new Map<string, number>();
  for (const e of ledger) totals.set(e.member_id, (totals.get(e.member_id) ?? 0) + e.points);
  return totals;
}

/** Drachma per member id. Read it with `Object.hasOwn` or `?? 0`-safe helpers such as `memberTotal`. */
export function totalsByMember(ledger: LedgerEntry[]): Record<string, number> {
  return Object.fromEntries(sumByMember(ledger));
}

/** Drachma earned by one member. */
export function memberTotal(ledger: LedgerEntry[], memberId: string): number {
  return sumByMember(ledger).get(memberId) ?? 0;
}
