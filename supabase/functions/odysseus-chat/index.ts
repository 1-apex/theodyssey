// odysseus-chat: one turn of the conversation where Odysseus plans a trip.
//
//   POST /functions/v1/odysseus-chat   (Authorization: Bearer <user JWT>)
//   body:    OdysseusChatRequest   (src/lib/types.ts)
//   200:     OdysseusChatResponse  { reply, trip, ready, on_topic }
//   failure: { error: <code>, message }   400 | 401 | 502 | 500
//
// Stateless: the app sends the whole transcript each time. No DB access, no
// npm imports. Auth is checked with fetch against the Auth server.

import { chatWithOdysseus, ChatError, parseChatRequest } from './chat.ts';
import { callerId, CORS, fail, json, serviceKey } from '../_shared/http.ts';
import { modelFor } from '../_shared/gemini.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST');

  const key = serviceKey();
  const llmApiKey = Deno.env.get('LLM_API_KEY');
  if (!SUPABASE_URL || !key || !llmApiKey) {
    console.error('Missing config: SUPABASE_URL, service key or LLM_API_KEY');
    return fail(500, 'not_configured', 'Odysseus is not configured');
  }

  if (!(await callerId(req, SUPABASE_URL, key))) return fail(401, 'not_authenticated', 'Sign in first');

  const messages = parseChatRequest(await req.json().catch(() => null));
  if (typeof messages === 'string') return fail(400, 'invalid_request', messages);

  const startedAt = Date.now();
  try {
    const result = await chatWithOdysseus(messages, {
      llmApiKey,
      model: modelFor('chat', (n) => Deno.env.get(n)),
      llmBaseUrl: Deno.env.get('LLM_BASE_URL') ?? undefined,
    });
    console.log(`chat ok: ${messages.length} msgs, ${Date.now() - startedAt} ms`);
    return json(result);
  } catch (e) {
    if (e instanceof ChatError) {
      console.error(`odysseus failed [${e.code}]`, e.message);
      return fail(
        502,
        e.code,
        e.code === 'llm_failed'
          ? 'Odysseus is lost at sea. Try again in a moment.'
          : 'Odysseus mumbled something unreadable. Try again.',
      );
    }
    console.error('odysseus-chat failed', e);
    return fail(500, 'internal', 'Odysseus fell silent');
  }
});
