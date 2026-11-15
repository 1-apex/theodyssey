// odysseus-voice: Odysseus speaks. Text in, an mp3 (base64) out, via ElevenLabs.
//
//   POST /functions/v1/odysseus-voice   (Authorization: Bearer <user JWT>)
//   body:    OdysseusVoiceRequest   { text }  (src/lib/types.ts)
//   200:     OdysseusVoiceResponse  { audio: <base64 mp3>, mime: "audio/mpeg" }
//   failure: { error: <code>, message }
//            400 invalid_request | 401 not_authenticated | 403 account_required |
//            503 voice_not_configured | 502 voice_failed | 500
//
// Secrets: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID (both required, else 503 and
// the app stays silent), ELEVENLABS_MODEL (optional), ELEVENLABS_BASE_URL (tests only).
// Only signed-in, non-anonymous users may call it: it spends paid credits.

import { callerInfo, CORS, fail, json, serviceKey } from '../_shared/http.ts';
import { parseVoiceRequest, speak, voiceConfig, VoiceError } from './voice.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST');

  const key = serviceKey();
  if (!SUPABASE_URL || !key) {
    console.error('Missing config: SUPABASE_URL or service key');
    return fail(500, 'not_configured', 'Odysseus is not configured');
  }

  const caller = await callerInfo(req, SUPABASE_URL, key);
  if (!caller) return fail(401, 'not_authenticated', 'Sign in first');
  if (caller.anonymous) return fail(403, 'account_required', 'Sign in with an account to hear Odysseus');

  const body = parseVoiceRequest(await req.json().catch(() => null));
  if (typeof body === 'string') return fail(400, 'invalid_request', body);

  const cfg = voiceConfig((n) => Deno.env.get(n));
  if (!cfg) return fail(503, 'voice_not_configured', 'Odysseus has no voice yet');

  try {
    return json(await speak(body.text, cfg));
  } catch (e) {
    if (e instanceof VoiceError) {
      console.error(`odysseus-voice failed [${e.code}]`, e.message); // upstream text stays in the logs
      return fail(502, 'voice_failed', 'Odysseus lost his voice. Try again.');
    }
    console.error('odysseus-voice failed', e);
    return fail(500, 'internal', 'Odysseus fell silent');
  }
});
