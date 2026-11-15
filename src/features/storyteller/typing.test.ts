import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_REVEAL_MS, revealDurationMs, visibleChars } from './typing';

test('short text types at about 38 characters a second', () => {
  assert.equal(revealDurationMs(0), 0);
  assert.equal(revealDurationMs(38), 1000);
  assert.ok(revealDurationMs(60) > 1400 && revealDurationMs(60) < 1700);
});

test('long text never takes more than 4 seconds', () => {
  assert.ok(revealDurationMs(150) <= MAX_REVEAL_MS);
  assert.equal(revealDurationMs(400), MAX_REVEAL_MS);
  assert.equal(revealDurationMs(5000), MAX_REVEAL_MS);
});

test('visibleChars grows from 0 to the full length and stays there', () => {
  assert.equal(visibleChars(100, 0), 0);
  const half = visibleChars(100, revealDurationMs(100) / 2);
  assert.ok(half >= 49 && half <= 51);
  assert.equal(visibleChars(100, revealDurationMs(100)), 100);
  assert.equal(visibleChars(100, 99999), 100);
  assert.equal(visibleChars(0, 10), 0);
});
