// The state of the conversation with Odysseus, as plain functions so it can be
// unit tested. The screen keeps a ChatState and feeds it events: the traveler
// sending, the server answering or failing, a retry, the typewriter finishing.
//
// Odysseus's replies come from the odysseus-chat Edge Function. After two
// failures in a row the chat switches to a scripted mode (script.ts) so a demo
// never dead-ends.

import type { ChatMessage, GenerateOdysseyRequest, OdysseusChatResponse, TripDraft } from '../../lib/types';
import { storyteller as copy } from '../../theme/copy';
import { applyAnswer, EMPTY_TRIP, nextField, type ScriptField } from './script';

export const MAX_TEXT = 500;
export const MAX_MESSAGES = 40;
/** Failures in a row before the scripted mode takes over. */
export const FAILURES_BEFORE_SCRIPT = 2;

export interface Line {
  id: number;
  role: ChatMessage['role'];
  text: string;
}

export interface ChatState {
  lines: Line[];
  trip: TripDraft;
  /** The server (or the script) says the trip is complete: show "Summon the Oracle". */
  ready: boolean;
  /** A reply is awaited. */
  waiting: boolean;
  /** Changes with every request, so the screen can tell a new request from a re-render. */
  requestId: number;
  /** The Odysseus line currently being typed out, if any. */
  typingId: number | null;
  /** The last request failed and "Try again" is on offer. */
  failed: boolean;
  /** Failures in a row. */
  failures: number;
  scripted: boolean;
  /** Scripted mode: the field the last question was about. */
  asking: ScriptField | null;
  /** Scripted mode: fields already asked about, answered or not. */
  asked: ScriptField[];
  nextId: number;
}

/** A conversation that opens with Odysseus's greeting, typed out. */
export function startChat(greeting: string): ChatState {
  return {
    lines: [{ id: 0, role: 'odysseus', text: greeting }],
    trip: EMPTY_TRIP,
    ready: false,
    waiting: false,
    requestId: 0,
    typingId: 0,
    failed: false,
    failures: 0,
    scripted: false,
    asking: null,
    asked: [],
    nextId: 1,
  };
}

/** The traveler cannot send while a reply is awaited or Odysseus is still writing. */
export const isBusy = (s: ChatState): boolean => s.waiting || s.typingId !== null;

/** Trimmed and cut to the server limit; null when nothing is left. */
export function cleanInput(text: string): string | null {
  const t = text.trim().slice(0, MAX_TEXT).trim();
  return t === '' ? null : t;
}

function append(s: ChatState, role: Line['role'], text: string): ChatState {
  return { ...s, lines: [...s.lines, { id: s.nextId, role, text }], nextId: s.nextId + 1 };
}

/** The traveler's message appears at once and a reply is awaited. */
export function sendMessage(s: ChatState, text: string): ChatState {
  const clean = cleanInput(text);
  if (clean === null || isBusy(s)) return s;
  return { ...append(s, 'traveler', clean), waiting: true, requestId: s.requestId + 1, failed: false };
}

/** Resend the same conversation after a failure. */
export function retry(s: ChatState): ChatState {
  if (!s.failed || s.waiting) return s;
  return { ...s, waiting: true, requestId: s.requestId + 1, failed: false };
}

/** The server answered. Ignored unless a reply was awaited in server mode. */
export function receiveReply(s: ChatState, res: OdysseusChatResponse): ChatState {
  if (!s.waiting || s.scripted) return s;
  const next = append(s, 'odysseus', res.reply);
  return { ...next, trip: res.trip, ready: res.ready, waiting: false, failures: 0, typingId: s.nextId };
}

/** The server failed. The first time a retry is offered; the second time the script takes over. */
export function receiveFailure(s: ChatState): ChatState {
  if (!s.waiting || s.scripted) return s;
  const failures = s.failures + 1;
  if (failures < FAILURES_BEFORE_SCRIPT) return { ...s, waiting: false, failed: true, failures };
  return advanceScript({ ...s, scripted: true, failures, failed: false, asking: nextField(s.trip, s.asked) }, copy.scriptedNotice);
}

/** Scripted mode: Odysseus answers locally after the traveler's message. */
export function scriptedReply(s: ChatState): ChatState {
  if (!s.waiting || !s.scripted) return s;
  return advanceScript(s, '');
}

/** Takes the traveler's last message as the answer to what was asked, then asks for the next unknown. */
function advanceScript(s: ChatState, prefix: string): ChatState {
  let { trip, asked } = s;
  const answer = [...s.lines].reverse().find((l) => l.role === 'traveler');
  if (s.asking !== null && answer) {
    trip = applyAnswer(trip, s.asking, answer.text);
    asked = [...asked, s.asking];
  }
  const field = nextField(trip, asked);
  const ready = field === null && trip.destination !== null && trip.start !== null;
  const text = field !== null ? scriptQuestion(field) : s.asking === null ? copy.scriptedDone : copy.closing;
  const next = append(s, 'odysseus', prefix + text);
  return { ...next, trip, asked, asking: field, ready, waiting: false, typingId: s.nextId };
}

/** What Odysseus asks for each field. The first question is the greeting; the rest are the prompts. */
export function scriptQuestion(field: ScriptField): string {
  const questions: Record<ScriptField, string> = {
    destination: copy.greeting,
    start: copy.prompts[0],
    crew_size: copy.prompts[1],
    duration: copy.prompts[2],
    travel_style: copy.prompts[3],
  };
  return questions[field];
}

/** The typewriter has shown the whole line. */
export function finishTyping(s: ChatState, id: number): ChatState {
  return s.typingId === id ? { ...s, typingId: null } : s;
}

/**
 * What goes to the server: the most recent 40 messages, each 1 to 500 characters,
 * ending with the traveler's. Fails never reach the transcript (they are not lines).
 */
export function serverMessages(lines: readonly Line[]): ChatMessage[] {
  const all = lines
    .map((l): ChatMessage => ({ role: l.role, text: l.text.trim().slice(0, MAX_TEXT).trim() }))
    .filter((m) => m.text !== '');
  while (all.length > 0 && all[all.length - 1].role !== 'traveler') all.pop();
  return all.slice(-MAX_MESSAGES);
}

/** The Oracle's request for this trip, with defaults for what was never said. Null until start and destination are known. */
export function tripToRequest(trip: TripDraft, nickname: string, avatar: string): GenerateOdysseyRequest | null {
  if (!trip.start || !trip.destination) return null;
  return {
    start: trip.start,
    destination: trip.destination,
    crew_size: trip.crew_size ?? 2,
    duration: trip.duration ?? '',
    travel_style: trip.travel_style ?? '',
    visibility_mode: trip.visibility_mode ?? 'fog',
    points_mode: 'crew',
    nickname,
    avatar_id: avatar,
  };
}
