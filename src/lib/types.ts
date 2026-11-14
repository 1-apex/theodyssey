// Shared types. Mirror of the DB schema in supabase/migrations.
// Change the migration and this file together.

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
  /** `order` of the stage the crew is currently sailing toward. Starts at 1. */
  current_stage_order: number;
  created_at: string;
}

export interface Stage {
  id: string;
  odyssey_id: string;
  /** 1-based, contiguous. The highest order is Ithaca. */
  order: number;
  /** Real place name, e.g. "Buc-ee's, Temple TX". */
  name: string;
  /** Themed name, e.g. "Isle of the Lotus Eaters". */
  title: string;
  lore: string;
  lat: number;
  lng: number;
  radius_m: number;
  points: number;
  cleared_at: string | null;
  /** Member id of whoever triggered the clear. */
  cleared_by: string | null;
}

export interface Member {
  id: string;
  odyssey_id: string;
  user_id: string;
  nickname: string;
  avatar_id: string;
  joined_at: string;
}

export interface LedgerEntry {
  id: string;
  odyssey_id: string;
  member_id: string;
  stage_id: string;
  points: number;
  reason: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Backend call contracts
// ---------------------------------------------------------------------------

/** POST body for the `generate-odyssey` Edge Function. */
export interface GenerateOdysseyRequest {
  start: string;
  destination: string;
  crew_size: number;
  travel_style: string;
  duration: string;
  visibility_mode: VisibilityMode;
  /**
   * Optional, sent together. When present the Captain is added to the crew as
   * part of creation. Otherwise the Captain joins with `join_odyssey` like
   * everyone else.
   */
  nickname?: string;
  avatar_id?: string;
}

export interface GenerateOdysseyResponse {
  odyssey_id: string;
  join_code: string;
}

/** Body of any non-200 response from `generate-odyssey`. */
export interface GenerateOdysseyError {
  error:
    | 'invalid_request'
    | 'not_authenticated'
    | 'endpoint_not_found' // start or destination could not be geocoded
    | 'too_few_stages' // fewer than 3 stages survived; let the Captain retry
    | 'llm_failed'
    | 'llm_bad_output'
    | 'not_configured'
    | 'internal';
  message: string;
}
