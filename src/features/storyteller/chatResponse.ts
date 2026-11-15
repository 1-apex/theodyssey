// Checks what odysseus-chat sent before the app trusts it. A body that does not have the
// expected shape is a failed call (the chat then offers "Try again"), never a crash.
// Plain TypeScript with no React so it can be unit tested.

import type { OdysseusChatResponse, TripDraft } from '../../lib/types';

/** A reply is about 350 characters; anything much longer is cut so one bubble cannot fill the screen. */
export const MAX_REPLY_CHARS = 1000;

const FIELD_LIMITS = { start: 120, destination: 120, duration: 60, travel_style: 300 } as const;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(v: unknown, limit: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim().slice(0, limit).trim();
  return t === '' ? null : t;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

/** Cuts a long reply at the last space before the limit and adds an ellipsis. */
export function capReply(reply: string): string {
  if (reply.length <= MAX_REPLY_CHARS) return reply;
  const cut = reply.slice(0, MAX_REPLY_CHARS);
  const space = cut.lastIndexOf(' ');
  return `${(space > MAX_REPLY_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Each field of the trip, with anything of the wrong type or out of range read as unknown. */
export function readTrip(raw: unknown): TripDraft | null {
  if (!isRecord(raw)) return null;
  const crew = raw.crew_size;
  return {
    start: text(raw.start, FIELD_LIMITS.start),
    destination: text(raw.destination, FIELD_LIMITS.destination),
    travel_mode: oneOf(raw.travel_mode, ['road', 'flight'] as const),
    crew_size: typeof crew === 'number' && Number.isInteger(crew) && crew >= 1 && crew <= 20 ? crew : null,
    duration: text(raw.duration, FIELD_LIMITS.duration),
    travel_style: text(raw.travel_style, FIELD_LIMITS.travel_style),
    visibility_mode: oneOf(raw.visibility_mode, ['open', 'fog'] as const),
  };
}

/** The checked response, or null when the body is not a usable reply (no text, no trip object). Extra fields are dropped. */
export function parseChatResponse(body: unknown): OdysseusChatResponse | null {
  if (!isRecord(body) || typeof body.reply !== 'string') return null;
  const reply = capReply(body.reply.trim());
  const trip = readTrip(body.trip);
  if (reply === '' || trip === null) return null;
  return { reply, trip, ready: body.ready === true, on_topic: body.on_topic !== false };
}
