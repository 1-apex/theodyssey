import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loginDomain, normalizeUsername, USERNAME_PATTERN } from './username';

test('login domain: a hosted project uses its own hostname', () => {
  assert.equal(loginDomain('https://abcdefghijklmnopqrst.supabase.co'), 'abcdefghijklmnopqrst.supabase.co');
  assert.equal(loginDomain('https://ABC.Supabase.co/rest/v1'), 'abc.supabase.co');
});

test('login domain: a local stack or a missing URL falls back to the placeholder', () => {
  assert.equal(loginDomain('http://127.0.0.1:54321'), 'players.odyssey.invalid');
  assert.equal(loginDomain('http://localhost:54321'), 'players.odyssey.invalid');
  assert.equal(loginDomain(''), 'players.odyssey.invalid');
});

test('usernames are trimmed and lowercased before they are checked', () => {
  assert.equal(normalizeUsername('  OdySSeus_7 '), 'odysseus_7');
  assert.ok(USERNAME_PATTERN.test(normalizeUsername('Odysseus_7')));
});

test('usernames reject spaces, symbols and the wrong length', () => {
  for (const bad of ['ab', 'has space', 'émile', 'semi;colon', 'a'.repeat(21)]) {
    assert.ok(!USERNAME_PATTERN.test(normalizeUsername(bad)), bad);
  }
});
