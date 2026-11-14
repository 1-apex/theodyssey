// generate-odyssey: the Captain's prompt becomes a saved, geocoded route.
//
//   POST /functions/v1/generate-odyssey   (Authorization: Bearer <user JWT>)
//   body:    GenerateOdysseyRequest  (src/lib/types.ts)
//   200:     { odyssey_id, join_code }
//   failure: { error: <code>, message }   400 | 401 | 422 | 502 | 500
//
// Flow: insert odyssey (forging) -> Oracle (one retry) -> insert stages -> lobby.
// If anything fails after the first insert, the forging row is deleted.
//
// No imports beyond the Oracle: Auth and PostgREST are called with fetch, so
// the function has no npm dependencies to download or bundle.

import { consultOracle, OracleError, type OracleRequest } from './oracle.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ---------------------------------------------------------------------------
// Supabase access. The service key bypasses RLS, so every query below is
// scoped to the odyssey this request created.
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

/** Hosted projects inject SUPABASE_SECRET_KEYS; the local CLI injects the legacy name. */
function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  if (legacy) return legacy;
  try {
    return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? '';
  } catch {
    return '';
  }
}

/** Returns the caller's user id, or null if the JWT is missing or invalid. */
async function callerId(req: Request, key: string): Promise<string | null> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: key, Authorization: authorization },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return typeof user?.id === 'string' ? user.id : null;
}

class DbError extends Error {
  code: string | undefined;
  constructor(status: number, body: { code?: string; message?: string }) {
    super(`PostgREST ${status}: ${body.message ?? 'unknown error'}`);
    this.code = body.code;
  }
}

/** One PostgREST call as the service role. Returns the affected rows. */
async function db(
  key: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new DbError(res.status, data);
  return data;
}

interface Body extends OracleRequest {
  visibility_mode: 'open' | 'fog';
  nickname?: string;
  avatar_id?: string;
}

const fail = (status: number, error: string, message: string): Response =>
  json({ error, message }, status);

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() !== '' && v.trim().length <= max ? v.trim() : null;

/** Returns the cleaned body, or a message describing what is wrong. */
function parseBody(raw: unknown): Body | string {
  if (typeof raw !== 'object' || raw === null) return 'Body must be a JSON object';
  const b = raw as Record<string, unknown>;

  const start = str(b.start, 120);
  const destination = str(b.destination, 120);
  if (!start) return 'start is required (max 120 characters)';
  if (!destination) return 'destination is required (max 120 characters)';
  if (b.visibility_mode !== 'open' && b.visibility_mode !== 'fog') {
    return 'visibility_mode must be "open" or "fog"';
  }

  const crew = Number(b.crew_size ?? 2);
  const nickname = b.nickname === undefined ? undefined : str(b.nickname, 24);
  const avatar_id = b.avatar_id === undefined ? undefined : str(b.avatar_id, 40);
  if (nickname === null) return 'nickname must be 1 to 24 characters';
  if (avatar_id === null) return 'avatar_id must be 1 to 40 characters';
  if ((nickname === undefined) !== (avatar_id === undefined)) {
    return 'nickname and avatar_id must be sent together';
  }

  return {
    start,
    destination,
    crew_size: Number.isFinite(crew) ? Math.min(Math.max(Math.round(crew), 1), 20) : 2,
    travel_style: str(b.travel_style, 300) ?? 'a balanced mix of sights and food',
    duration: str(b.duration, 60) ?? 'flexible',
    visibility_mode: b.visibility_mode,
    nickname,
    avatar_id,
  };
}

// What the client is told. Upstream error bodies stay in the function logs.
const ORACLE_FAILURE: Record<OracleError['code'], { status: number; message: string | null }> = {
  endpoint_not_found: { status: 422, message: null }, // keep: says which end was not found
  too_few_stages: { status: 422, message: 'The Oracle could not chart enough real places. Try again.' },
  llm_failed: { status: 502, message: 'The Oracle is silent. Try again in a moment.' },
  llm_bad_output: { status: 502, message: 'The Oracle spoke in riddles. Try again.' },
};

/** These are usually transient (rate limit, a bad roll of the dice), so try twice. */
const RETRYABLE: OracleError['code'][] = ['llm_failed', 'llm_bad_output', 'too_few_stages'];

async function consultWithRetry(
  ...args: Parameters<typeof consultOracle>
): ReturnType<typeof consultOracle> {
  try {
    return await consultOracle(...args);
  } catch (e) {
    if (!(e instanceof OracleError) || !RETRYABLE.includes(e.code)) throw e;
    console.warn(`oracle attempt 1 failed [${e.code}], retrying: ${e.message}`);
    return await consultOracle(...args);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST');

  const key = serviceKey();
  const llmApiKey = Deno.env.get('LLM_API_KEY');
  const geocodingApiKey = Deno.env.get('GEOCODING_API_KEY');
  if (!SUPABASE_URL || !key || !llmApiKey || !geocodingApiKey) {
    console.error('Missing config: SUPABASE_URL, service key, LLM_API_KEY or GEOCODING_API_KEY');
    return fail(500, 'not_configured', 'The Oracle is not configured');
  }

  const captainId = await callerId(req, key);
  if (!captainId) return fail(401, 'not_authenticated', 'Sign in first');

  const body = parseBody(await req.json().catch(() => null));
  if (typeof body === 'string') return fail(400, 'invalid_request', body);

  // 1. Forging row. Retry only on a join_code collision (unique violation).
  let odyssey: { id: string; join_code: string } | null = null;
  for (let attempt = 0; attempt < 3 && !odyssey; attempt++) {
    try {
      const [row] = await db(key, 'POST', 'odysseys?select=id,join_code', {
        captain_id: captainId,
        title: `Voyage to ${body.destination}`,
        start_name: body.start,
        destination_name: body.destination,
        visibility_mode: body.visibility_mode,
      });
      odyssey = row as { id: string; join_code: string };
    } catch (e) {
      if (!(e instanceof DbError && e.code === '23505')) {
        console.error('insert odyssey failed', e);
        return fail(500, 'internal', 'Could not create the Odyssey');
      }
    }
  }
  if (!odyssey) return fail(500, 'internal', 'Could not create the Odyssey');
  const odysseyId = odyssey.id;

  try {
    // 2. The Oracle.
    const result = await consultWithRetry(body, {
      llmApiKey,
      geocodingApiKey,
      model: Deno.env.get('LLM_MODEL') ?? undefined,
      llmBaseUrl: Deno.env.get('LLM_BASE_URL') ?? undefined,
      geocodingBaseUrl: Deno.env.get('GEOCODING_BASE_URL') ?? undefined,
    });
    if (result.dropped.length > 0) console.log('dropped stages', result.dropped);

    // 3. Persist. Stages first, so the odyssey only reaches `lobby` with a route.
    await db(key, 'POST', 'stages', result.stages.map((s) => ({ ...s, odyssey_id: odysseyId })));

    if (body.nickname && body.avatar_id) {
      await db(key, 'POST', 'members', {
        odyssey_id: odysseyId,
        user_id: captainId,
        nickname: body.nickname,
        avatar_id: body.avatar_id,
      });
    }

    await db(key, 'PATCH', `odysseys?id=eq.${odysseyId}`, {
      title: result.title.slice(0, 120),
      status: 'lobby',
    });

    return json({ odyssey_id: odysseyId, join_code: odyssey.join_code });
  } catch (e) {
    // forging -> gone. Stages and members go with it (on delete cascade).
    await db(key, 'DELETE', `odysseys?id=eq.${odysseyId}`).catch((err) =>
      console.error('could not delete forging odyssey', err)
    );
    if (e instanceof OracleError) {
      console.error(`oracle failed [${e.code}]`, e.message);
      const { status, message } = ORACLE_FAILURE[e.code];
      return fail(status, e.code, message ?? e.message);
    }
    console.error('generate-odyssey failed', e);
    return fail(500, 'internal', 'The Oracle fell silent');
  }
});
