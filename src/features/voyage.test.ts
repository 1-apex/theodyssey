/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { haversineM, isWithinStage, offsetLatLng } from '../lib/geo';
import { mockMembers, mockOdyssey, mockStages, mockStart } from '../lib/mock';
import { checkArrival, currentTarget, distanceToTargetM } from './location/geofence';
import { createSimulateSource } from './location/source';
import { startArrivalWatcher } from './location/watcher';
import type { ClearStageResult } from './odyssey/backend';
import { createMockBackend } from './odyssey/mockBackend';
import { memberTotal, totalsByMember } from './points/totals';

const ID = 'mock-odyssey';
const ME = mockMembers[0].id;
const stageAt = (i: number) => mockStages[i];
/** Let pending promise chains settle. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await new Promise<void>((r) => setImmediate(r));
};

test('haversine: Mumbai to Pune is about 120 km', () => {
  const d = haversineM(mockStart, stageAt(1));
  assert.ok(d > 110_000 && d < 130_000, `got ${d}`);
});

test('isWithinStage respects the radius', () => {
  const s = stageAt(0);
  assert.equal(isWithinStage(s, s), true);
  // 0.01 degrees of latitude is about 1.1 km, outside a 500 m radius.
  assert.equal(isWithinStage({ lat: s.lat + 0.01, lng: s.lng }, s), false);
  assert.equal(isWithinStage({ lat: s.lat + 0.004, lng: s.lng }, s), true);
});

test('geofence: target is the lowest uncleared stage', () => {
  const stages = mockStages.map((s) => ({ ...s }));
  assert.equal(currentTarget(stages)?.order, 1);
  stages[0].cleared_at = 'now';
  assert.equal(currentTarget(stages)?.order, 2);
  assert.equal(checkArrival(stages[0], stages), null, 'standing at a cleared stage is not an arrival');
  assert.equal(checkArrival(stages[1], stages)?.order, 2);
  assert.equal(distanceToTargetM(stages[1], stages), 0);
  assert.equal(currentTarget(stages.map((s) => ({ ...s, cleared_at: 'now' }))), null);
});

test('fog mode shows only cleared stages and the current target', async () => {
  const backend = createMockBackend();
  assert.deepEqual((await backend.getVisibleStages(ID)).map((s) => s.order), [1]);
  await backend.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: ME, position: stageAt(0) });
  assert.deepEqual((await backend.getVisibleStages(ID)).map((s) => s.order), [1, 2]);
});

test('open mode shows the full route', async () => {
  const backend = createMockBackend({ odyssey: { ...(await createMockBackend().getOdyssey(ID)), visibility_mode: 'open' } });
  assert.equal((await backend.getVisibleStages(ID)).length, 6);
});

test('clearStage validates distance, order, and is idempotent', async () => {
  const backend = createMockBackend();
  const base = { odysseyId: ID, memberId: ME };

  assert.deepEqual(await backend.clearStage({ ...base, stageId: stageAt(0).id, position: mockStart }), {
    status: 'rejected',
    reason: 'too_far',
  });
  assert.deepEqual(await backend.clearStage({ ...base, stageId: stageAt(2).id, position: stageAt(2) }), {
    status: 'rejected',
    reason: 'not_current_target',
  });
  assert.deepEqual(await backend.clearStage({ ...base, stageId: 'nope', position: mockStart }), {
    status: 'rejected',
    reason: 'not_found',
  });

  const first = await backend.clearStage({ ...base, stageId: stageAt(0).id, position: stageAt(0) });
  assert.equal(first.status, 'cleared');
  const again = await backend.clearStage({ ...base, stageId: stageAt(0).id, position: stageAt(0) });
  assert.equal(again.status, 'already_cleared');

  // Points awarded once, to every crew member.
  const ledger = await backend.getLedger(ID);
  assert.equal(ledger.length, mockMembers.length);
  assert.equal(memberTotal(ledger, ME), 100);
});

test('manual "We have arrived" skips the distance check', async () => {
  const backend = createMockBackend();
  const result = await backend.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: ME, position: null, manual: true });
  assert.equal(result.status, 'cleared');
});

test('simulate source glides to the target in steps', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const source = createSimulateSource({ start: mockStart, stepMs: 100, steps: 4 });
  const seen: number[] = [];
  source.subscribe((p) => seen.push(p.lat));
  const done = source.sailTo(stageAt(0));
  t.mock.timers.tick(200);
  assert.equal(seen.length, 3, 'initial position plus two steps');
  assert.ok(seen[2] < mockStart.lat && seen[2] > stageAt(0).lat, 'halfway there');
  t.mock.timers.tick(200);
  await done;
  assert.deepEqual(source.getLast(), { lat: stageAt(0).lat, lng: stageAt(0).lng });
  t.mock.timers.tick(1000);
  assert.equal(seen.length, 5, 'no updates after arrival');
});

test('full voyage: simulate through all 6 stages to Ithaca', async () => {
  const backend = createMockBackend();
  const source = createSimulateSource({ start: mockStart });
  const results: ClearStageResult[] = [];
  let changes = 0;
  backend.subscribe(ID, () => (changes += 1));
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME, onResult: (r) => results.push(r) });
  await flush();
  assert.equal(results.length, 0, 'nothing clears at the start point');

  for (const s of mockStages) {
    source.jumpTo(s);
    await flush();
  }
  stop();

  assert.deepEqual(results.map((r) => r.status), Array(6).fill('cleared'));
  assert.equal(changes, 6);
  assert.equal((await backend.getOdyssey(ID)).status, 'complete');
  assert.equal((await backend.getVisibleStages(ID)).length, 6, 'full route revealed at the end');
  const totals = totalsByMember(await backend.getLedger(ID));
  // Five stages at 100 plus Ithaca at 300.
  for (const m of mockMembers) assert.equal(totals[m.id], 800);
});

test('watcher: a stage cleared by another crew member moves the target on', async () => {
  const backend = createMockBackend();
  const source = createSimulateSource({ start: mockStart });
  const results: ClearStageResult[] = [];
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME, onResult: (r) => results.push(r) });
  await flush();

  // A crewmate clears stage 1 while we are still at the start.
  await backend.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: mockMembers[1].id, position: stageAt(0) });
  await flush();
  source.jumpTo(stageAt(1));
  await flush();
  stop();

  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'cleared');
  assert.equal((await backend.getOdyssey(ID)).current_stage_order, 3);
});

test('watcher: skipping ahead does not clear a later stage', async () => {
  const backend = createMockBackend();
  const source = createSimulateSource({ start: mockStart });
  const results: ClearStageResult[] = [];
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME, onResult: (r) => results.push(r) });
  await flush();
  source.jumpTo(stageAt(3));
  await flush();
  stop();
  assert.equal(results.length, 0);
  assert.equal((await backend.getOdyssey(ID)).current_stage_order, 1);
});

test('offsetLatLng: 100 m north and east measure as 100 m', () => {
  const p = { lat: 19.076, lng: 72.8777 };
  assert.ok(Math.abs(haversineM(p, offsetLatLng(p, 100, 0)) - 100) < 1);
  assert.ok(Math.abs(haversineM(p, offsetLatLng(p, 0, 100)) - 100) < 1);
  assert.ok(Math.abs(haversineM(p, offsetLatLng(p, -100, -100)) - 141.42) < 1.5);
});

const arriverBackend = () =>
  createMockBackend({ odyssey: { ...mockOdyssey, points_mode: 'arriver' } });

test('crew mode (default) gives every member the points', async () => {
  const backend = createMockBackend();
  assert.equal((await backend.getOdyssey(ID)).points_mode, 'crew');
  await backend.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: mockMembers[1].id, position: stageAt(0) });
  const totals = totalsByMember(await backend.getLedger(ID));
  for (const m of mockMembers) assert.equal(totals[m.id], 100);
});

test('arriver mode: only the arriving member earns the points', async () => {
  const backend = arriverBackend();
  const result = await backend.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: mockMembers[1].id, position: stageAt(0) });
  assert.equal(result.status, 'cleared');
  const ledger = await backend.getLedger(ID);
  assert.equal(ledger.length, 1);
  assert.equal(memberTotal(ledger, mockMembers[1].id), 100);
  assert.equal(memberTotal(ledger, mockMembers[0].id), 0);
  assert.equal(memberTotal(ledger, mockMembers[2].id), 0);
});

test('arriver mode: full voyage with two arrivers ends with per-member totals', async () => {
  const backend = arriverBackend();
  // Stages 1-3 by member 0, stages 4-6 by member 1 (Ithaca is 300).
  for (const [i, s] of mockStages.entries()) {
    const memberId = mockMembers[i < 3 ? 0 : 1].id;
    const r = await backend.clearStage({ odysseyId: ID, stageId: s.id, memberId, position: s });
    assert.equal(r.status, 'cleared');
  }
  assert.equal((await backend.getOdyssey(ID)).status, 'complete');
  const ledger = await backend.getLedger(ID);
  assert.equal(ledger.length, 6);
  assert.equal(memberTotal(ledger, mockMembers[0].id), 300);
  assert.equal(memberTotal(ledger, mockMembers[1].id), 500);
  assert.equal(memberTotal(ledger, mockMembers[2].id), 0);
});

test('arriver mode is idempotent', async () => {
  const backend = arriverBackend();
  const input = { odysseyId: ID, stageId: stageAt(0).id, memberId: ME, position: stageAt(0) };
  assert.equal((await backend.clearStage(input)).status, 'cleared');
  assert.equal((await backend.clearStage(input)).status, 'already_cleared');
  assert.equal((await backend.clearStage({ ...input, memberId: mockMembers[1].id })).status, 'already_cleared');
  assert.equal((await backend.getLedger(ID)).length, 1);
});

test('arriver mode: an unknown member is rejected as not_member and the stage stays uncleared', async () => {
  const backend = arriverBackend();
  const result = await backend.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: 'ghost', position: stageAt(0) });
  assert.deepEqual(result, { status: 'rejected', reason: 'not_member' });
  assert.equal((await backend.getLedger(ID)).length, 0);
  assert.equal((await backend.getOdyssey(ID)).current_stage_order, 1);
});
