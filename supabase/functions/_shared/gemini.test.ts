import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAT_MODEL, modelFor, parseLenient, PLANNER_MODEL, retryKeys } from './gemini.ts';

test('default models: lite for chat, gemma for the planner', () => {
  assert.equal(CHAT_MODEL, 'gemini-3.1-flash-lite');
  assert.equal(PLANNER_MODEL, 'gemma-4-31b-it');
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

test('retryKeys: each job falls back to the other model, always a different one', () => {
  assert.equal(retryKeys({ model: CHAT_MODEL }, 'chat').model, PLANNER_MODEL);
  assert.equal(retryKeys({}, 'chat').model, PLANNER_MODEL);
  assert.equal(retryKeys({ model: PLANNER_MODEL }, 'planner').model, CHAT_MODEL);
  assert.equal(retryKeys({}, 'planner').model, CHAT_MODEL);
  assert.equal(retryKeys({ model: CHAT_MODEL }, 'planner').model, PLANNER_MODEL);
  assert.equal(retryKeys({ model: PLANNER_MODEL }, 'chat').model, CHAT_MODEL);
  assert.equal(retryKeys({ model: 'custom' }, 'chat').model, PLANNER_MODEL);
  assert.equal(retryKeys({ model: 'custom' }, 'planner').model, CHAT_MODEL);
  assert.equal(retryKeys({ model: 'm', llmApiKey: 'k' } as { model: string; llmApiKey: string }, 'chat').llmApiKey, 'k');
});

test('parseLenient accepts fences and chatter around the JSON', () => {
  assert.deepEqual(parseLenient('{"a":1}'), { a: 1 });
  assert.deepEqual(parseLenient('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseLenient('Sure! {"a":{"b":2}} Hope that helps'), { a: { b: 2 } });
  assert.throws(() => parseLenient('no json here'));
});
