/// <reference types="node" />
// Adversarial tests for startArrivalWatcher: a hand-controlled backend and source so every
// interleaving is explicit. Deferred promises are resolved or rejected by the test.
import assert from 'node:assert/strict';
import { after, before, test, type TestContext } from 'node:test';

import { offsetLatLng } from '../../lib/geo';
import { mockMembers, mockOdyssey, mockStages } from '../../lib/mock';
import type { LatLng, Stage } from '../../lib/types';
import type { ClearStageInput, ClearStageResult, OdysseyBackend } from '../odyssey/backend';
import { createMockBackend } from '../odyssey/mockBackend';
import type { LocationSource, PositionListener } from './source';
import { RETRY_AFTER_MOVE_M, RETRY_AFTER_MS, startArrivalWatcher } from './watcher';

const ID = mockOdyssey.id;
const ME = mockMembers[0].id;

// ---- unhandled rejection guard for the whole file ----
const unhandled: unknown[] = [];
const onUnhandled = (e: unknown): void => void unhandled.push(e);
before(() => void process.on('unhandledRejection', onUnhandled));
after(() => {
  process.off('unhandledRejection', onUnhandled);
  assert.equal(unhandled.length, 0, `unhandled rejections: ${String(unhandled)}`);
});

// ---- helpers ----
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
function defer<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await new Promise<void>((r) => setImmediate(r));
};

const ORIGIN: LatLng = { lat: 0, lng: 0 };
/** A stage `northM` metres north of the origin. */
const mk = (order: number, northM: number, radius = 100, cleared = false): Stage => {
  const at = offsetLatLng(ORIGIN, northM, 0);
  return {
    ...mockStages[0],
    id: `s${order}`,
    order,
    lat: at.lat,
    lng: at.lng,
    radius_m: radius,
    cleared_at: cleared ? '2026-01-01T00:00:00Z' : null,
    cleared_by: cleared ? ME : null,
  };
};
const north = (m: number): LatLng => offsetLatLng(ORIGIN, m, 0);
/** Stage list where orders <= n are cleared. */
const view = (all: Stage[], n: number): Stage[] =>
  all.map((s) => (s.order <= n ? { ...s, cleared_at: '2026-01-01T00:00:00Z', cleared_by: ME } : { ...s }));
const cleared = (s: Stage): ClearStageResult => ({ status: 'cleared', stage: s });
const tooFar: ClearStageResult = { status: 'rejected', reason: 'too_far' };

interface FakeBackend {
  backend: OdysseyBackend;
  reads: Deferred<Stage[]>[];
  clears: { input: ClearStageInput; d: Deferred<ClearStageResult> }[];
  listeners: Set<() => void>;
  fire: () => void;
}
function fakeBackend(): FakeBackend {
  const reads: Deferred<Stage[]>[] = [];
  const clears: FakeBackend['clears'] = [];
  const listeners = new Set<() => void>();
  const backend = {
    getVisibleStages: () => {
      const d = defer<Stage[]>();
      reads.push(d);
      return d.promise;
    },
    clearStage: (input: ClearStageInput) => {
      const d = defer<ClearStageResult>();
      clears.push({ input, d });
      return d.promise;
    },
    subscribe: (_id: string, cb: () => void) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  } as unknown as OdysseyBackend;
  return { backend, reads, clears, listeners, fire: () => [...listeners].forEach((l) => l()) };
}

interface FakeSource extends LocationSource {
  listeners: Set<PositionListener>;
  emit: (p: LatLng) => void;
  set: (p: LatLng | null) => void;
}
function fakeSource(opts: { start?: LatLng | null; replay?: boolean } = {}): FakeSource {
  let last: LatLng | null = opts.start ?? null;
  const listeners = new Set<PositionListener>();
  return {
    listeners,
    subscribe(l) {
      listeners.add(l);
      if (opts.replay === true && last !== null) l(last);
      return () => void listeners.delete(l);
    },
    getLast: () => last,
    emit(p) {
      last = p;
      [...listeners].forEach((l) => l(p));
    },
    set(p) {
      last = p;
    },
  };
}

interface Harness extends FakeBackend {
  source: FakeSource;
  results: ClearStageResult[];
  errors: unknown[];
  stop: () => void;
  /** Resolve the initial read and let the source subscribe. */
  boot: (stages: Stage[]) => Promise<void>;
}
function harness(t: TestContext, srcOpts?: Parameters<typeof fakeSource>[0], throwing: { onResult?: boolean; onError?: boolean } = {}): Harness {
  const fb = fakeBackend();
  const source = fakeSource(srcOpts);
  const results: ClearStageResult[] = [];
  const errors: unknown[] = [];
  const stop = startArrivalWatcher({
    source,
    backend: fb.backend,
    odysseyId: ID,
    memberId: ME,
    onResult: (r) => {
      results.push(r);
      if (throwing.onResult === true) throw new Error('onResult boom');
    },
    onError: (e) => {
      errors.push(e);
      if (throwing.onError === true) throw new Error('onError boom');
    },
  });
  t.after(stop);
  return {
    ...fb,
    source,
    results,
    errors,
    stop,
    boot: async (stages) => {
      fb.reads[0].resolve(stages);
      await settle();
    },
  };
}
/** Controls Date.now. */
function clock(t: TestContext, start = 1_000_000): { advance: (ms: number) => void } {
  let now = start;
  t.mock.method(Date, 'now', () => now);
  return { advance: (ms) => void (now += ms) };
}

const S3 = [mk(1, 0), mk(2, 0), mk(3, 0)];

// ---------- single flight ----------
test('several positions during one in-flight clear: one clear at a time, latest position re-examined', async (t) => {
  const stages = [mk(1, 0), mk(2, 1000)];
  const h = harness(t);
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  assert.equal(h.clears.length, 1);
  h.source.emit(ORIGIN);
  h.source.emit(ORIGIN);
  h.source.emit(north(1000)); // latest: inside stage 2
  await settle();
  assert.equal(h.clears.length, 1, 'still exactly one clear in flight');
  h.clears[0].d.resolve(cleared(stages[0]));
  await settle();
  assert.equal(h.results.length, 1, 'onResult delivered before the refresh resolves');
  assert.equal(h.reads.length, 2);
  h.reads[1].resolve(view(stages, 1));
  await settle();
  assert.equal(h.clears.length, 2);
  assert.equal(h.clears[1].input.stageId, 's2');
  assert.deepEqual(h.clears[1].input.position, north(1000));
  h.clears[1].d.resolve(cleared(stages[1]));
  await settle();
  h.reads[2].resolve(view(stages, 2));
  await settle();
  assert.equal(h.clears.length, 2);
  assert.equal(h.reads.length, 3);
  assert.deepEqual(h.errors, []);
});

test('chain: one position inside stages 1, 2, 3 clears all three with exactly three clearStage calls, then stops', async (t) => {
  const base = createMockBackend({ stages: S3 });
  let clearCalls = 0;
  let readCalls = 0;
  const backend: OdysseyBackend = {
    ...base,
    getVisibleStages: (id) => {
      readCalls += 1;
      return base.getVisibleStages(id);
    },
    clearStage: (i) => {
      clearCalls += 1;
      return base.clearStage(i);
    },
  };
  const source = fakeSource({ start: ORIGIN });
  const results: string[] = [];
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME, onResult: (r) => results.push(r.status) });
  t.after(stop);
  await settle();
  source.emit(ORIGIN);
  await settle();
  assert.deepEqual(results, ['cleared', 'cleared', 'cleared']);
  assert.equal(clearCalls, 3);
  const readsAfter = readCalls;
  source.emit(ORIGIN);
  source.emit(ORIGIN);
  await settle();
  assert.equal(clearCalls, 3);
  assert.equal(readCalls, readsAfter, 'voyage complete: later positions cause no reads either');
});

test('chain with a stationary replaying source clears everything from the replayed fix alone', async (t) => {
  const base = createMockBackend({ stages: S3 });
  const source = fakeSource({ start: ORIGIN, replay: true });
  const results: string[] = [];
  const stop = startArrivalWatcher({ source, backend: base, odysseyId: ID, memberId: ME, onResult: (r) => results.push(r.status) });
  t.after(stop);
  await settle();
  assert.deepEqual(results, ['cleared', 'cleared', 'cleared']);
});

// ---------- clearStage failure ----------
test('clearStage rejects: onError once, not stuck, no self-retry, next position retries', async (t) => {
  const stages = [mk(1, 0), mk(2, 1000)];
  const h = harness(t);
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  const err = new Error('network');
  h.clears[0].d.reject(err);
  await settle();
  assert.deepEqual(h.errors, [err]);
  assert.deepEqual(h.results, []);
  await settle();
  await settle();
  assert.equal(h.clears.length, 1, 'no timer or spin: nothing retries on its own');
  assert.equal(h.reads.length, 1);
  h.source.emit(ORIGIN);
  await settle();
  assert.equal(h.clears.length, 2, 'next position retries');
  h.clears[1].d.resolve(cleared(stages[0]));
  await settle();
  assert.equal(h.results.length, 1);
});

test('persistently failing backend with a stationary position never spins (no timers, no loop)', async (t) => {
  const h = harness(t, { start: ORIGIN });
  await h.boot([mk(1, 0)]);
  h.source.emit(ORIGIN);
  await settle();
  for (let i = 0; i < 5; i += 1) {
    h.clears[h.clears.length - 1].d.reject(new Error('down'));
    await settle();
  }
  assert.equal(h.clears.length, 1);
  assert.equal(h.errors.length, 1);
});

test('clearStage failure while positions keep arriving: bounded by events (one immediate retry at most per in-flight failure)', async (t) => {
  const h = harness(t);
  await h.boot([mk(1, 0)]);
  h.source.emit(ORIGIN);
  await settle();
  h.source.emit(ORIGIN); // arrives during the in-flight clear
  await settle();
  h.clears[0].d.reject(new Error('down'));
  await settle();
  assert.equal(h.clears.length, 2, 'the position that arrived in flight is retried right away');
  h.clears[1].d.reject(new Error('down'));
  await settle();
  assert.equal(h.clears.length, 2);
  assert.equal(h.errors.length, 2);
});

// ---------- getVisibleStages failure ----------
test('initial load rejects, still subscribes, recovers on the next position', async (t) => {
  const stages = [mk(1, 0)];
  const h = harness(t);
  h.reads[0].reject(new Error('offline'));
  await settle();
  assert.equal(h.errors.length, 1);
  assert.equal(h.source.listeners.size, 1, 'subscribed despite the failed load');
  assert.equal(h.reads.length, 1, 'no timers: nothing retried yet');
  h.source.emit(ORIGIN);
  await settle();
  assert.equal(h.reads.length, 2);
  h.reads[1].resolve(stages);
  await settle();
  assert.equal(h.clears.length, 1);
  h.clears[0].d.resolve(cleared(stages[0]));
  await settle();
  assert.equal(h.results.length, 1);
});

test('initial load rejects, recovers on a backend change event (position already known)', async (t) => {
  const stages = [mk(1, 0)];
  const h = harness(t, { start: ORIGIN });
  h.reads[0].reject(new Error('offline'));
  await settle();
  h.fire();
  await settle();
  assert.equal(h.reads.length, 2);
  h.reads[1].resolve(stages);
  await settle();
  assert.equal(h.clears.length, 1);
});

test('initial load keeps failing: each position retries once, each failure reports', async (t) => {
  const h = harness(t);
  h.reads[0].reject(new Error('1'));
  await settle();
  h.source.emit(ORIGIN);
  await settle();
  h.reads[1].reject(new Error('2'));
  await settle();
  h.source.emit(ORIGIN);
  await settle();
  assert.equal(h.reads.length, 3);
  assert.equal(h.errors.length, 2);
});

test('post-clear refresh rejects: onResult already delivered, onError fires, recovers on the next position', async (t) => {
  const stages = [mk(1, 0), mk(2, 1000)];
  const h = harness(t);
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  h.clears[0].d.resolve(cleared(stages[0]));
  await settle();
  assert.equal(h.results.length, 1, 'result delivered while the refresh is still pending');
  assert.equal(h.errors.length, 0);
  h.reads[1].reject(new Error('flaky'));
  await settle();
  assert.equal(h.errors.length, 1);
  h.source.emit(north(1000));
  await settle();
  assert.equal(h.reads.length, 3, 'next position re-reads');
  h.reads[2].resolve(view(stages, 1));
  await settle();
  assert.equal(h.clears.length, 2);
  assert.equal(h.clears[1].input.stageId, 's2');
});

test('post-clear refresh rejects: recovers on a backend change event', async (t) => {
  const stages = [mk(1, 0), mk(2, 0)];
  const h = harness(t);
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  h.clears[0].d.resolve(cleared(stages[0]));
  await settle();
  h.reads[1].reject(new Error('flaky'));
  await settle();
  h.fire();
  await settle();
  h.reads[2].resolve(view(stages, 1));
  await settle();
  assert.equal(h.clears.length, 2);
  assert.equal(h.clears[1].input.stageId, 's2');
});

// ---------- backoff ----------
async function rejectedOnce(t: TestContext, stages: Stage[]): Promise<Harness & { c: ReturnType<typeof clock> }> {
  const c = clock(t);
  const h = harness(t);
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  h.clears[0].d.resolve(tooFar);
  await settle();
  assert.equal(h.reads.length, 2, 'target refreshed after a rejection');
  h.reads[1].resolve(stages);
  await settle();
  return { ...h, c };
}

test('constants match the spec', () => {
  assert.equal(RETRY_AFTER_MOVE_M, 25);
  assert.equal(RETRY_AFTER_MS, 15000);
});

test('persistent too_far: 10 positions within 25 m and 15 s make exactly one attempt', async (t) => {
  const h = await rejectedOnce(t, [mk(1, 0, 200)]);
  assert.deepEqual(h.results, [tooFar]);
  for (let i = 0; i < 10; i += 1) {
    h.c.advance(1000);
    h.source.emit(north(i % 2 === 0 ? 10 : -10));
    await settle();
  }
  assert.equal(h.clears.length, 1);
});

test('backoff: moving more than 25 m retries; 24 m does not', async (t) => {
  const h = await rejectedOnce(t, [mk(1, 0, 200)]);
  h.source.emit(north(24));
  await settle();
  assert.equal(h.clears.length, 1);
  h.source.emit(north(26));
  await settle();
  assert.equal(h.clears.length, 2);
});

test('backoff: waiting RETRY_AFTER_MS retries; one ms less does not', async (t) => {
  const h = await rejectedOnce(t, [mk(1, 0, 200)]);
  h.c.advance(RETRY_AFTER_MS - 1);
  h.source.emit(ORIGIN);
  await settle();
  assert.equal(h.clears.length, 1);
  h.c.advance(1);
  h.source.emit(ORIGIN);
  await settle();
  assert.equal(h.clears.length, 2);
});

test('backoff: a backend change event during backoff does not bypass it for the same stage', async (t) => {
  const stages = [mk(1, 0, 200)];
  const h = await rejectedOnce(t, stages);
  h.fire();
  await settle();
  h.reads[2].resolve(stages);
  await settle();
  h.source.emit(ORIGIN);
  await settle();
  assert.equal(h.clears.length, 1);
});

test('backoff: a different target resets it', async (t) => {
  const stages = [mk(1, 0, 200), mk(2, 0, 200)];
  const h = await rejectedOnce(t, stages);
  h.fire(); // a crewmate cleared stage 1; stage 2 is now the target
  await settle();
  h.reads[2].resolve(view(stages, 1));
  await settle();
  assert.equal(h.clears.length, 2, 'stage 2 attempted at once, same spot, same second');
  assert.equal(h.clears[1].input.stageId, 's2');
});

test('backoff is per stage: rejected for 1, then 1 is the target again only after 15 s or 25 m', async (t) => {
  const stages = [mk(1, 0, 200)];
  const h = await rejectedOnce(t, stages);
  h.fire();
  await settle();
  h.reads[2].resolve(stages);
  await settle();
  h.source.emit(north(5));
  await settle();
  assert.equal(h.clears.length, 1);
});

// ---------- already_cleared / inconsistent ----------
test('already_cleared: target moves on, no loop', async (t) => {
  const stages = [mk(1, 0), mk(2, 1000)];
  const h = harness(t);
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  h.clears[0].d.resolve({ status: 'already_cleared', stage: stages[0] });
  await settle();
  h.reads[1].resolve(view(stages, 1));
  await settle();
  assert.equal(h.clears.length, 1);
  assert.equal(h.reads.length, 2);
  assert.deepEqual(h.results.map((r) => r.status), ['already_cleared']);
});

test('inconsistent backend that keeps returning the cleared stage as target: one clear, no infinite loop', async (t) => {
  const stages = [mk(1, 0)];
  let clears = 0;
  const backend = {
    getVisibleStages: async () => stages.map((s) => ({ ...s })),
    clearStage: async (): Promise<ClearStageResult> => {
      clears += 1;
      if (clears > 50) throw new Error('runaway');
      return cleared(stages[0]);
    },
    subscribe: () => () => {},
  } as unknown as OdysseyBackend;
  const source = fakeSource({ start: ORIGIN, replay: true });
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME });
  t.after(stop);
  await settle();
  source.emit(ORIGIN);
  await settle();
  assert.equal(clears, 1);
});

test('KNOWN LIMIT: backend alternating between two stages as target is only guarded by the last cleared id', async (t) => {
  const stages = [mk(1, 0), mk(2, 0)];
  let reads = 0;
  let clears = 0;
  const backend = {
    getVisibleStages: async () => {
      reads += 1;
      return [{ ...stages[reads % 2] }];
    },
    clearStage: async (i: ClearStageInput): Promise<ClearStageResult> => {
      clears += 1;
      if (clears > 50) throw new Error('runaway');
      return cleared(stages.find((s) => s.id === i.stageId) as Stage);
    },
    subscribe: () => () => {},
  } as unknown as OdysseyBackend;
  const source = fakeSource({ start: ORIGIN, replay: true });
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME });
  t.after(stop);
  await settle();
  assert.ok(clears <= 4, `clears: ${clears}`);
});

test('stale read after a clear (replica lag): later positions should trigger a re-read', async (t) => {
  const stages = [mk(1, 0), mk(2, 0)];
  const h = harness(t);
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  h.clears[0].d.resolve(cleared(stages[0]));
  await settle();
  h.reads[1].resolve(stages); // stale: stage 1 still uncleared
  await settle();
  h.source.emit(ORIGIN);
  await settle();
  assert.ok(h.reads.length >= 3, `reads: ${h.reads.length}`);
});

// ---------- ordering ----------
test('out-of-order reads: an older read resolving after a newer one does not set a stale target', async (t) => {
  const stages = [mk(1, 5000), mk(2, 0)];
  const h = harness(t);
  h.fire(); // pump starts read #2 while read #1 (initial) is pending
  await settle();
  assert.equal(h.reads.length, 2);
  h.reads[1].resolve(view(stages, 1)); // newer: target is stage 2
  await settle();
  h.reads[0].resolve(stages); // older and stale: target would be stage 1
  await settle();
  h.source.emit(ORIGIN);
  await settle();
  assert.equal(h.clears.length, 1);
  assert.equal(h.clears[0].input.stageId, 's2');
});

test('backend change during an in-flight clear is not lost', async (t) => {
  const stages = [mk(1, 0), mk(2, 1000), mk(3, 2000)];
  const h = harness(t);
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  h.fire();
  await settle();
  assert.equal(h.clears.length, 1);
  assert.equal(h.reads.length, 1, 'no read while a clear is in flight');
  h.clears[0].d.resolve(cleared(stages[0]));
  await settle();
  assert.equal(h.reads.length, 2);
  h.reads[1].resolve(view(stages, 2)); // crewmate also cleared stage 2
  await settle();
  h.source.emit(north(2000));
  await settle();
  assert.equal(h.clears.length, 2);
  assert.equal(h.clears[1].input.stageId, 's3');
});

test('backend change during a refresh is not lost (a second read follows and wins)', async (t) => {
  const stages = [mk(1, 0), mk(2, 1000), mk(3, 2000)];
  const h = harness(t);
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  h.clears[0].d.resolve(cleared(stages[0]));
  await settle();
  h.fire(); // during refresh #2
  await settle();
  h.reads[1].resolve(view(stages, 1));
  await settle();
  assert.equal(h.reads.length, 3, 'event during the refresh triggers another read');
  h.reads[2].resolve(view(stages, 2));
  await settle();
  h.source.emit(north(2000));
  await settle();
  assert.equal(h.clears.at(-1)?.input.stageId, 's3');
});

// ---------- stop ----------
function assertQuiet(h: Harness, clears: number): void {
  assert.equal(h.clears.length, clears, 'no clearStage after stop');
  assert.equal(h.source.listeners.size, 0, 'source unsubscribed');
  assert.equal(h.listeners.size, 0, 'backend unsubscribed');
}

test('stop before the initial load resolves', async (t) => {
  const h = harness(t, { start: ORIGIN });
  h.stop();
  h.reads[0].resolve([mk(1, 0)]);
  await settle();
  h.fire();
  h.source.emit(ORIGIN);
  await settle();
  assertQuiet(h, 0);
  assert.deepEqual(h.results, []);
});

test('stop before the initial load rejects: no onError', async (t) => {
  const h = harness(t);
  h.stop();
  h.reads[0].reject(new Error('x'));
  await settle();
  assertQuiet(h, 0);
  assert.deepEqual(h.errors, []);
});

test('stop during an in-flight clear: no onResult, no refresh, no further clears', async (t) => {
  const stages = [mk(1, 0), mk(2, 0)];
  const h = harness(t);
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  h.stop();
  h.clears[0].d.resolve(cleared(stages[0]));
  await settle();
  h.fire();
  h.source.emit(ORIGIN);
  await settle();
  assertQuiet(h, 1);
  assert.deepEqual(h.results, []);
  assert.equal(h.reads.length, 1);
});

test('stop during an in-flight clear that then rejects: no onError', async (t) => {
  const h = harness(t);
  await h.boot([mk(1, 0)]);
  h.source.emit(ORIGIN);
  await settle();
  h.stop();
  h.clears[0].d.reject(new Error('x'));
  await settle();
  assertQuiet(h, 1);
  assert.deepEqual(h.errors, []);
});

test('stop during the post-clear refresh: no next clear even though the next stage is under the position', async (t) => {
  const stages = [mk(1, 0), mk(2, 0)];
  const h = harness(t);
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  h.clears[0].d.resolve(cleared(stages[0]));
  await settle();
  assert.equal(h.results.length, 1);
  h.stop();
  h.reads[1].resolve(view(stages, 1));
  await settle();
  assertQuiet(h, 1);
});

test('stop during the post-clear refresh that rejects: no onError', async (t) => {
  const stages = [mk(1, 0)];
  const h = harness(t);
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  h.clears[0].d.resolve(cleared(stages[0]));
  await settle();
  h.stop();
  h.reads[1].reject(new Error('x'));
  await settle();
  assert.deepEqual(h.errors, []);
  assertQuiet(h, 1);
});

test('stop during backoff', async (t) => {
  const h = await rejectedOnce(t, [mk(1, 0, 200)]);
  h.stop();
  h.c.advance(RETRY_AFTER_MS * 2);
  h.source.emit(north(100));
  h.fire();
  await settle();
  assertQuiet(h, 1);
});

test('stop is idempotent', async (t) => {
  const h = harness(t);
  await h.boot([]);
  h.stop();
  h.stop();
  assertQuiet(h, 0);
});

// ---------- throwing callbacks ----------
test('onResult throwing: reported via onError, nothing unhandled, watcher continues', async (t) => {
  const stages = [mk(1, 0), mk(2, 0)];
  const h = harness(t, undefined, { onResult: true });
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  h.clears[0].d.resolve(cleared(stages[0]));
  await settle();
  assert.equal(h.errors.length, 1);
  h.reads[1].resolve(view(stages, 1));
  await settle();
  assert.equal(h.clears.length, 2, 'still clearing the next stage');
});

test('onError throwing: nothing unhandled, the watcher keeps working', async (t) => {
  const stages = [mk(1, 0)];
  const h = harness(t, undefined, { onError: true });
  await h.boot(stages);
  h.source.emit(ORIGIN);
  await settle();
  h.clears[0].d.reject(new Error('net'));
  await settle();
  h.source.emit(ORIGIN);
  await settle();
  assert.equal(h.clears.length, 2);
  h.clears[1].d.resolve(cleared(stages[0]));
  await settle();
  assert.equal(h.results.length, 1);
});

test('backend methods that throw synchronously are handled like rejections', async (t) => {
  const source = fakeSource({ start: ORIGIN });
  const errors: unknown[] = [];
  const backend = {
    getVisibleStages: () => {
      throw new Error('sync read');
    },
    clearStage: () => {
      throw new Error('sync clear');
    },
    subscribe: () => () => {},
  } as unknown as OdysseyBackend;
  const stop = startArrivalWatcher({ source, backend, odysseyId: ID, memberId: ME, onError: (e) => errors.push(e) });
  t.after(stop);
  await settle();
  source.emit(ORIGIN);
  await settle();
  assert.equal(errors.length, 2);
});

// ---------- sources and empty lists ----------
test('GPS before the first fix (getLast null): nothing happens, then the first fix works', async (t) => {
  const stages = [mk(1, 0)];
  const h = harness(t);
  await h.boot(stages);
  assert.equal(h.clears.length, 0);
  h.source.emit(ORIGIN);
  await settle();
  assert.equal(h.clears.length, 1);
  assert.deepEqual(h.clears[0].input.position, ORIGIN);
});

test('a source that replays its last position on subscribe triggers a clear once, without extra reads', async (t) => {
  const stages = [mk(1, 0)];
  const h = harness(t, { start: ORIGIN, replay: true });
  await h.boot(stages);
  assert.equal(h.clears.length, 1);
  assert.equal(h.reads.length, 1);
});

test('empty stage list and finished voyage: no clears, no errors, no loops', async (t) => {
  const h = harness(t, { start: ORIGIN, replay: true });
  await h.boot([]);
  h.source.emit(ORIGIN);
  h.fire();
  await settle();
  h.reads[1].resolve(view([mk(1, 0), mk(2, 0)], 2));
  await settle();
  h.source.emit(ORIGIN);
  await settle();
  assert.equal(h.clears.length, 0);
  assert.deepEqual(h.errors, []);
});
