// Odysseus speaks: the logic behind the odysseus-voice Edge Function.
//
// Runtime-agnostic (only `fetch`, `btoa`, no Deno APIs) so it runs in the Edge
// Function and in Node tests.
//
// ElevenLabs text-to-speech, "Convert" endpoint:
//   POST {base}/v1/text-to-speech/{voice_id}?output_format=mp3_22050_32
//   headers: xi-api-key: <key>, Content-Type: application/json
//   body:    { text, model_id }
//   200:     the audio bytes
// Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
// Models: https://elevenlabs.io/docs/overview/models

/**
 * eleven_flash_v2_5: about 100 ms median latency, 32 languages (Odysseus
 * answers in the traveler's language), and cheap. Override with ELEVENLABS_MODEL.
 */
export const DEFAULT_VOICE_MODEL = 'eleven_flash_v2_5';

/**
 * mp3_22050_32: MP3, 22.05 kHz, 32 kbps. Plenty for one speaking voice on a
 * phone speaker, about 4 KB per second of speech, so a 500-character reply
 * (~30 s) is ~120 KB, ~160 KB as base64. Needs no paid tier (192 kbps does).
 */
export const OUTPUT_FORMAT = 'mp3_22050_32';

export const MAX_VOICE_TEXT = 500;

export interface VoiceConfig {
  apiKey: string;
  voiceId: string;
  model: string;
  /** Override the API host. Only for tests against a mock server. */
  baseUrl: string;
}

export type VoiceErrorCode = 'voice_failed';

export class VoiceError extends Error {
  code: VoiceErrorCode = 'voice_failed';
}

/** Reads the config from an env-like getter. Null when the API key or voice id is missing. */
export function voiceConfig(get: (name: string) => string | undefined): VoiceConfig | null {
  const apiKey = get('ELEVENLABS_API_KEY')?.trim();
  const voiceId = get('ELEVENLABS_VOICE_ID')?.trim();
  if (!apiKey || !voiceId) return null;
  return {
    apiKey,
    voiceId,
    model: get('ELEVENLABS_MODEL')?.trim() || DEFAULT_VOICE_MODEL,
    baseUrl: (get('ELEVENLABS_BASE_URL')?.trim() || 'https://api.elevenlabs.io').replace(/\/+$/, ''),
  };
}

/** Returns the trimmed text, or a message describing what is wrong. */
export function parseVoiceRequest(raw: unknown): string | { text: string } {
  if (typeof raw !== 'object' || raw === null) return 'Body must be a JSON object';
  const text = (raw as Record<string, unknown>).text;
  if (typeof text !== 'string') return 'text must be a string';
  const t = text.trim();
  if (t.length < 1 || t.length > MAX_VOICE_TEXT) return `text must be 1 to ${MAX_VOICE_TEXT} characters`;
  return { text: t };
}

/** The upstream request, ready for fetch. */
export function buildTtsRequest(text: string, cfg: VoiceConfig): { url: string; init: RequestInit } {
  return {
    url: `${cfg.baseUrl}/v1/text-to-speech/${encodeURIComponent(cfg.voiceId)}?output_format=${OUTPUT_FORMAT}`,
    init: {
      method: 'POST',
      headers: { 'xi-api-key': cfg.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: cfg.model }),
    },
  };
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Calls ElevenLabs. Throws VoiceError on any failure; the message is for logs only, never for the client. */
export async function speak(text: string, cfg: VoiceConfig): Promise<{ audio: string; mime: 'audio/mpeg' }> {
  const { url, init } = buildTtsRequest(text, cfg);
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new VoiceError(`ElevenLabs unreachable: ${(e as Error).message}`);
  }
  if (!res.ok) {
    throw new VoiceError(`ElevenLabs returned ${res.status}: ${(await res.text().catch(() => '')).slice(0, 500)}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length === 0) throw new VoiceError('ElevenLabs returned an empty body');
  return { audio: toBase64(bytes), mime: 'audio/mpeg' };
}
