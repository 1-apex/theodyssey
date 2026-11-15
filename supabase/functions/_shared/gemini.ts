// Gemini Interactions API call with structured JSON output.
// Runtime-agnostic (only `fetch`): used by the Edge Functions and Node scratch scripts.

// Two jobs, one fast model. Measured on the live server (see DEVLOG): the
// "flash-lite" models answer a 5-stage route in about 2 s with no thinking,
// where Gemma 4 31B often answered 503 "high demand" (or hung until the
// timeout) and the thinking models (3.5/3.6 flash) took 10 s or more for the
// same route with no visible gain in the places chosen.
//  - Chat and Planner: gemini-3.1-flash-lite.
//  - Retry: gemini-3.5-flash-lite, a different model so a busy one does not fail the request.
// Override with the LLM_CHAT_MODEL / LLM_PLANNER_MODEL secrets; the old LLM_MODEL
// secret still overrides both. See modelFor().
export const CHAT_MODEL = 'gemini-3.1-flash-lite';
export const PLANNER_MODEL = 'gemini-3.1-flash-lite';
export const BACKUP_MODEL = 'gemini-3.5-flash-lite';

// The one retry each function makes goes to the OTHER model.
export const CHAT_FALLBACK_MODEL = BACKUP_MODEL;
export const PLANNER_FALLBACK_MODEL = BACKUP_MODEL;

/** Kept for callers that want "the default"; this is the planner model. */
export const DEFAULT_MODEL = PLANNER_MODEL;
/** Kept for older imports: the planner's fallback. */
export const FALLBACK_MODEL = PLANNER_FALLBACK_MODEL;

export type LlmJob = 'chat' | 'planner';

/** Model for a job from an env-like getter: LLM_CHAT_MODEL / LLM_PLANNER_MODEL, else LLM_MODEL, else the default. */
export function modelFor(job: LlmJob, get: (name: string) => string | undefined): string {
  const specific = get(job === 'chat' ? 'LLM_CHAT_MODEL' : 'LLM_PLANNER_MODEL')?.trim();
  const shared = get('LLM_MODEL')?.trim();
  return specific || shared || (job === 'chat' ? CHAT_MODEL : PLANNER_MODEL);
}

/**
 * Keys for the retry: the job's fallback model, unless that is what just
 * failed (then the other one, so the retry is always a different model).
 */
export function retryKeys<K extends { model?: string }>(keys: K, job: LlmJob = 'planner'): K {
  const fallback = job === 'chat' ? CHAT_FALLBACK_MODEL : PLANNER_FALLBACK_MODEL;
  const primary = job === 'chat' ? CHAT_MODEL : PLANNER_MODEL;
  const current = keys.model ?? primary;
  return { ...keys, model: current === fallback ? primary : fallback };
}

export interface GeminiKeys {
  llmApiKey: string;
  /** Gemini model id. Defaults to the planner model. */
  model?: string;
  /** Override the API host. Only for tests against a mock server. */
  llmBaseUrl?: string;
  /** Give up on one call after this long (default 30 s). A hung model otherwise stalls for minutes. */
  timeoutMs?: number;
  /**
   * `generation_config.thinking_level`. Left out by default (the flash-lite models do not think unless asked).
   * Not sent to Gemma, which rejects it.
   */
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  /** `generation_config.max_output_tokens`, a runaway guard (thinking tokens count too). Not sent to Gemma, which spends it on thinking. */
  maxOutputTokens?: number;
}

/** Gemma models take no generation_config here (thinking_level is rejected, and the token cap is eaten by its thinking). */
const isGemma = (model: string): boolean => model.toLowerCase().startsWith('gemma');

/** The generation_config for a call, or undefined when there is nothing to set. */
export function generationConfig(model: string, keys: Pick<GeminiKeys, 'thinkingLevel' | 'maxOutputTokens'>) {
  if (isGemma(model)) return undefined;
  const cfg: Record<string, unknown> = {};
  if (keys.thinkingLevel) cfg.thinking_level = keys.thinkingLevel;
  if (keys.maxOutputTokens) cfg.max_output_tokens = keys.maxOutputTokens;
  return Object.keys(cfg).length > 0 ? cfg : undefined;
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
 * JSON.parse that also accepts what models sometimes wrap around JSON: a
 * ```json fence or a sentence before/after the object. Throws if no object parses.
 */
export function parseLenient(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('no JSON object in output');
  }
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
  const model = keys.model ?? PLANNER_MODEL;
  let res: Response;
  let raw: string;
  try {
    res = await fetch(`${base}/v1beta/interactions`, {
      signal: AbortSignal.timeout(keys.timeoutMs ?? 30_000),
      method: 'POST',
      headers: {
        'x-goog-api-key': keys.llmApiKey,
        'Content-Type': 'application/json',
        'Api-Revision': '2026-05-20',
      },
      body: JSON.stringify({
        model,
        system_instruction: opts.system,
        input: opts.input,
        response_format: { type: 'text', mime_type: 'application/json', schema: opts.schema },
        generation_config: generationConfig(model, keys),
        store: false,
      }),
    });
    raw = await res.text();
  } catch (e) {
    // Timeout, DNS, TLS, connection reset: all "the model is unreachable", so the caller's retry applies.
    throw new GeminiError('llm_failed', `LLM call failed (${(e as Error).name}): ${(e as Error).message}`);
  }
  if (!res.ok) {
    throw new GeminiError('llm_failed', `LLM returned ${res.status}: ${raw.slice(0, 500)}`);
  }
  try {
    const interaction = JSON.parse(raw);
    if (interaction.status !== 'completed') throw new Error(`status ${interaction.status}`);
    return { data: parseLenient(outputText(interaction)), raw };
  } catch (e) {
    throw new GeminiError(
      'llm_bad_output',
      `Could not read LLM output (${(e as Error).message}): ${raw.slice(0, 500)}`,
    );
  }
}
