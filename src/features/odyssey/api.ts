// Calls that create or change an Odyssey from outside a voyage: the Oracle,
// joining, and setting sail. Reads during a voyage go through OdysseyBackend.
//
// Every failure is thrown as an ApiError whose `code` is a key of
// `app.errors` in src/theme/copy.ts.

import { accessToken, ensureSignedIn, supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '../../lib/supabase';
import type {
  ChatMessage,
  GenerateOdysseyRequest,
  GenerateOdysseyResponse,
  JoinOdysseyResult,
  OdysseusChatResponse,
  PointsMode,
  SetSailResult,
  VisibilityMode,
} from '../../lib/types';
import { parseChatResponse } from '../storyteller/chatResponse';

export class ApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/** Turns anything thrown into an ApiError. Network failures become `network`. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const message = e instanceof Error ? e.message : '';
  if (message === 'not_authenticated') return new ApiError('not_authenticated');
  if (/network|fetch|timed? ?out/i.test(message)) return new ApiError('network');
  return new ApiError('unknown');
}

async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc(name, params);
  // The RPCs raise a stable snake_case message; anything else is unexpected.
  if (error) throw new ApiError(/^[a-z_]+$/.test(error.message) ? error.message : toApiError(error).code);
  return data as T;
}

/** Summon the Oracle: the Edge Function generates and saves the route. Can take several seconds. */
export async function createOdyssey(request: GenerateOdysseyRequest): Promise<GenerateOdysseyResponse> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/generate-odyssey`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new ApiError('network');
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok && body !== null && typeof body === 'object' && 'odyssey_id' in body) {
    return body as GenerateOdysseyResponse;
  }
  const code = body !== null && typeof body === 'object' && 'error' in body ? String(body.error) : 'internal';
  throw new ApiError(code);
}

/** One turn of the chat with Odysseus. Send the whole transcript (1 to 40 messages, the last from the traveler). */
export async function chatWithOdysseus(messages: ChatMessage[]): Promise<OdysseusChatResponse> {
  const token = await accessToken();
  let res: Response;
  // The function retries the model once, so allow for two calls. (AbortSignal.timeout is not on every runtime.)
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 40_000);
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/odysseus-chat`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
      signal: abort.signal,
    });
  } catch {
    throw new ApiError('network');
  } finally {
    clearTimeout(timer);
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) {
    // A body of the wrong shape counts as a failed call, so the chat offers "Try again" instead of breaking.
    const checked = parseChatResponse(body);
    if (checked !== null) return checked;
    throw new ApiError('internal');
  }
  const code = body !== null && typeof body === 'object' && 'error' in body ? String(body.error) : 'internal';
  throw new ApiError(code);
}

/** What `speakAsOdysseus` found: the speech, or nothing to play. */
export type SpeechResult = { kind: 'audio'; audio: string; mime: string } | { kind: 'silent' };

const SILENT: SpeechResult = { kind: 'silent' };

/**
 * Odysseus's voice for one reply: base64 MP3 from the odysseus-voice Edge Function. Never throws:
 * voice_not_configured (503), account_required (403), a timeout, a network error or a malformed
 * body all give `{ kind: 'silent' }`, and the chat simply goes on without sound.
 */
export async function speakAsOdysseus(text: string): Promise<SpeechResult> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 20_000);
  try {
    const token = await accessToken();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/odysseus-voice`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: abort.signal,
    });
    if (!res.ok) return SILENT;
    const body: unknown = await res.json().catch(() => null);
    if (body === null || typeof body !== 'object' || !('audio' in body) || typeof body.audio !== 'string' || body.audio === '') return SILENT;
    const mime = 'mime' in body && typeof body.mime === 'string' ? body.mime : 'audio/mpeg';
    return { kind: 'audio', audio: body.audio, mime };
  } catch {
    return SILENT;
  } finally {
    clearTimeout(timer);
  }
}

/** The pre-seeded route. No AI involved; the fallback when the Oracle fails. */
export function createDemoOdyssey(visibility: VisibilityMode, points: PointsMode): Promise<GenerateOdysseyResponse> {
  return rpc('create_demo_odyssey', { p_visibility_mode: visibility, p_points_mode: points });
}

export function joinOdyssey(joinCode: string, nickname: string, avatarId: string): Promise<JoinOdysseyResult> {
  return rpc('join_odyssey', { p_join_code: joinCode, p_nickname: nickname, p_avatar_id: avatarId });
}

export function setSail(odysseyId: string): Promise<SetSailResult> {
  return rpc('set_sail', { p_odyssey_id: odysseyId });
}

/** The signed-in user's member id in this Odyssey, or null if they have not joined it. */
export async function findMyMemberId(odysseyId: string): Promise<string | null> {
  const userId = await ensureSignedIn();
  const { data, error } = await supabase
    .from('members')
    .select('id')
    .eq('odyssey_id', odysseyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw toApiError(error);
  return data?.id ?? null;
}

// Avatars are a fixed set, picked by index in the UI and stored as an id.
export const avatarId = (index: number): string => `avatar_${index}`;
export const avatarIndex = (id: string, count: number): number => {
  const n = Number.parseInt(id.replace(/\D+/g, ''), 10);
  return Number.isFinite(n) ? n % count : 0;
};
