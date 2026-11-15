import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKUP_MODEL, CHAT_MODEL, generationConfig, modelFor, parseLenient, PLANNER_MODEL, retryKeys } from './gemini.ts';

test('default models: one fast flash-lite for both jobs, a different one for the retry', () => {
  assert.equal(CHAT_MODEL, 'gemini-3.1-flash-lite');
  assert.equal(PLANNER_MODEL, 'gemini-3.1-flash-lite');
  assert.equal(BACKUP_MODEL, 'gemini-3.5-flash-lite');
  assert.equal(modelFor('chat', () => undefined), CHAT_MODEL);
  assert.equal(modelFor('planner', () => undefined), PLANNER_MODEL);
});

test('modelFor: specific override beats LLM_MODEL, which beats the default', () => {
  const env = (o: Record<string, string>) => (n: string) => o[n];
  assert.equal(modelFor('chat', env({ LLM_MODEL: 'x' })), 'x');
  assert.equal(modelFor('planner', env({ LLM_MODEL: 'x' })), 'x');
  assert.equal(modelFor('chat', env({ LLM_MODEL: 'x', LLM_CHAT_MODEL: 'c' })), 'c');
  assert.equal(modelFor('planner', env({ LLM_MODEL: 'x', LLM_CHAT_MODEL: 'c' })), 'x');
  assert.equal(modelFor('planner', env({ LLM_PLANNER_MODEL: ' p ' })), 'p');
  assert.equal(modelFor('chat', env({ LLM_MODEL: '  ' })), CHAT_MODEL);
});

test('retryKeys: the retry is always a different model', () => {
  for (const job of ['chat', 'planner'] as const) {
    assert.equal(retryKeys({ model: CHAT_MODEL }, job).model, BACKUP_MODEL);
    assert.equal(retryKeys({}, job).model, BACKUP_MODEL);
    assert.equal(retryKeys({ model: BACKUP_MODEL }, job).model, job === 'chat' ? CHAT_MODEL : PLANNER_MODEL);
    assert.equal(retryKeys({ model: 'gemma-4-31b-it' }, job).model, BACKUP_MODEL);
  }
  assert.equal(retryKeys({ model: 'm', llmApiKey: 'k' } as { model: string; llmApiKey: string }, 'chat').llmApiKey, 'k');
});

test('generationConfig: thinking and token cap for Gemini, nothing for Gemma or when unset', () => {
  assert.deepEqual(generationConfig('gemini-3.1-flash-lite', { thinkingLevel: 'low', maxOutputTokens: 900 }), {
    thinking_level: 'low',
    max_output_tokens: 900,
  });
  assert.deepEqual(generationConfig('gemini-3.1-flash-lite', { maxOutputTokens: 900 }), { max_output_tokens: 900 });
  assert.equal(generationConfig('gemini-3.1-flash-lite', {}), undefined);
  assert.equal(generationConfig('gemma-4-31b-it', { thinkingLevel: 'low', maxOutputTokens: 900 }), undefined);
});

test('parseLenient accepts fences and chatter around the JSON', () => {
  assert.deepEqual(parseLenient('{"a":1}'), { a: 1 });
  assert.deepEqual(parseLenient('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseLenient('Sure! {"a":{"b":2}} Hope that helps'), { a: { b: 2 } });
  assert.throws(() => parseLenient('no json here'));
});
