/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatMiles, metresToMiles } from './distance';

test('converts metres to miles', () => {
  assert.ok(Math.abs(metresToMiles(1609.344) - 1) < 1e-9);
  assert.ok(Math.abs(metresToMiles(100_000) - 62.1371) < 1e-3);
});

test('under ten miles shows one decimal', () => {
  assert.equal(formatMiles(0), '0.0 mi');
  assert.equal(formatMiles(10_300), '6.4 mi');
  assert.equal(formatMiles(160.9344), '0.1 mi');
});

test('ten miles and over shows whole miles', () => {
  assert.equal(formatMiles(16_093.44), '10 mi');
  assert.equal(formatMiles(101_000), '63 mi');
});

test('does not show "10.0 mi" at the rounding boundary', () => {
  assert.equal(formatMiles(9.96 * 1609.344), '10 mi');
});

test('adds thousands separators', () => {
  assert.equal(formatMiles(1_204 * 1609.344), '1,204 mi');
  assert.equal(formatMiles(12_345_678), '7,671 mi');
});

test('negative or invalid input is zero', () => {
  assert.equal(formatMiles(-5), '0.0 mi');
  assert.equal(formatMiles(Number.NaN), '0 mi');
});
