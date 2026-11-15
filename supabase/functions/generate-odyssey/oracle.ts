// The Oracle: prompt -> LLM place names -> geocoded, sanity-checked stages.
//
// Runtime-agnostic on purpose (only `fetch`), so the same code runs in the
// Deno Edge Function and in the Node scratch script (supabase/scratch).
// No DB access here; index.ts owns persistence.

import { askGemini, GeminiError, PLANNER_MODEL, type GeminiKeys } from '../_shared/gemini.ts';

export { PLANNER_MODEL };

export type TravelMode = 'road' | 'flight';

export interface OracleRequest {
  start: string;
  destination: string;
  crew_size: number;
  travel_style: string;
  duration: string;
  /** Defaults to 'road'. 'flight' plans places AT the destination, no stops on the way. */
  travel_mode?: TravelMode;
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
  /** The geocoded destination centre (flight mode measures the first leg from here). */
  destination: LatLng;
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
const RADIUS_M = 250;

/**
 * Flight mode: every stage must geocode within this distance of the geocoded
 * destination. 60 km covers a whole metro area plus its day-trip sights (Tokyo
 * and Nikko-sized outliers aside) yet is far smaller than the hundreds of km by
 * which the geocoder misses when it matches a same-named place elsewhere.
 */
export const FLIGHT_RADIUS_KM = 60;

// ---------------------------------------------------------------------------
// Points (Drachma) formula
// ---------------------------------------------------------------------------

export const POINTS_BASE = 40;
export const POINTS_PER_KM = 0.6;
export const POINTS_MIN = 50;
export const POINTS_MAX = 400;
export const ITHACA_BONUS = 150;

/**
 * Drachma for one stage from the length of the leg that reaches it.
 *   points = clamp(round-to-nearest-10(40 + 0.6 * leg_km), 50, 400)
 *   Ithaca (the final stage) gets that + 150.
 * So a long trip pays more: a 600 km leg is 400, a 20 km hop is 50.
 */
export function stagePoints(legKm: number, isIthaca: boolean): number {
  const raw = Math.round((POINTS_BASE + POINTS_PER_KM * Math.max(0, legKm)) / 10) * 10;
  const pts = Math.min(POINTS_MAX, Math.max(POINTS_MIN, raw));
  return isIthaca ? pts + ITHACA_BONUS : pts;
}

/**
 * Points for every stop, in order. `origin` is where the first leg starts: the
 * start for a road trip, the destination centre for a flight (the flight
 * itself earns nothing). Each later leg runs from the previous stop.
 */
export function pointsForStops(origin: LatLng, stops: LatLng[]): number[] {
  let prev = origin;
  return stops.map((p, i) => {
    const pts = stagePoints(haversineKm(prev, p), i === stops.length - 1);
    prev = p;
    return pts;
  });
}

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

const NAME_RULES = `- place_name is the REAL, official or commonly used name of the place exactly as it appears on a map (for example "Buc-ee's" or "Enchanted Rock State Natural Area"). city_region is the real "City, State" or "City, Country". Never invent, rename, shorten into a nickname, or give a themed name in place_name or city_region. No commas inside place_name.
- Every stage must be a real, specific place that exists today and can be found by name in a maps search: a named restaurant, landmark, park, museum, viewpoint, or town. Never invent places. Prefer well-known places over obscure ones.
- Never output coordinates.
- ONLY title and lore carry the myth: title is a short themed name in the style of the Odyssey (for example "Isle of the Lotus Eaters"; the route title follows the same style), lore is one or two sentences of mythic flavor text that hints at what the real place is.
- why is one plain line on why this stop fits the crew's request.`;

const ROAD_INSTRUCTION = `You are the Oracle, a planner of road trips told in the voice of Greek myth.
Given a start, a destination, and the crew's wishes, plan the voyage as a series of stages.

Rules:
- Return 5 to 7 stages in travel order, each one further along the drive from start to destination. No backtracking and no big detours.
- Spread the stages along the whole drive. Do not cluster them near the start or leave one very long empty stretch.
- The final stage MUST be the destination itself.
- Do not include the start as a stage.
- Honour the crew's must-see places and things to avoid when they are mentioned in the travel style.
${NAME_RULES}`;

const FLIGHT_INSTRUCTION = `You are the Oracle, a planner of trips told in the voice of Greek myth.
The crew flies directly to the destination, so there are NO stops on the way. Given the destination and the crew's wishes, plan what they visit once they have landed.

Rules:
- Return 5 to 7 stages, all AT or very near the destination: the same city or its immediate region, within an hour's travel of the destination. Never places in other cities or countries.
- Order them as a sensible visiting sequence (each stage close to the previous one, no zig-zagging across town).
- The FINAL stage is the single most iconic place to visit at the destination.
- Do not include the start city or the airport as a stage.
- Honour the crew's must-see places and things to avoid when they are mentioned in the travel style.
${NAME_RULES}`;

function userPrompt(req: OracleRequest): string {
  const flight = req.travel_mode === 'flight';
  return [
    `Start: ${req.start}`,
    `Destination: ${req.destination}`,
    flight ? 'Travel mode: direct flight (plan places at the destination only)' : 'Travel mode: road',
    `Crew size: ${req.crew_size}`,
    `Travel style: ${req.travel_style}`,
    `Duration: ${req.duration}`,
  ].join('\n');
}

/** Strips a field label the model sometimes writes into the value ("place_name: Ginza Six"). */
const unlabel = (v: unknown): string =>
  (typeof v === 'string' ? v : '').replace(/^\s*(place_name|city_region|name|title|lore)\s*[:=]\s*/i, '').trim();

/**
 * Themed text (title, lore) is English: drop letters from other scripts, which
 * are decoding glitches (Gemma once wrote a stray Vai letter into a lore line).
 */
const latinOnly = (v: string): string => v.replace(/[^\p{Script=Latin}\p{N}\p{P}\p{S}\p{Z}]/gu, '').replace(/\s{2,}/g, ' ').trim();

function cleanStage(s: LlmStage): LlmStage {
  return {
    ...s,
    place_name: unlabel(s.place_name),
    city_region: unlabel(s.city_region),
    title: latinOnly(unlabel(s.title)),
    lore: latinOnly(unlabel(s.lore)),
  };
}

export async function askOracle(req: OracleRequest, keys: OracleKeys): Promise<LlmRoute> {
  let data: unknown;
  let raw: string;
  try {
    ({ data, raw } = await askGemini(
      {
        system: req.travel_mode === 'flight' ? FLIGHT_INSTRUCTION : ROAD_INSTRUCTION,
        input: userPrompt(req),
        schema: ROUTE_SCHEMA,
      },
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
    .map(cleanStage)
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
  bbox?: string,
): Promise<LatLng | null> {
  const params = new URLSearchParams({
    // API limit is 256 chars; semicolons are not allowed.
    q: query.replaceAll(';', ' ').slice(0, 256),
    limit: '1',
    access_token: keys.geocodingApiKey,
  });
  if (proximity) params.set('proximity', `${proximity.lng},${proximity.lat}`);
  if (bbox) params.set('bbox', bbox);

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

/** Mapbox `bbox` (minLng,minLat,maxLng,maxLat) of a square of about `radiusKm` around a point. */
export function bboxAround(c: LatLng, radiusKm: number): string {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(Math.cos((c.lat * Math.PI) / 180), 0.2));
  const f = (n: number) => n.toFixed(4);
  return [c.lng - dLng, c.lat - dLat, c.lng + dLng, c.lat + dLat].map(f).join(',');
}

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
 * Drops every stage that shares its spot (within 100 m) with another stage.
 * When the geocoder cannot find a place it often answers with the city or
 * region centre, so several unfound places land on one identical point.
 * (Seen with Tokyo: Omoide Yokocho, Tokyo Skytree and others all returned the
 * prefecture centre.) A real place never sits on top of another stage.
 */
export function dropCoincident(
  candidates: Candidate[],
): { kept: Candidate[]; dropped: { place: string; reason: string }[] } {
  const kept: Candidate[] = [];
  const dropped: { place: string; reason: string }[] = [];
  for (const c of candidates) {
    const twin = candidates.find((o) => o !== c && haversineKm(o, c) < 0.1);
    if (twin) dropped.push({ place: c.stage.place_name, reason: `same spot as ${twin.stage.place_name}: the geocoder likely only found the area` });
    else kept.push(c);
  }
  return { kept, dropped };
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

/** "Place, City, State": the real name first, then the region, with no stray commas in the place. */
export function realName(s: Pick<LlmStage, 'place_name' | 'city_region'>): string {
  const place = s.place_name.replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const region = (s.city_region ?? '').replace(/\s+/g, ' ').trim();
  return region && !place.toLowerCase().includes(region.toLowerCase()) ? `${place}, ${region}` : place;
}

export async function consultOracle(req: OracleRequest, keys: OracleKeys): Promise<OracleResult> {
  const flight = req.travel_mode === 'flight';
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

  const dropped: { place: string; reason: string }[] = [];
  let all: Candidate[];
  let names: string[];

  if (flight) {
    // Search only inside FLIGHT_RADIUS_KM of the destination (a bbox), so the geocoder cannot answer with
    // a same-named place on another continent (it did: "Tokyo Tower" came back 8,800 km away).
    // The radius check below still guards against bbox corners and bad matches.
    const box = bboxAround(destination, FLIGHT_RADIUS_KM);
    const located = await Promise.all(
      route.stages.map((s) => geocode(`${s.place_name}, ${s.city_region}`, keys, destination, box)),
    );
    const kept: Candidate[] = [];
    route.stages.forEach((stage, i) => {
      const p = located[i];
      if (!p) return void dropped.push({ place: stage.place_name, reason: 'not found by geocoder' });
      const km = haversineKm(p, destination);
      if (km > FLIGHT_RADIUS_KM) {
        return void dropped.push({ place: stage.place_name, reason: `${Math.round(km)} km from the destination (max ${FLIGHT_RADIUS_KM})` });
      }
      kept.push({ stage, ...p });
    });
    const distinct = dropCoincident(kept);
    dropped.push(...distinct.dropped);
    kept.splice(0, kept.length, ...distinct.kept);
    // The last place the LLM chose is Ithaca. If it did not survive, Ithaca is the destination itself.
    const lastChosen = route.stages[route.stages.length - 1];
    if (kept.length === 0 || kept[kept.length - 1].stage !== lastChosen) {
      kept.push({ stage: lastChosen, ...destination });
      names = [...kept.slice(0, -1).map((c) => realName(c.stage)), req.destination];
    } else {
      names = kept.map((c) => realName(c.stage));
    }
    all = kept;
  } else {
    // The last stage is Ithaca. Use the destination we already geocoded rather
    // than trusting a second lookup of the LLM's wording for it.
    const ithaca = route.stages[route.stages.length - 1];
    const waypoints = route.stages.slice(0, -1);

    const midpoint = { lat: (start.lat + destination.lat) / 2, lng: (start.lng + destination.lng) / 2 };
    const located = await Promise.all(
      waypoints.map((s) => geocode(`${s.place_name}, ${s.city_region}`, keys, midpoint)),
    );
    const candidates: Candidate[] = [];
    waypoints.forEach((stage, i) => {
      const p = located[i];
      if (p) candidates.push({ stage, ...p });
      else dropped.push({ place: stage.place_name, reason: 'not found by geocoder' });
    });

    const distinct = dropCoincident(candidates);
    dropped.push(...distinct.dropped);
    const filtered = filterOnRoute(distinct.kept, start, destination);
    dropped.push(...filtered.dropped);
    all = [...filtered.kept, { stage: ithaca, ...destination }];
    // Ithaca keeps the Captain's own wording for the destination.
    names = [...filtered.kept.map((c) => realName(c.stage)), req.destination];
  }

  if (all.length < MIN_STAGES) {
    throw new OracleError(
      'too_few_stages',
      `Only ${all.length} stage(s) survived geocoding; need ${MIN_STAGES}`,
    );
  }

  // A flight earns nothing: its first leg starts at the destination centre.
  const points = pointsForStops(flight ? destination : start, all);
  const stages = all.map((c, i): OracleStage => ({
    order: i + 1,
    name: names[i],
    title: c.stage.title,
    lore: c.stage.lore,
    lat: c.lat,
    lng: c.lng,
    radius_m: RADIUS_M,
    points: points[i],
  }));

  return { title: route.title, start, destination, stages, dropped };
}
