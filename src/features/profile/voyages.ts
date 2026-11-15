// Pure helpers for the profile's voyage list. No React, no network.

export type VoyageStatus = 'lobby' | 'voyage' | 'complete';

export interface Voyage {
  odyssey_id: string;
  title: string;
  start_name: string;
  /** null while the destination is hidden in fog */
  destination_name: string | null;
  status: VoyageStatus;
  visibility_mode: 'open' | 'fog';
  is_captain: boolean;
  joined_at: string;
  my_points: number;
  stages_cleared: number;
  stages_total: number;
  crew_size: number;
  completed_at: string | null;
}

export interface VoyageTotals {
  points: number;
  voyages: number;
  completed: number;
  captained: number;
}

export function totals(voyages: readonly Voyage[]): VoyageTotals {
  return {
    points: voyages.reduce((sum, v) => sum + v.my_points, 0),
    voyages: voyages.length,
    completed: voyages.filter((v) => v.status === 'complete').length,
    captained: voyages.filter((v) => v.is_captain).length,
  };
}

/** Newest first by join time; the server already sorts, this keeps the list stable if it ever changes. */
export function sortNewestFirst(voyages: readonly Voyage[]): Voyage[] {
  return [...voyages].sort((a, b) => Date.parse(b.joined_at) - Date.parse(a.joined_at));
}

/** "3 of 7 stages" (singular when the route has one stage). */
export function stagesLabel(cleared: number, total: number): string {
  return `${cleared} of ${total} ${total === 1 ? 'stage' : 'stages'}`;
}

/** The date a card shows: when the voyage ended, else when you joined. */
export function voyageDate(v: Pick<Voyage, 'completed_at' | 'joined_at'>): string {
  return v.completed_at ?? v.joined_at;
}

export function formatDate(iso: string, locale?: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Where tapping a voyage should go. */
export function voyageRoute(v: Pick<Voyage, 'odyssey_id' | 'status'>): {
  pathname: '/odyssey/[id]/lobby' | '/odyssey/[id]/voyage' | '/odyssey/[id]/ithaca';
  params: { id: string };
} {
  const pathname =
    v.status === 'complete'
      ? '/odyssey/[id]/ithaca'
      : v.status === 'voyage'
        ? '/odyssey/[id]/voyage'
        : '/odyssey/[id]/lobby';
  return { pathname, params: { id: v.odyssey_id } };
}
