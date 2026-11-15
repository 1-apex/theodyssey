// HTTP helpers shared by the Edge Functions (Deno only).

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

export const fail = (status: number, error: string, message: string): Response =>
  json({ error, message }, status);

/** Hosted projects inject SUPABASE_SECRET_KEYS; the local CLI injects the legacy name. */
export function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  if (legacy) return legacy;
  try {
    return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? '';
  } catch {
    return '';
  }
}

/** Returns the caller's user id, or null if the JWT is missing or invalid. */
export async function callerId(req: Request, supabaseUrl: string, key: string): Promise<string | null> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return null;
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: key, Authorization: authorization },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return typeof user?.id === 'string' ? user.id : null;
}

/**
 * Like callerId, but also says whether the user is anonymous (no email or phone,
 * `is_anonymous` set by Supabase for anonymous sign-ins). Null when the JWT is missing or invalid.
 */
export async function callerInfo(
  req: Request,
  supabaseUrl: string,
  key: string,
): Promise<{ id: string; anonymous: boolean } | null> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return null;
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: key, Authorization: authorization },
  });
  if (!res.ok) return null;
  const user = await res.json();
  if (typeof user?.id !== 'string') return null;
  return { id: user.id, anonymous: user.is_anonymous === true };
}
