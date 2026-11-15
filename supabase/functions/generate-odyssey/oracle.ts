// The Oracle: prompt -> LLM place names -> geocoded, sanity-checked stages.
//
// Runtime-agnostic on purpose (only `fetch`), so the same code runs in the
// Deno Edge Function and in the Node scratch script (supabase/scratch).
// No DB access here; index.ts owns persistence.

import { askGemini, DEFAULT_MODEL, GeminiError, type GeminiKeys } from '../_shared/gemini.ts';

export { DEFAULT_MODEL };

export interface OracleRequest {
  start: string;
  destination: string;
  crew_size: number;
  travel_style: string;
  duration: string;
}

export interface OracleKeys extends GeminiKeys {
  geocodingApiKey: string;
  /** Override the geocoding host. Only for tests against a mock server. */
  geocodingBaseUrl?: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** A stage ready to insert into `stages` (minus odyssey_id). */
export interface OracleStage extends LatLng {
  order: number;
  name: string;
  title: string;
  lore: string;
  radius_m: number;
  points: number;
}

export interface OracleResult {
  title: string;
  start: LatLng;
  stages: OracleStage[];
  /** Stages the LLM proposed that were dropped, with the reason. For logs. */
  dropped: { place: string; reason: string }[];
}

export type OracleErrorCode =
  | 'llm_failed'
  | 'llm_bad_output'
  | 'endpoint_not_found'
  | 'too_few_stages';

export class OracleError extends Error {
  code: OracleErrorCode;
  constructor(code: OracleErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const MIN_STAGES = 3;
const STAGE_POINTS = 100;
const ITHACA_POINTS = 250;
const RADIUS_M = 250;

// ---------------------------------------------------------------------------
// LLM (Gemini Interactions API)
// ---------------------------------------------------------------------------

interface LlmStage {
  order: number;
  place_name: string;
  city_region: string;
  title: string;
  lore: string;
  why: string;
}

interface LlmRoute {
  title: string;
  stages: LlmStage[];
}

const ROUTE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    stages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          order: { type: 'integer' },
          place_name: { type: 'string' },
          city_region: { type: 'string' },
          title: { type: 'string' },
          lore: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['order', 'place_name', 'city_region', 'title', 'lore', 'why'],
      },
    },
  },
  required: ['title', 'stages'],
};

const SYSTEM_INSTRUCTION = `You are the Oracle, a planner of road trips told in the voice of Greek myth.
Given a start, a destination, and the crew's wishes, plan the voyage as a series of stages.

Rules:
- Return 5 to 7 stages in travel order, each one further along the drive from start to destination. No backtracking and no big detours.
- Spread the stages along the whole drive. Do not cluster them near the start or leave one very long empty stretch.
- The final stage MUST be the destination itself.
- Do not include the start as a stage.
- Every stage must be a real, specific place that exists today and can be found by name in a maps search: a named restaurant, landmark, park, museum, viewpoint, or town. Never invent places. Prefer well-known places over obscure ones.
- place_name is the exact searchable name only (for example "Buc-ee's" or "Enchanted Rock State Natural Area"). city_region is "City, State" or "City, Country".
- Never output coordinates.
- title is a short themed name in the style of the Odyssey (for example "Isle of the Lotus Eaters"). The route title follows the same style.
- lore is one or two sentences of mythic flavor text that hints at what the real place is.
- why is one plain line on why this stop fits the crew's request.`;

function userPrompt(req: OracleRequest): string {
  return [
    `Start: ${req.start}`,
    `Destination: ${req.destination}`,
    `Crew size: ${req.crew_size}`,
    `Travel style: ${req.travel_style}`,
    `Duration: ${req.duration}`,
  ].join('\n');
}

export async function askOracle(req: OracleRequest, keys: OracleKeys): Promise<LlmRoute> {
  let data: unknown;
  let raw: string;
  try {
    ({ data, raw } = await askGemini(
      { system: SYSTEM_INSTRUCTION, input: userPrompt(req), schema: ROUTE_SCHEMA },
      keys,
    ));
  } catch (e) {
    if (e instanceof GeminiError) throw new OracleError(e.code, e.message);
    throw e;
  }
  const route = data as LlmRoute;

  if (typeof route?.title !== 'string' || !Array.isArray(route?.stages)) {
    throw new OracleError('llm_bad_output', `LLM output missing title or stages: ${raw.slice(0, 500)}`);
  }
  route.stages = route.stages
    .filter((s) => s && typeof s.place_name === 'string' && s.place_name.trim() !== '')
    .sort((a, b) => a.order - b.order);
  return route;
}

// ---------------------------------------------------------------------------
// Geocoding (Mapbox Search Box API; the Geocoding API has no POIs)
// ---------------------------------------------------------------------------

/** Returns null when nothing is found. Throws only on auth/network problems. */
export async function geocode(
  query: string,
  keys: Pick<OracleKeys, 'geocodingApiKey' | 'geocodingBaseUrl'>,
  proximity?: LatLng,
): Promise<LatLng | null> {
  const params = new URLSearchParams({
    // API limit is 256 chars; semicolons are not allowed.
    q: query.replaceAll(';', ' ').slice(0, 256),
    limit: '1',
    access_token: keys.geocodingApiKey,
  });
  if (proximity) params.set('proximity', `${proximity.lng},${proximity.lat}`);

  const base = keys.geocodingBaseUrl ?? 'https://api.mapbox.com';
  const res = await fetch(`${base}/search/searchbox/v1/forward?${params}`);
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Geocoding auth failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  if (!res.ok) return null;

  const body = await res.json();
  const coords = body?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
    return null;
  }
  return { lat: coords[1], lng: coords[0] };
}

// ---------------------------------------------------------------------------
// Geometry and sanity checks
// ---------------------------------------------------------------------------

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

interface Candidate extends LatLng {
  stage: LlmStage;
}

/**
 * Drops stages that are not plausibly on the way.
 *  - Detour: start -> stage -> destination is far longer than start -> destination.
 *    Catches the geocoder picking a same-named place in another state.
 *  - Progress: each kept stage must be closer to the destination than the last
 *    kept one, within a tolerance. Catches backtracking.
 */
export function filterOnRoute(
  candidates: Candidate[],
  start: LatLng,
  destination: LatLng,
): { kept: Candidate[]; dropped: { place: string; reason: string }[] } {
  const total = haversineKm(start, destination);
  const maxDetour = total * 1.6 + 50;
  const tolerance = Math.max(total * 0.15, 15);

  const kept: Candidate[] = [];
  const dropped: { place: string; reason: string }[] = [];
  let remaining = total + tolerance;

  for (const c of candidates) {
    const toDest = haversineKm(c, destination);
    const via = haversineKm(start, c) + toDest;
    if (via > maxDetour) {
      dropped.push({ place: c.stage.place_name, reason: `detour (${Math.round(via)} km via, ${Math.round(total)} km direct)` });
    } else if (toDest > remaining + tolerance) {
      dropped.push({ place: c.stage.place_name, reason: 'backtracks away from destination' });
    } else {
      kept.push(c);
      remaining = Math.min(remaining, toDest);
    }
  }
  return { kept, dropped };
}

// ---------------------------------------------------------------------------
// The whole pipeline
// ---------------------------------------------------------------------------

export async function consultOracle(req: OracleRequest, keys: OracleKeys): Promise<OracleResult> {
  // Endpoints first: cheap, and there is no point asking the LLM if they fail.
  const [start, destination] = await Promise.all([
    geocode(req.start, keys),
    geocode(req.destination, keys),
  ]);
  if (!start) throw new OracleError('endpoint_not_found', `Could not find the start: ${req.start}`);
  if (!destination) {
    throw new OracleError('endpoint_not_found', `Could not find the destination: ${req.destination}`);
  }

  const route = await askOracle(req, keys);
  if (route.stages.length === 0) throw new OracleError('too_few_stages', 'The Oracle returned no stages');

  // The last stage is Ithaca. Use the destination we already geocoded rather
  // than trusting a second lookup of the LLM's wording for it.
  const ithaca = route.stages[route.stages.length - 1];
  const waypoints = route.stages.slice(0, -1);

  const midpoint = { lat: (start.lat + destination.lat) / 2, lng: (start.lng + destination.lng) / 2 };
  const located = await Promise.all(
    waypoints.map((s) => geocode(`${s.place_name}, ${s.city_region}`, keys, midpoint)),
  );

  const dropped: { place: string; reason: string }[] = [];
  const candidates: Candidate[] = [];
  waypoints.forEach((stage, i) => {
    const p = located[i];
    if (p) candidates.push({ stage, ...p });
    else dropped.push({ place: stage.place_name, reason: 'not found by geocoder' });
  });

  const filtered = filterOnRoute(candidates, start, destination);
  dropped.push(...filtered.dropped);

  const all: Candidate[] = [...filtered.kept, { stage: ithaca, ...destination }];
  if (all.length < MIN_STAGES) {
    throw new OracleError(
      'too_few_stages',
      `Only ${all.length} stage(s) survived geocoding; need ${MIN_STAGES}`,
    );
  }

  const stages = all.map((c, i): OracleStage => {
    const isIthaca = i === all.length - 1;
    return {
      order: i + 1,
      // Ithaca keeps the Captain's own wording for the destination.
      name: isIthaca ? req.destination : `${c.stage.place_name}, ${c.stage.city_region}`,
      title: c.stage.title,
      lore: c.stage.lore,
      lat: c.lat,
      lng: c.lng,
      radius_m: RADIUS_M,
      points: isIthaca ? ITHACA_POINTS : STAGE_POINTS,
    };
  });

  return { title: route.title, start, stages, dropped };
}
