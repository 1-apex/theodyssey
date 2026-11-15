import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatDate, sortNewestFirst, stagesLabel, totals, voyageDate, voyageRoute, type Voyage } from './voyages';

const make = (over: Partial<Voyage>): Voyage => ({
  odyssey_id: 'o1',
  title: 'T',
  start_name: 'A',
  destination_name: 'B',
  status: 'voyage',
  visibility_mode: 'open',
  is_captain: false,
  joined_at: '2026-01-01T00:00:00Z',
  my_points: 0,
  stages_cleared: 0,
  stages_total: 3,
  crew_size: 2,
  completed_at: null,
  ...over,
});

test('totals sums points and counts voyages, completed and captained', () => {
  const t = totals([
    make({ my_points: 100, is_captain: true }),
    make({ my_points: 250, status: 'complete' }),
    make({ status: 'lobby', is_captain: true }),
  ]);
  assert.deepEqual(t, { points: 350, voyages: 3, completed: 1, captained: 2 });
});

test('totals of nothing is all zeros', () => {
  assert.deepEqual(totals([]), { points: 0, voyages: 0, completed: 0, captained: 0 });
});

test('stagesLabel', () => {
  assert.equal(stagesLabel(3, 7), '3 of 7 stages');
  assert.equal(stagesLabel(0, 1), '0 of 1 stage');
});

test('sortNewestFirst does not mutate and orders by joined_at', () => {
  const a = make({ odyssey_id: 'a', joined_at: '2026-01-01T00:00:00Z' });
  const b = make({ odyssey_id: 'b', joined_at: '2026-03-01T00:00:00Z' });
  const input = [a, b];
  assert.deepEqual(sortNewestFirst(input).map((v) => v.odyssey_id), ['b', 'a']);
  assert.equal(input[0], a);
});

test('voyageDate prefers completion', () => {
  assert.equal(voyageDate(make({ completed_at: '2026-02-02T00:00:00Z' })), '2026-02-02T00:00:00Z');
  assert.equal(voyageDate(make({})), '2026-01-01T00:00:00Z');
});

test('formatDate handles bad input', () => {
  assert.equal(formatDate('nope'), '');
  assert.match(formatDate('2026-06-15T12:00:00Z', 'en-US'), /Jun 15, 2026/);
});

test('voyageRoute picks the screen by status', () => {
  assert.equal(voyageRoute(make({ status: 'lobby' })).pathname, '/odyssey/[id]/lobby');
  assert.equal(voyageRoute(make({ status: 'voyage' })).pathname, '/odyssey/[id]/voyage');
  const done = voyageRoute(make({ status: 'complete', odyssey_id: 'zz' }));
  assert.equal(done.pathname, '/odyssey/[id]/ithaca');
  assert.deepEqual(done.params, { id: 'zz' });
});
