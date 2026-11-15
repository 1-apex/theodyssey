import assert from 'node:assert/strict';
import { test } from 'node:test';

import { capReply, MAX_REPLY_CHARS, parseChatResponse, readTrip } from './chatResponse';
import { EMPTY_TRIP } from './script';

const ok = { reply: 'Hail, traveler.', trip: { ...EMPTY_TRIP, destination: 'Goa', travel_mode: 'road' }, ready: false, on_topic: true };

test('a well formed response passes through', () => {
  assert.deepEqual(parseChatResponse(ok), ok);
});

test('extra fields are dropped', () => {
  const r = parseChatResponse({ ...ok, secret: 1, trip: { ...ok.trip, mood: 'happy' } });
  assert.deepEqual(r, ok);
});

test('a missing, empty or non-string reply is malformed', () => {
  for (const reply of [undefined, null, 7, ['hi'], { a: 1 }, '', '   ']) {
    assert.equal(parseChatResponse({ ...ok, reply }), null, String(reply));
  }
});

test('a body that is not an object, or has no trip object, is malformed', () => {
  for (const body of [null, undefined, 'text', 42, [], { reply: 'hi' }, { reply: 'hi', trip: 'Goa' }, { reply: 'hi', trip: null }]) {
    assert.equal(parseChatResponse(body), null);
  }
});

test('ready is only true when it is exactly true; on_topic defaults to true', () => {
  assert.equal(parseChatResponse({ ...ok, ready: 'yes' })?.ready, false);
  assert.equal(parseChatResponse({ ...ok, ready: true })?.ready, true);
  assert.equal(parseChatResponse({ ...ok, on_topic: undefined })?.on_topic, true);
  assert.equal(parseChatResponse({ ...ok, on_topic: false })?.on_topic, false);
});

test('a trip with wrong types reads those fields as unknown', () => {
  const trip = readTrip({ start: 5, destination: ' Goa  City ', travel_mode: 'teleport', crew_size: 2.5, duration: null, travel_style: {}, visibility_mode: 'dark' });
  assert.deepEqual(trip, { ...EMPTY_TRIP, destination: 'Goa City' });
  assert.equal(readTrip({ crew_size: 0 })?.crew_size, null);
  assert.equal(readTrip({ crew_size: 21 })?.crew_size, null);
  assert.equal(readTrip({ crew_size: 20 })?.crew_size, 20);
});

test('a 2,000 character reply is capped, at a word if there is one', () => {
  const long = 'wind '.repeat(400);
  const r = parseChatResponse({ ...ok, reply: long });
  assert.ok(r !== null && r.reply.length <= MAX_REPLY_CHARS + 1);
  assert.ok(r?.reply.endsWith('wind…'));
  assert.equal(capReply('short'), 'short');
  const solid = 'a'.repeat(2000);
  assert.equal(capReply(solid).length, MAX_REPLY_CHARS + 1);
});
