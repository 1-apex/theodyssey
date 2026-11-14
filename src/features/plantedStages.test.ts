/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { haversineM, offsetLatLng } from '../lib/geo';
import { mockMembers, mockOdyssey, mockStages } from '../lib/mock';
import type { LatLng } from '../lib/types';
import type { LocationSource, PositionListener } from './location/source';
import { startArrivalWatcher } from './location/watcher';
import { createMockBackend } from './odyssey/mockBackend';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await new Promise<void>((r) => setImmediate(r));
};

test('offsetLatLng sign conventions: north +lat, south -lat, east +lng, west -lng, exact distance', () => {
  const p = { lat: 19.076, lng: 72.8777 };
  const n = offsetLatLng(p, 80, 0);
  const s = offsetLatLng(p, -80, 0);
  const e = offsetLatLng(p, 0, 80);
  const w = offsetLatLng(p, 0, -80);
  assert.ok(n.lat > p.lat && n.lng === p.lng);
  assert.ok(s.lat < p.lat && s.lng === p.lng);
  assert.ok(e.lng > p.lng && e.lat === p.lat);
  assert.ok(w.lng < p.lng && w.lat === p.lat);
  for (const q of [n, s, e, w]) assert.ok(Math.abs(haversineM(p, q) - 80) < 0.5);
  // Also correct at high latitude where longitude degrees shrink.
  const hi = { lat: 60, lng: 10 };
  assert.ok(Math.abs(haversineM(hi, offsetLatLng(hi, 0, 160)) - 160) < 1);
});

// Mirrors the stage planting in app/debug.tsx and a GPS source that replays its last fix on subscribe.
test('planted stage 1 at the user clears through the watcher (replay on subscribe), not manually', async () => {
  const here: LatLng = { lat: 12.9716, lng: 77.5946 };
  const stages = [0, 1, 2].map((i) => {
    const at = offsetLatLng(here, 80 * i, 0);
    return { ...mockStages[i], lat: at.lat, lng: at.lng, radius_m: 30, points: i === 2 ? 300 : 100 };
  });
  const backend = createMockBackend({ odyssey: { ...mockOdyssey, current_stage_order: 1 }, stages });
  const listeners = new Set<PositionListener>();
  let last: LatLng | null = here;
  const source: LocationSource = {
    subscribe(l) {
      listeners.add(l);
      if (last !== null) l(last);
      return () => void listeners.delete(l);
    },
    getLast: () => last,
  };
  const results: string[] = [];
  const stop = startArrivalWatcher({
    source,
    backend,
    odysseyId: mockOdyssey.id,
    memberId: mockMembers[0].id,
    onResult: (r) => results.push(r.status),
  });
  await flush();
  assert.deepEqual(results, ['cleared']);
  assert.equal((await backend.getOdyssey(mockOdyssey.id)).current_stage_order, 2);
  // Walk to stage 2, 80 m north.
  last = offsetLatLng(here, 80, 0);
  listeners.forEach((l) => l(last as LatLng));
  await flush();
  assert.deepEqual(results, ['cleared', 'cleared']);
  stop();
});
