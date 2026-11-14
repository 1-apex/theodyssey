// Shared types. Mirror of the DB schema (snake_case, same as Supabase rows).
// DRAFT contract: change only after telling the team.

export type VisibilityMode = 'open' | 'fog';

export type OdysseyStatus = 'forging' | 'lobby' | 'voyage' | 'complete';

export interface Odyssey {
  id: string;
  join_code: string;
  captain_id: string;
  title: string;
  start_name: string;
  destination_name: string;
  visibility_mode: VisibilityMode;
  status: OdysseyStatus;
  current_stage_order: number;
}

export interface Stage {
  id: string;
  odyssey_id: string;
  order: number;
  name: string;
  title: string;
  lore: string;
  lat: number;
  lng: number;
  radius_m: number;
  points: number;
  cleared_at: string | null;
  cleared_by: string | null;
}

export interface Member {
  id: string;
  odyssey_id: string;
  user_id: string;
  nickname: string;
  avatar_id: string;
}

export interface LedgerEntry {
  id: string;
  odyssey_id: string;
  member_id: string;
  stage_id: string;
  points: number;
  reason: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}
