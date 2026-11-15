// Gemini Interactions API call with structured JSON output.
// Runtime-agnostic (only `fetch`): used by the Edge Functions and Node scratch scripts.

// Cheapest Gemini text model open to new API keys as of 2026-11 ($0.25 in /
// $1.50 out per 1M tokens, has a free tier). gemini-2.5-flash-lite is cheaper
// but returns 404 for new accounts. Override with the LLM_MODEL secret.
export const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

export interface GeminiKeys {
  llmApiKey: string;
  /** Gemini model id. Defaults to DEFAULT_MODEL. */
  model?: string;
  /** Override the API host. Only for tests against a mock server. */
  llmBaseUrl?: string;
}

export class GeminiError extends Error {
  code: 'llm_failed' | 'llm_bad_output';
  constructor(code: 'llm_failed' | 'llm_bad_output', message: string) {
    super(message);
    this.code = code;
  }
}

/** Pulls the model's text out of an Interaction resource. */
export function outputText(interaction: unknown): string {
  const steps = (interaction as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return '';
  let text = '';
  for (const step of steps) {
    if (step?.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const part of step.content) {
      if (part?.type === 'text' && typeof part.text === 'string') text += part.text;
    }
  }
  return text;
}

/**
 * One call. Returns the parsed JSON the model produced (shape is NOT checked
 * here; the caller validates). Throws GeminiError.
 */
export async function askGemini(
  opts: { system: string; input: string; schema: unknown },
  keys: GeminiKeys,
): Promise<{ data: unknown; raw: string }> {
  const base = keys.llmBaseUrl ?? 'https://generativelanguage.googleapis.com';
  const res = await fetch(`${base}/v1beta/interactions`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': keys.llmApiKey,
      'Content-Type': 'application/json',
      'Api-Revision': '2026-05-20',
    },
    body: JSON.stringify({
      model: keys.model ?? DEFAULT_MODEL,
      system_instruction: opts.system,
      input: opts.input,
      response_format: { type: 'text', mime_type: 'application/json', schema: opts.schema },
      store: false,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new GeminiError('llm_failed', `LLM returned ${res.status}: ${raw.slice(0, 500)}`);
  }
  try {
    const interaction = JSON.parse(raw);
    if (interaction.status !== 'completed') throw new Error(`status ${interaction.status}`);
    return { data: JSON.parse(outputText(interaction)), raw };
  } catch (e) {
    throw new GeminiError(
      'llm_bad_output',
      `Could not read LLM output (${(e as Error).message}): ${raw.slice(0, 500)}`,
    );
  }
}
