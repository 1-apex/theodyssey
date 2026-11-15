/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mockMembers, mockOdyssey, mockStages } from '../lib/mock';
import { clearStageManually } from './location/manualArrival';
import { createSimulateSource } from './location/source';
import type { OdysseyBackend } from './odyssey/backend';
import { createMockBackend } from './odyssey/mockBackend';
import { loadVisibleStages, watchBackendValue } from './odyssey/watchBackendValue';

const ID = mockOdyssey.id;
const ME = mockMembers[0].id;
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await new Promise<void>((r) => setImmediate(r));
};

test('watchBackendValue loads, reloads on change, and stops delivering after stop', async () => {
  const backend = createMockBackend();
  const seen: number[] = [];
  const stop = watchBackendValue(backend, ID, async (b, id) => (await b.getLedger(id)).length, (n) => seen.push(n));
  await flush();
  assert.deepEqual(seen, [0]);
  await backend.clearStage({ odysseyId: ID, stageId: mockStages[0].id, memberId: ME, position: null, manual: true });
  await flush();
  assert.equal(seen[seen.length - 1], mockMembers.length);
  stop();
  const count = seen.length;
  await backend.clearStage({ odysseyId: ID, stageId: mockStages[1].id, memberId: ME, position: null, manual: true });
  await flush();
  assert.equal(seen.length, count);
});

test('watchBackendValue drops a late result after stop and an older load that resolves last', async () => {
  const backend = createMockBackend();
  const resolvers: ((n: number) => void)[] = [];
  const load = (): Promise<number> => new Promise((r) => resolvers.push(r));
  const seen: number[] = [];
  const stop = watchBackendValue(backend, ID, load, (n) => seen.push(n));
  await backend.clearStage({ odysseyId: ID, stageId: mockStages[0].id, memberId: ME, position: null, manual: true });
  assert.equal(resolvers.length, 2);
  resolvers[1](2);
  await flush();
  resolvers[0](1); // older load finishing last must not overwrite
  await flush();
  assert.deepEqual(seen, [2]);
  stop();
  assert.deepEqual(seen, [2]);

  // A load still in flight when the watcher stops must not deliver.
  const late: ((n: number) => void)[] = [];
  const seenLate: number[] = [];
  const stop2 = watchBackendValue(backend, ID, () => new Promise<number>((r) => late.push(r)), (n) => seenLate.push(n));
  stop2();
  late[0](5);
  await flush();
  assert.deepEqual(seenLate, []);
});

test('watchBackendValue unsubscribes from the backend on stop', async () => {
  let listeners = 0;
  const backend = {
    ...createMockBackend(),
    subscribe: () => {
      listeners += 1;
      return () => {
        listeners -= 1;
      };
    },
  } satisfies OdysseyBackend;
  const stop = watchBackendValue(backend, ID, async () => 1, () => {});
  assert.equal(listeners, 1);
  stop();
  assert.equal(listeners, 0);
});

test('loadVisibleStages sorts by order and goes through getVisibleStages', async () => {
  // Open mode shows all stages; the seed is out of order and the wrapper reverses what the backend returns.
  const base = createMockBackend({
    odyssey: { ...mockOdyssey, visibility_mode: 'open' },
    stages: [...mockStages].reverse(),
  });
  let calls = 0;
  const backend: OdysseyBackend = {
    ...base,
    getVisibleStages: async (id) => {
      calls += 1;
      return [...(await base.getVisibleStages(id))].reverse();
    },
  };
  const stages = await loadVisibleStages(backend, ID);
  assert.equal(calls, 1);
  assert.equal(stages.length, mockStages.length);
  assert.deepEqual(stages.map((s) => s.order), mockStages.map((s) => s.order).sort((x, y) => x - y));
});

test('clearStageManually: double tap on the same stage clears once, then already_cleared', async () => {
  const backend = createMockBackend();
  const source = createSimulateSource({ start: { lat: 0, lng: 0 } });
  const first = await clearStageManually(backend, source, ID, ME, mockStages[0].id);
  const second = await clearStageManually(backend, source, ID, ME, mockStages[0].id);
  assert.equal(first.status, 'cleared');
  assert.equal(second.status, 'already_cleared');
  assert.equal((await backend.getOdyssey(ID)).current_stage_order, mockOdyssey.current_stage_order + 1);
  // A stale id for a later stage is rejected, not cleared.
  const stale = await clearStageManually(backend, source, ID, ME, mockStages[3].id);
  assert.equal(stale.status, 'rejected');
});
