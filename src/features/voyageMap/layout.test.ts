/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { distance, mapLayout, sailDurationMs, seeded, TOP_PAD } from './layout';

for (const width of [276, 326, 416]) {
  for (let total = 3; total <= 8; total++) {
    test(`layout ${total} stages at ${width}px: bottom to top, inside the map, labels clear of the edges`, () => {
      const l = mapLayout(width, total);
      assert.equal(l.stops.length, total);
      assert.ok(l.harbour.y > l.stops[0].y);
      for (let i = 1; i < total; i++) assert.ok(l.stops[i].y < l.stops[i - 1].y, 'each stage is higher than the last');
      assert.equal(l.stops[total - 1].y, TOP_PAD);
      for (const p of l.stops) {
        assert.ok(p.x - l.labelWidth / 2 >= 30, `label left of ${p.x} too close to the edge`);
        assert.ok(p.x + l.labelWidth / 2 <= width - 30, `label right of ${p.x} too close to the edge`);
      }
      assert.ok(l.height > l.harbour.y);
    });
  }
}

test('the map gets taller with more stages and wider screens', () => {
  assert.ok(mapLayout(326, 8).height > mapLayout(326, 3).height);
  assert.ok(mapLayout(416, 5).height >= mapLayout(276, 5).height);
});

test('the compass goes on the side away from the final stop', () => {
  const l = mapLayout(326, 4); // stage 4 is on the left
  assert.equal(l.compassSide, 'right');
  assert.equal(mapLayout(326, 3).compassSide, 'left'); // stage 3 is on the right
});

test('sailing takes 2.5 to 4 seconds and longer legs take longer', () => {
  assert.equal(sailDurationMs(10), 2500);
  assert.equal(sailDurationMs(1000), 4000);
  assert.ok(sailDurationMs(180) > sailDurationMs(120));
  const l = mapLayout(326, 5);
  const d = sailDurationMs(distance(l.harbour, l.stops[0]));
  assert.ok(d >= 2500 && d <= 4000);
});

test('seeded random is repeatable', () => {
  const a = seeded(7);
  const b = seeded(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});
