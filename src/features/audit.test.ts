/// <reference types="node" />
// Whole-codebase audit tests: edge cases and defects found in the audit, now fixed.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { haversineM, isWithinStage, offsetLatLng } from '../lib/geo';
import { mockMembers, mockOdyssey, mockStages, mockStart } from '../lib/mock';
import type { LatLng, LedgerEntry, Stage } from '../lib/types';
import { checkArrival, currentTarget, distanceToTargetM } from './location/geofence';
import { createSimulateSource } from './location/source';
import { startArrivalWatcher } from './location/watcher';
import type { ClearStageResult, OdysseyBackend } from './odyssey/backend';
import { createMockBackend } from './odyssey/mockBackend';
import { memberTotal, totalsByMember } from './points/totals';

const ID = mockOdyssey.id;
const ME = mockMembers[0].id;
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await new Promise<void>((r) => setImmediate(r));
};
const stageAt = (i: number): Stage => mockStages[i];

/** Two stages 100 m apart, radius 500 m: standing at one is inside both radii. */
const closeStages = (): Stage[] =>
  [0, 1].map((i) => {
    const at = offsetLatLng(mockStart, 100 * i, 0);
    return { ...mockStages[i], lat: at.lat, lng: at.lng, radius_m: 500 };
  });

// ---------- watcher ----------

test('watcher: a stage whose radius already contains the position clears right after the previous one, with no further fix', async () => {
  const backend = createMockBackend({ stages: closeStages() });
  const source = createSimulateSource({ start: mockStart });
  const results: string[] = [];
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME, onResult: (r) => results.push(r.status) });
  await flush();
  // Source replays one position at subscribe, then goes silent (stationary phone).
  assert.deepEqual(results, ['cleared', 'cleared']);
  stop();
});

test('watcher: a position that arrives while a clear is in flight is not lost (simulate jumpTo during in-flight clear)', async () => {
  const base = createMockBackend({ stages: closeStages() });
  let release: (() => void) | null = null;
  const gate = new Promise<void>((r) => (release = r));
  const backend: OdysseyBackend = {
    ...base,
    clearStage: async (i) => {
      await gate;
      return base.clearStage(i);
    },
  };
  const source = createSimulateSource({ start: { lat: 0, lng: 0 } });
  const results: string[] = [];
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME, onResult: (r) => results.push(r.status) });
  await flush();
  source.jumpTo(closeStages()[0]); // starts clear of stage 1 (blocked on gate)
  await flush();
  source.jumpTo(closeStages()[1]); // arrives while busy, dropped
  await flush();
  (release as unknown as () => void)();
  await flush();
  assert.deepEqual(results, ['cleared', 'cleared']);
  stop();
});

test('watcher: a rejected clearStage does not leave the watcher busy; the next position retries and clears', async () => {
  const base = createMockBackend();
  let fail = true;
  const backend: OdysseyBackend = {
    ...base,
    clearStage: async (i) => {
      if (fail) throw new Error('network');
      return base.clearStage(i);
    },
  };
  const source = createSimulateSource({ start: { lat: 0, lng: 0 } });
  const results: string[] = [];
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown): void => void unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME, onResult: (r) => results.push(r.status) });
  await flush();
  source.jumpTo(stageAt(0));
  await flush();
  fail = false;
  source.jumpTo(stageAt(0));
  await flush();
  stop();
  process.off('unhandledRejection', onUnhandled);
  assert.deepEqual(results, ['cleared']);
});

test('watcher: a rejecting clearStage must not surface as an unhandled promise rejection', async () => {
  const base = createMockBackend();
  const backend: OdysseyBackend = { ...base, clearStage: async () => Promise.reject(new Error('network')) };
  const source = createSimulateSource({ start: { lat: 0, lng: 0 } });
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown): void => void unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME });
  await flush();
  source.jumpTo(stageAt(0));
  await flush();
  stop();
  process.off('unhandledRejection', onUnhandled);
  assert.equal(unhandled.length, 0, `unhandled rejections: ${unhandled.length}`);
});

test('watcher: if the first getVisibleStages fails the watcher recovers on later positions', async () => {
  const base = createMockBackend();
  let fail = true;
  const backend: OdysseyBackend = {
    ...base,
    getVisibleStages: async (id) => {
      if (fail) throw new Error('offline');
      return base.getVisibleStages(id);
    },
  };
  const source = createSimulateSource({ start: { lat: 0, lng: 0 } });
  const results: string[] = [];
  const onUnhandled = (): void => {};
  process.on('unhandledRejection', onUnhandled); // keep the run alive; the unhandled rejection is the same defect
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME, onResult: (r) => results.push(r.status) });
  await flush();
  fail = false; // network is back
  source.jumpTo(stageAt(0));
  await flush();
  stop();
  process.off('unhandledRejection', onUnhandled);
  assert.deepEqual(results, ['cleared']);
});

test('watcher: onResult still fires for a successful clear when the follow-up getVisibleStages fails', async () => {
  const base = createMockBackend();
  let calls = 0;
  const backend: OdysseyBackend = {
    ...base,
    getVisibleStages: async (id) => {
      calls += 1;
      if (calls >= 2) throw new Error('offline'); // call 1 is the initial load
      return base.getVisibleStages(id);
    },
  };
  const source = createSimulateSource({ start: { lat: 0, lng: 0 } });
  const results: string[] = [];
  const onUnhandled = (): void => {};
  process.on('unhandledRejection', onUnhandled);
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME, onResult: (r) => results.push(r.status) });
  await flush();
  source.jumpTo(stageAt(0));
  await flush();
  stop();
  process.off('unhandledRejection', onUnhandled);
  assert.equal((await base.getOdyssey(ID)).current_stage_order, 2, 'the stage really cleared on the backend');
  assert.deepEqual(results, ['cleared']);
});

test('watcher: a persistent too_far rejection is not retried on every single position', async () => {
  const base = createMockBackend();
  let calls = 0;
  const backend: OdysseyBackend = {
    ...base,
    clearStage: async () => {
      calls += 1;
      return { status: 'rejected', reason: 'too_far' } as ClearStageResult;
    },
  };
  const source = createSimulateSource({ start: { lat: 0, lng: 0 } });
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME });
  await flush();
  for (let i = 0; i < 10; i += 1) {
    source.jumpTo(offsetLatLng(stageAt(0), i, 0)); // ten fixes, all inside the radius
    await flush();
  }
  stop();
  assert.ok(calls < 10, `clearStage called ${calls} times for 10 fixes`);
});

test('watcher: stop() during an in-flight clear suppresses onResult and makes no further backend calls', async () => {
  const base = createMockBackend();
  let release: (() => void) | null = null;
  const gate = new Promise<void>((r) => (release = r));
  let clears = 0;
  let reads = 0;
  const backend: OdysseyBackend = {
    ...base,
    getVisibleStages: async (id) => {
      reads += 1;
      return base.getVisibleStages(id);
    },
    clearStage: async (i) => {
      clears += 1;
      await gate;
      return base.clearStage(i);
    },
  };
  const source = createSimulateSource({ start: { lat: 0, lng: 0 } });
  const results: string[] = [];
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME, onResult: (r) => results.push(r.status) });
  await flush();
  source.jumpTo(stageAt(0));
  await flush();
  stop();
  (release as unknown as () => void)();
  await flush();
  source.jumpTo(stageAt(0));
  await flush();
  assert.equal(clears, 1, 'no new clear after stop');
  assert.deepEqual(results, []);
  assert.ok(reads <= 2, `at most the initial read and the post-clear refresh, got ${reads}`);
});

test('watcher: stop() before the first target load finishes never subscribes to the source', async () => {
  let subscribed = 0;
  const source = { subscribe: () => { subscribed += 1; return () => {}; }, getLast: () => null };
  const stop = startArrivalWatcher({ source, backend: createMockBackend(), odysseyId: ID, memberId: ME });
  stop();
  await flush();
  assert.equal(subscribed, 0);
});

test('watcher: a backend change while a clear is in flight still ends with the right target', async () => {
  const base = createMockBackend();
  let release: (() => void) | null = null;
  const gate = new Promise<void>((r) => (release = r));
  const backend: OdysseyBackend = {
    ...base,
    clearStage: async (i) => {
      await gate;
      return base.clearStage(i);
    },
  };
  const source = createSimulateSource({ start: { lat: 0, lng: 0 } });
  const results: string[] = [];
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME, onResult: (r) => results.push(r.status) });
  await flush();
  source.jumpTo(stageAt(0)); // clear of stage 1 in flight
  await flush();
  // A crewmate clears stage 1 first through the unwrapped backend.
  await base.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: mockMembers[1].id, position: stageAt(0) });
  (release as unknown as () => void)();
  await flush();
  source.jumpTo(stageAt(1));
  await flush();
  stop();
  assert.deepEqual(results, ['already_cleared', 'cleared']);
});

// ---------- geo / geofence ----------

test('haversine is correct across the antimeridian and for identical points', () => {
  const a = { lat: 0, lng: 179.999 };
  const b = { lat: 0, lng: -179.999 };
  assert.ok(Math.abs(haversineM(a, b) - 222.4) < 1, `got ${haversineM(a, b)}`);
  assert.equal(haversineM(a, a), 0);
  assert.equal(isWithinStage(a, { ...b, radius_m: 300 }), true);
});

test('isWithinStage: NaN or infinite inputs never count as inside; radius 0 only matches the exact point; boundary is inclusive', () => {
  const s = { lat: 10, lng: 10, radius_m: 100 };
  assert.equal(isWithinStage({ lat: NaN, lng: 10 }, s), false);
  assert.equal(isWithinStage({ lat: 10, lng: Infinity }, s), false);
  assert.equal(isWithinStage(s, { ...s, radius_m: 0 }), true);
  assert.equal(isWithinStage(offsetLatLng(s, 1, 0), { ...s, radius_m: 0 }), false);
  assert.equal(isWithinStage(s, { ...s, radius_m: NaN }), false);
  assert.equal(isWithinStage(s, { ...s, radius_m: -5 }), false);
  const d = haversineM(offsetLatLng(s, 100, 0), s);
  assert.equal(isWithinStage(offsetLatLng(s, 100, 0), { ...s, radius_m: d }), true, 'exactly at the radius is inside');
});

test('geofence: empty stage list, all cleared, and duplicate orders', () => {
  assert.equal(currentTarget([]), null);
  assert.equal(checkArrival(mockStart, []), null);
  assert.equal(distanceToTargetM(mockStart, []), null);
  const dup = [{ ...stageAt(0), id: 'a', order: 1 }, { ...stageAt(1), id: 'b', order: 1 }];
  // Tie goes to the later array entry; documented here so a change is noticed.
  assert.equal(currentTarget(dup)?.id, 'b');
  assert.equal(distanceToTargetM(stageAt(0), [stageAt(0)]), 0, 'inside the radius is 0 metres left');
});

test('distanceToTargetM with a NaN position is NaN, not 0 (UI must not show it as arrived)', () => {
  assert.ok(Number.isNaN(distanceToTargetM({ lat: NaN, lng: NaN }, mockStages)));
});

test('offsetLatLng wraps longitude across the antimeridian', () => {
  const q = offsetLatLng({ lat: 0, lng: 179.9999 }, 0, 100);
  assert.ok(q.lng >= -180 && q.lng <= 180, `lng ${q.lng} is outside -180..180`);
  assert.ok(q.lng < 0, `expected a wrap to the western side, got ${q.lng}`);
});

// ---------- simulate source ----------

test('simulate source: steps 0 or negative arrive on the first tick; sailTo while sailing resolves the first promise', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const source = createSimulateSource({ start: mockStart, stepMs: 100, steps: 0 });
  const done = source.sailTo(stageAt(0));
  t.mock.timers.tick(100);
  await done;
  assert.deepEqual(source.getLast(), { lat: stageAt(0).lat, lng: stageAt(0).lng });

  const s2 = createSimulateSource({ start: mockStart, stepMs: 100, steps: 10 });
  let firstResolved = false;
  void s2.sailTo(stageAt(0)).then(() => (firstResolved = true));
  t.mock.timers.tick(300);
  const second = s2.sailTo(stageAt(2)); // interrupts the first
  await flush();
  assert.equal(firstResolved, true);
  t.mock.timers.tick(1000);
  await second;
  assert.equal(s2.getLast()?.lat, stageAt(2).lat);
});

test('simulate source: steps NaN never arrives', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const source = createSimulateSource({ start: mockStart, stepMs: 10, steps: NaN });
  let resolved = false;
  void source.sailTo(stageAt(0)).then(() => (resolved = true));
  t.mock.timers.tick(1000);
  await flush();
  source.stop();
  assert.equal(resolved, true);
});

test('simulate source: a listener that throws on the final step must not leave the interval running', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const source = createSimulateSource({ start: mockStart, stepMs: 10, steps: 2 });
  const seen: LatLng[] = [];
  let armed = false;
  source.subscribe((p) => {
    seen.push(p);
    if (armed) throw new Error('listener bug');
  });
  armed = true;
  let resolved = false;
  void source.sailTo(stageAt(0)).then(() => (resolved = true));
  const safeTick = (): void => {
    try {
      t.mock.timers.tick(10);
    } catch {
      /* the listener's error escapes the timer callback */
    }
  };
  safeTick();
  safeTick(); // final step, listener throws
  const before = seen.length;
  safeTick();
  safeTick();
  await flush();
  assert.equal(seen.length, before, 'sail must have stopped');
  assert.equal(resolved, true);
});

test('simulate source: one throwing listener starves the listeners after it', () => {
  const source = createSimulateSource({ start: mockStart });
  const seen: string[] = [];
  source.subscribe(() => {});
  let armed = false;
  source.subscribe(() => {
    if (armed) throw new Error('bad');
  });
  source.subscribe(() => void seen.push('third'));
  seen.length = 0;
  armed = true;
  try {
    source.jumpTo(stageAt(0));
  } catch {
    /* swallowed here, escapes in the app */
  }
  assert.deepEqual(seen, ['third']);
});

test('simulate source: getLast and listeners share one object, and getLast initially returns the caller\'s start object', () => {
  const start = { lat: 1, lng: 2 };
  const source = createSimulateSource({ start });
  assert.equal(source.getLast(), start, 'start object is returned by reference (mutating it would move the source)');
  const seen: LatLng[] = [];
  source.subscribe((p) => seen.push(p));
  source.jumpTo({ lat: 3, lng: 4 });
  assert.equal(seen[1], source.getLast());
});

// ---------- mock backend as a model of the server ----------

test('mock backend: clearStage is refused when the Odyssey is not in the voyage', async () => {
  const backend = createMockBackend({ odyssey: { ...mockOdyssey, status: 'lobby' } });
  const r = await backend.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: ME, position: stageAt(0) });
  assert.equal(r.status, 'rejected');
});

test('mock backend: manual clear needs no position but does need a member (both points modes)', async () => {
  for (const points_mode of ['crew', 'arriver'] as const) {
    const backend = createMockBackend({ odyssey: { ...mockOdyssey, points_mode } });
    const r = await backend.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: 'not-a-member', position: null, manual: true });
    assert.deepEqual(r, { status: 'rejected', reason: 'not_member' });
    assert.equal((await backend.getLedger(ID)).length, 0);
    const ok = await backend.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: ME, position: null, manual: true });
    assert.equal(ok.status, 'cleared');
  }
});

test('mock backend: clearing after completion is idempotent and awards nothing more', async () => {
  const backend = createMockBackend();
  for (const s of mockStages) await backend.clearStage({ odysseyId: ID, stageId: s.id, memberId: ME, position: s });
  const before = (await backend.getLedger(ID)).length;
  const r = await backend.clearStage({ odysseyId: ID, stageId: stageAt(5).id, memberId: ME, position: stageAt(5) });
  assert.equal(r.status, 'already_cleared');
  assert.equal((await backend.getLedger(ID)).length, before);
  assert.equal((await backend.getOdyssey(ID)).status, 'complete');
});

test('mock backend: returned objects are copies, mutating them does not change backend state', async () => {
  const backend = createMockBackend();
  const o = await backend.getOdyssey(ID);
  o.status = 'complete';
  const [s] = await backend.getVisibleStages(ID);
  s.cleared_at = 'x';
  s.lat = 0;
  const [m] = await backend.getMembers(ID);
  m.nickname = 'hacked';
  const r = await backend.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: ME, position: stageAt(0) });
  if (r.status === 'cleared') r.stage.points = 9999;
  const l = await backend.getLedger(ID);
  l[0].points = 9999;
  assert.equal((await backend.getOdyssey(ID)).status, 'voyage');
  assert.equal((await backend.getMembers(ID))[0].nickname, mockMembers[0].nickname);
  assert.equal((await backend.getLedger(ID))[0].points, 100);
  assert.equal((await backend.getVisibleStages(ID)).find((x) => x.id === stageAt(0).id)?.points, 100);
  assert.equal(mockStages[0].cleared_at, null, 'module-level seed is not mutated');
  assert.equal(mockOdyssey.status, 'voyage');
});

test('mock backend fog: nothing about hidden stages leaks (names, coordinates, ids, count) before or after a clear', async () => {
  const backend = createMockBackend();
  const hidden = mockStages.slice(1);
  for (const phase of [0, 1]) {
    if (phase === 1) await backend.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: ME, position: stageAt(0) });
    const json = JSON.stringify(await backend.getVisibleStages(ID));
    const revealed = phase; // after one clear, stage 2 is the target
    for (const [i, h] of hidden.entries()) {
      if (i < revealed) continue;
      for (const needle of [h.id, h.name, h.title, h.lore, String(h.lat), String(h.lng)]) {
        assert.ok(!json.includes(needle), `phase ${phase} leaked ${needle}`);
      }
    }
  }
});

test('mock backend: rejection order is not_found, not_member, already_cleared, not_in_voyage, not_current_target, too_far (a hidden stage never reveals its distance)', async () => {
  const backend = createMockBackend();
  // Far-away hidden stage: wrong order wins over distance, so the client learns nothing about it.
  const r = await backend.clearStage({ odysseyId: ID, stageId: stageAt(4).id, memberId: ME, position: { lat: 0, lng: 0 } });
  assert.deepEqual(r, { status: 'rejected', reason: 'not_current_target' });
});

test('mock backend: a throwing subscriber makes clearStage reject after the clear was committed', async () => {
  const backend = createMockBackend();
  let later = 0;
  backend.subscribe(ID, () => {
    throw new Error('subscriber bug');
  });
  backend.subscribe(ID, () => void (later += 1));
  let threw = false;
  try {
    await backend.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: ME, position: stageAt(0) });
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
  assert.equal(later, 1);
});

test('mock backend: duplicate subscribe of the same function fires once; unsubscribe is idempotent', async () => {
  const backend = createMockBackend();
  let n = 0;
  const f = (): void => void (n += 1);
  const u1 = backend.subscribe(ID, f);
  const u2 = backend.subscribe(ID, f);
  await backend.clearStage({ odysseyId: ID, stageId: stageAt(0).id, memberId: ME, position: null, manual: true });
  assert.equal(n, 1, 'Set semantics: the same function registered twice fires once');
  u1();
  u2();
  await backend.clearStage({ odysseyId: ID, stageId: stageAt(1).id, memberId: ME, position: null, manual: true });
  assert.equal(n, 1);
});

test('mock backend: an empty route stays in voyage and never completes', async () => {
  const backend = createMockBackend({ stages: [] });
  assert.deepEqual(await backend.getVisibleStages(ID), []);
  assert.deepEqual(await backend.clearStage({ odysseyId: ID, stageId: 'x', memberId: ME, position: null, manual: true }), {
    status: 'rejected',
    reason: 'not_found',
  });
});

test('mock backend: ignores odysseyId, so a hook given the wrong id silently reads the mock Odyssey', () => {
  const backend = createMockBackend();
  return backend.getOdyssey('some-other-id').then((o) => assert.equal(o.id, ID));
});

// ---------- points ----------

test('points totals: empty ledger, unknown member, negative and duplicate rows', () => {
  assert.deepEqual(totalsByMember([]), {});
  assert.equal(memberTotal([], 'x'), 0);
  const row = (id: string, member_id: string, points: number): LedgerEntry => ({ id, odyssey_id: ID, member_id, stage_id: 's', points, reason: 'r', created_at: '2026-01-01T00:00:00Z' });
  const ledger = [row('1', 'a', 100), row('2', 'a', -30), row('1', 'a', 100), row('3', 'ghost', 5)];
  assert.equal(memberTotal(ledger, 'a'), 170, 'negative rows subtract and duplicate ids are counted twice (no dedupe)');
  assert.equal(memberTotal(ledger, 'ghost'), 5, 'rows for non-members still total');
});

test('points totals: a member id that collides with an Object.prototype key returns a number', () => {
  assert.equal(typeof memberTotal([], 'constructor'), 'number');
});

// ---------- watcher: error callback and backoff timing ----------

test('watcher: onError receives a clearStage failure and the watcher keeps going', async () => {
  const base = createMockBackend();
  let failClear = true;
  const backend: OdysseyBackend = {
    ...base,
    clearStage: async (i) => {
      if (failClear) throw new Error('network');
      return base.clearStage(i);
    },
  };
  const source = createSimulateSource({ start: { lat: 0, lng: 0 } });
  const errors: unknown[] = [];
  const results: string[] = [];
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME, onResult: (r) => results.push(r.status), onError: (e) => errors.push(e) });
  await flush();
  source.jumpTo(stageAt(0));
  await flush();
  assert.equal(errors.length, 1);
  failClear = false;
  source.jumpTo(stageAt(0));
  await flush();
  stop();
  assert.deepEqual(results, ['cleared']);
});

test('watcher: a rejected stage is retried after the position moves more than 25 m, or after 15 s', async (t) => {
  const base = createMockBackend();
  let calls = 0;
  const backend: OdysseyBackend = {
    ...base,
    clearStage: async () => {
      calls += 1;
      return { status: 'rejected', reason: 'too_far' } as ClearStageResult;
    },
  };
  const source = createSimulateSource({ start: { lat: 0, lng: 0 } });
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME });
  await flush();
  source.jumpTo(stageAt(0));
  await flush();
  assert.equal(calls, 1);
  source.jumpTo(offsetLatLng(stageAt(0), 10, 0));
  await flush();
  assert.equal(calls, 1, 'moved 10 m: still backed off');
  source.jumpTo(offsetLatLng(stageAt(0), 40, 0));
  await flush();
  assert.equal(calls, 2, 'moved more than 25 m: retry');
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 20_000 });
  source.jumpTo(offsetLatLng(stageAt(0), 41, 0));
  await flush();
  assert.equal(calls, 3, 'after 15 s: retry');
  stop();
});
