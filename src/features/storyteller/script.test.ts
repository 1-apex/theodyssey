import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyAnswer, EMPTY_TRIP, nextField, parseCrewSize } from './script';

test('nextField follows the order and skips what is known or asked', () => {
  assert.equal(nextField(EMPTY_TRIP, []), 'destination');
  assert.equal(nextField({ ...EMPTY_TRIP, destination: 'Goa' }, []), 'start');
  assert.equal(nextField({ ...EMPTY_TRIP, destination: 'Goa', start: 'Pune' }, []), 'crew_size');
  assert.equal(nextField({ ...EMPTY_TRIP, destination: 'Goa', start: 'Pune' }, ['crew_size']), 'duration');
  const all = { ...EMPTY_TRIP, destination: 'Goa', start: 'Pune' };
  assert.equal(nextField(all, ['crew_size', 'duration', 'travel_style']), null);
});

test('parseCrewSize reads digits, words and solo; clamps to 1..20', () => {
  assert.equal(parseCrewSize('4 of us'), 4);
  assert.equal(parseCrewSize('there will be three of us'), 3);
  assert.equal(parseCrewSize('just me'), 1);
  assert.equal(parseCrewSize('99 friends'), 20);
  assert.equal(parseCrewSize('0'), null);
  assert.equal(parseCrewSize('no idea'), null);
});

test('applyAnswer fills the field, tidies spaces and caps the length', () => {
  assert.equal(applyAnswer(EMPTY_TRIP, 'destination', '  Big   Bend ').destination, 'Big Bend');
  assert.equal(applyAnswer(EMPTY_TRIP, 'duration', 'x'.repeat(200)).duration?.length, 60);
  assert.equal(applyAnswer(EMPTY_TRIP, 'crew_size', 'six').crew_size, 6);
  assert.equal(applyAnswer({ ...EMPTY_TRIP, crew_size: 3 }, 'crew_size', 'dunno').crew_size, null);
});
