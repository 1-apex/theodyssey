import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';

import type { GpsSource } from './gpsSource';

// expo-location is native; swap it for a controllable fake before gpsSource loads.
type Fix = { coords: { latitude: number; longitude: number; accuracy: number | null } };
interface FakeWatch {
  emit: (fix: Fix) => void;
  /** Calls the callback even after remove(), like a native event already in flight. */
  forceEmit: (fix: Fix) => void;
  removed: boolean;
}

const fake = {
  permission: 'granted' as string,
  permissionGate: null as Promise<void> | null,
  watchGate: null as Promise<void> | null,
  watchFails: false,
  watches: [] as FakeWatch[],
};

const fakeLocation = {
  Accuracy: { BestForNavigation: 6 },
  requestForegroundPermissionsAsync: async () => {
    if (fake.permissionGate) await fake.permissionGate;
    return { status: fake.permission };
  },
  watchPositionAsync: async (_opts: unknown, cb: (f: Fix) => void) => {
    if (fake.watchGate) await fake.watchGate;
    if (fake.watchFails) throw new Error('location services off');
    const w: FakeWatch = {
      removed: false,
      forceEmit: cb,
      emit: (f) => {
        if (!w.removed) cb(f);
      },
    };
    fake.watches.push(w);
    return {
      remove: () => {
        w.removed = true;
      },
    };
  },
};

// `any` is deliberate: Node's private loader hook has no public types.
const mod = Module as any;
const originalLoad = mod._load;
mod._load = function (request: string, ...rest: unknown[]) {
  if (request === 'expo-location') return fakeLocation;
  return originalLoad.call(this, request, ...rest);
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after the hook is installed
const { createGpsSource } = require('./gpsSource') as typeof import('./gpsSource');

const fix = (latitude: number, longitude: number, accuracy: number | null = 5): Fix => ({
  coords: { latitude, longitude, accuracy },
});
const tick = (): Promise<void> => new Promise((r) => setImmediate(r));
const gate = (): { promise: Promise<void>; open: () => void } => {
  let open = (): void => {};
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
};
const reset = (): void => {
  fake.permission = 'granted';
  fake.permissionGate = null;
  fake.watchGate = null;
  fake.watchFails = false;
  fake.watches = [];
};
const live = (): number => fake.watches.filter((w) => !w.removed).length;
const newSource = (): GpsSource => {
  reset();
  return createGpsSource();
};

test('gps: getLast is null until the first fix, then emits plain {lat,lng} and accuracy', async () => {
  const s = newSource();
  assert.equal(s.getLast(), null);
  assert.equal(s.getAccuracyM(), null);
  assert.equal(await s.start(), 'granted');
  const seen: unknown[] = [];
  s.subscribe((p) => seen.push(p));
  assert.deepEqual(seen, []);
  fake.watches[0].emit(fix(1, 2, 7));
  assert.deepEqual(seen, [{ lat: 1, lng: 2 }]);
  assert.deepEqual(s.getLast(), { lat: 1, lng: 2 });
  assert.equal(s.getAccuracyM(), 7);
});

test('gps: subscribe replays the last fix and unsubscribe stops delivery', async () => {
  const s = newSource();
  await s.start();
  fake.watches[0].emit(fix(1, 2));
  const seen: unknown[] = [];
  const off = s.subscribe((p) => seen.push(p));
  assert.deepEqual(seen, [{ lat: 1, lng: 2 }]);
  off();
  fake.watches[0].emit(fix(3, 4));
  assert.equal(seen.length, 1);
});

test('gps: permission denied resolves denied without throwing or watching, and a later start retries', async () => {
  const s = newSource();
  fake.permission = 'denied';
  assert.equal(await s.start(), 'denied');
  assert.equal(fake.watches.length, 0);
  fake.permission = 'granted';
  assert.equal(await s.start(), 'granted');
  assert.equal(live(), 1);
});

test('gps: start twice (sequential and concurrent) creates one watcher', async () => {
  const s = newSource();
  const [a, b] = await Promise.all([s.start(), s.start()]);
  assert.deepEqual([a, b], ['granted', 'granted']);
  assert.equal(await s.start(), 'granted');
  assert.equal(fake.watches.length, 1);
});

test('gps: stop during pending permission request leaves no watcher', async () => {
  const s = newSource();
  const g = gate();
  fake.permissionGate = g.promise;
  const p = s.start();
  s.stop();
  g.open();
  await p;
  await tick();
  assert.equal(live(), 0);
});

test('gps: stop while watchPositionAsync is pending removes the watcher once it resolves', async () => {
  const s = newSource();
  const g = gate();
  fake.watchGate = g.promise;
  const p = s.start();
  await tick();
  s.stop();
  g.open();
  await p;
  await tick();
  assert.equal(fake.watches.length, 1);
  assert.equal(live(), 0);
});

test('gps: StrictMode shape start/stop/start ends with exactly one live watcher', async () => {
  const s = newSource();
  const g = gate();
  fake.permissionGate = g.promise;
  const first = s.start();
  s.stop();
  const second = s.start();
  g.open();
  await Promise.all([first, second]);
  await tick();
  assert.equal(live(), 1);
  s.stop();
  assert.equal(live(), 0);
});

test('gps: stop/start with a watch already pending ends with one live watcher', async () => {
  const s = newSource();
  const g = gate();
  fake.watchGate = g.promise;
  const first = s.start();
  await tick();
  s.stop();
  const second = s.start();
  g.open();
  await Promise.all([first, second]);
  await tick();
  assert.equal(live(), 1);
});

test('gps: listeners survive stop and receive fixes after start resumes; old watcher is silent', async () => {
  const s = newSource();
  await s.start();
  const seen: unknown[] = [];
  s.subscribe((p) => seen.push(p));
  const old = fake.watches[0];
  s.stop();
  old.emit(fix(9, 9));
  assert.equal(seen.length, 0);
  await s.start();
  fake.watches[1].emit(fix(5, 6));
  assert.deepEqual(seen, [{ lat: 5, lng: 6 }]);
});

test('gps: watchPositionAsync rejecting after permission granted maps to error, and a later start retries', async () => {
  const s = newSource();
  fake.watchFails = true;
  assert.equal(await s.start(), 'error');
  assert.equal(live(), 0);
  fake.watchFails = false;
  assert.equal(await s.start(), 'granted');
  assert.equal(live(), 1);
});

test('gps: a stale watcher callback invoked after stop() does not reach listeners or change getLast', async () => {
  const s = newSource();
  await s.start();
  const seen: unknown[] = [];
  s.subscribe((p) => seen.push(p));
  fake.watches[0].emit(fix(1, 2));
  s.stop();
  fake.watches[0].forceEmit(fix(9, 9));
  assert.equal(seen.length, 1);
  assert.deepEqual(s.getLast(), { lat: 1, lng: 2 });
  // And after a restart, the superseded watcher still cannot emit.
  await s.start();
  fake.watches[0].forceEmit(fix(8, 8));
  assert.equal(seen.length, 1);
});
