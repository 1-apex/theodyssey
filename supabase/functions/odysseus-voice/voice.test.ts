import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import {
  buildTtsRequest, DEFAULT_VOICE_MODEL, MAX_VOICE_TEXT, OUTPUT_FORMAT, parseVoiceRequest, speak, toBase64, VoiceError, voiceConfig,
} from './voice.ts';

const env = (o: Record<string, string>) => (n: string) => o[n];

test('parseVoiceRequest: trims and enforces 1 to 500 characters', () => {
  assert.deepEqual(parseVoiceRequest({ text: '  Hail, traveler.  ' }), { text: 'Hail, traveler.' });
  assert.deepEqual(parseVoiceRequest({ text: 'a'.repeat(MAX_VOICE_TEXT) }), { text: 'a'.repeat(MAX_VOICE_TEXT) });
  for (const bad of [null, 'x', {}, { text: 5 }, { text: '   ' }, { text: '' }, { text: 'a'.repeat(MAX_VOICE_TEXT + 1) }, { text: ['a'] }]) {
    assert.equal(typeof parseVoiceRequest(bad), 'string', JSON.stringify(bad));
  }
});

test('voiceConfig: null unless key and voice id are both set; defaults and overrides', () => {
  assert.equal(voiceConfig(env({})), null);
  assert.equal(voiceConfig(env({ ELEVENLABS_API_KEY: 'k' })), null);
  assert.equal(voiceConfig(env({ ELEVENLABS_VOICE_ID: 'v' })), null);
  assert.equal(voiceConfig(env({ ELEVENLABS_API_KEY: ' ', ELEVENLABS_VOICE_ID: 'v' })), null);
  const c = voiceConfig(env({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' }));
  assert.deepEqual(c, { apiKey: 'k', voiceId: 'v', model: DEFAULT_VOICE_MODEL, baseUrl: 'https://api.elevenlabs.io' });
  const o = voiceConfig(env({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v', ELEVENLABS_MODEL: 'm', ELEVENLABS_BASE_URL: 'http://h:1/' }));
  assert.equal(o?.model, 'm');
  assert.equal(o?.baseUrl, 'http://h:1');
});

test('buildTtsRequest: endpoint, header, body and compact mp3 format per the ElevenLabs docs', () => {
  const { url, init } = buildTtsRequest('Hail', { apiKey: 'k', voiceId: 'abc/123', model: 'eleven_flash_v2_5', baseUrl: 'https://api.elevenlabs.io' });
  assert.equal(url, `https://api.elevenlabs.io/v1/text-to-speech/abc%2F123?output_format=${OUTPUT_FORMAT}`);
  assert.equal(OUTPUT_FORMAT, 'mp3_22050_32');
  assert.equal(init.method, 'POST');
  assert.equal((init.headers as Record<string, string>)['xi-api-key'], 'k');
  assert.deepEqual(JSON.parse(init.body as string), { text: 'Hail', model_id: 'eleven_flash_v2_5' });
});

test('toBase64 round-trips bytes, including large buffers', () => {
  const bytes = Uint8Array.from({ length: 100000 }, (_, i) => i % 256);
  assert.deepEqual(new Uint8Array(Buffer.from(toBase64(bytes), 'base64')), bytes);
});

async function upstream(handler: (req: { url: string; key: string | undefined; body: string }) => [number, Buffer | string]) {
  const seen: { url: string; key: string | undefined; body: string }[] = [];
  const server = createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      const r = { url: req.url ?? '', key: req.headers['xi-api-key'] as string | undefined, body: b };
      seen.push(r);
      const [status, out] = handler(r);
      res.statusCode = status;
      res.end(out);
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  return { seen, baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, close: () => server.close() };
}

test('speak: returns base64 mp3 from the upstream', async () => {
  const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, 1, 2, 3]);
  const u = await upstream(() => [200, mp3]);
  try {
    const r = await speak('Hail', { apiKey: 'k', voiceId: 'v1', model: 'm', baseUrl: u.baseUrl });
    assert.deepEqual(r, { audio: mp3.toString('base64'), mime: 'audio/mpeg' });
    assert.equal(u.seen[0].key, 'k');
    assert.match(u.seen[0].url, /^\/v1\/text-to-speech\/v1\?output_format=mp3_22050_32$/);
  } finally { u.close(); }
});

test('speak: upstream failures (4xx, 5xx, empty body, unreachable) become VoiceError voice_failed', async () => {
  for (const [status, body] of [[401, 'bad key'], [429, 'slow down'], [500, 'oops'], [200, '']] as const) {
    const u = await upstream(() => [status, body]);
    try {
      await assert.rejects(
        speak('x', { apiKey: 'k', voiceId: 'v', model: 'm', baseUrl: u.baseUrl }),
        (e: unknown) => e instanceof VoiceError && e.code === 'voice_failed',
      );
    } finally { u.close(); }
  }
  await assert.rejects(
    speak('x', { apiKey: 'k', voiceId: 'v', model: 'm', baseUrl: 'http://127.0.0.1:1' }),
    (e: unknown) => e instanceof VoiceError,
  );
});

test('speak: the upstream error text is in the VoiceError message (for logs) only', async () => {
  const u = await upstream(() => [401, 'invalid_api_key secret-detail']);
  try {
    await assert.rejects(
      speak('x', { apiKey: 'k', voiceId: 'v', model: 'm', baseUrl: u.baseUrl }),
      (e: unknown) => e instanceof VoiceError && e.message.includes('secret-detail'),
    );
  } finally { u.close(); }
});
