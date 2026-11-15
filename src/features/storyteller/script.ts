// The scripted fallback: when the chat server keeps failing, Odysseus asks the
// questions himself, one at a time, and fills the trip from the answers. Plain
// TypeScript with no React so it can be unit tested.

import type { TripDraft } from '../../lib/types';

/** The things a trip needs, in the order Odysseus asks for them. */
export const SCRIPT_FIELDS = ['destination', 'start', 'crew_size', 'duration', 'travel_style'] as const;
export type ScriptField = (typeof SCRIPT_FIELDS)[number];

export const EMPTY_TRIP: TripDraft = {
  start: null,
  destination: null,
  crew_size: null,
  duration: null,
  travel_style: null,
  visibility_mode: null,
};

/** The first field that is neither known nor already asked about, or null when nothing is left. */
export function nextField(trip: TripDraft, asked: readonly ScriptField[]): ScriptField | null {
  for (const field of SCRIPT_FIELDS) {
    if (trip[field] === null && !asked.includes(field)) return field;
  }
  return null;
}

const LIMITS: Record<Exclude<ScriptField, 'crew_size'>, number> = {
  destination: 120,
  start: 120,
  duration: 60,
  travel_style: 300,
};

/** Reads a head count out of free text ("4 of us", "just me", "two"). Null when there is none. */
export function parseCrewSize(answer: string): number | null {
  const text = answer.toLowerCase();
  const digits = /\d+/.exec(text);
  if (digits) {
    const n = Number(digits[0]);
    return n >= 1 ? Math.min(n, 20) : null;
  }
  if (/\b(solo|alone|just me|only me|myself)\b/.test(text)) return 1;
  const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const at = words.findIndex((w) => new RegExp(`\\b${w}\\b`).test(text));
  return at >= 0 ? at + 1 : null;
}

/** Records the traveler's answer to `field`. An unreadable head count stays unknown. */
export function applyAnswer(trip: TripDraft, field: ScriptField, answer: string): TripDraft {
  const clean = answer.replace(/\s+/g, ' ').trim();
  if (field === 'crew_size') return { ...trip, crew_size: parseCrewSize(clean) };
  return { ...trip, [field]: clean.slice(0, LIMITS[field]) };
}
