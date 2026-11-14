// Shared types. Mirror of the DB schema in supabase/migrations (snake_case,
// same as Supabase rows). Change the migration and this file together, and
// tell the team: every workstream imports from here.

export type VisibilityMode = 'open' | 'fog';

/** Who earns a cleared stage's Drachma: every crew member, or only the member whose arrival cleared it. */
export type PointsMode = 'crew' | 'arriver';
export type OdysseyStatus = 'forging' | 'lobby' | 'voyage' | 'complete';

export interface Odyssey {
  id: string;
  join_code: string;
  captain_id: string;
  title: string;
  start_name: string;
  destination_name: string;
  visibility_mode: VisibilityMode;
  /** Chosen by the Captain at creation. */
  points_mode: PointsMode;
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

export interface LatLng {
  lat: number;
  lng: number;
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

// ---------------------------------------------------------------------------
// RPCs. Call with supabase.rpc(name, params). Parameter names are part of the
// contract. A failed RPC has `error.message` set to one of RpcErrorMessage.
// ---------------------------------------------------------------------------

/** `get_visible_stages({ p_odyssey_id })`. The only way to read stages. */
export interface VisibleStages {
  /** Real number of stages, even when fog hides some of them. */
  total_stages: number;
  /** Open: all. Fog: cleared stages plus the current target. Complete: all. */
  stages: Stage[];
}

/** `clear_stage({ p_stage_id, p_lat, p_lng, p_manual })`. */
export interface ClearStageParams {
  p_stage_id: string;
  /** Required unless p_manual is true. */
  p_lat?: number;
  p_lng?: number;
  /** "We have arrived" fallback: skips the distance check. */
  p_manual?: boolean;
}

export type ClearStageOutcome =
  | 'cleared' // this call cleared the stage
  | 'already_cleared' // someone got there first; nothing changed
  | 'not_sailing' // odyssey is not in status `voyage`
  | 'not_current' // stage is not the crew's current target
  | 'too_far'; // position is outside the stage radius

export interface ClearStageResult {
  result: ClearStageOutcome;
  stage_id: string;
  /** Metres from the stage. Null for manual arrivals. */
  distance_m: number | null;
  /** Drachma each crew member received from this call (0 unless `cleared`). */
  points_awarded: number;
  odyssey_status: OdysseyStatus;
  current_stage_order: number;
}

/** `join_odyssey({ p_join_code, p_nickname, p_avatar_id })`. Safe to repeat. */
export interface JoinOdysseyResult {
  odyssey_id: string;
  member_id: string;
}

/** `set_sail({ p_odyssey_id })`. Captain only. Moves lobby to voyage. */
export interface SetSailResult {
  odyssey_id: string;
  status: OdysseyStatus;
}

/** One row per crew member from `get_points_summary({ p_odyssey_id })`, highest total first. */
export interface PointsSummaryRow {
  member_id: string;
  nickname: string;
  avatar_id: string;
  total_points: number;
  stages_cleared: number;
}

/**
 * `create_demo_odyssey({ p_visibility_mode })` returns GenerateOdysseyResponse.
 * A ready-made route with the caller as Captain; no LLM or geocoder involved.
 * Demo fallback, and a way to get real data before the Oracle is deployed.
 */
export type CreateDemoOdysseyResult = GenerateOdysseyResponse;

export type RpcErrorMessage =
  | 'not_authenticated'
  | 'not_crew'
  | 'stage_not_found'
  | 'position_required'
  | 'invalid_join_code'
  | 'odyssey_not_joinable' // still forging, or already complete
  | 'invalid_nickname' // must be 1 to 24 characters
  | 'invalid_avatar'
  | 'not_captain'
  | 'odyssey_not_ready' // set_sail while still forging
  | 'invalid_visibility_mode';
