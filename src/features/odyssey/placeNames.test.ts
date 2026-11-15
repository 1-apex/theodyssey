/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { regionOf, shortPlaceName } from './placeNames';

test('splits at the first comma only', () => {
  assert.equal(shortPlaceName('Czech Stop, West, TX'), 'Czech Stop');
  assert.equal(regionOf('Czech Stop, West, TX'), 'West, TX');
});

test('a name without a comma is all short name and has no region', () => {
  assert.equal(shortPlaceName('Waco'), 'Waco');
  assert.equal(regionOf('Waco'), '');
});

test('trims whitespace and keeps punctuation inside the place', () => {
  assert.equal(shortPlaceName("  Buc-ee's , Temple TX "), "Buc-ee's");
  assert.equal(regionOf("Buc-ee's , Temple TX "), 'Temple TX');
});

test('a leading comma does not produce an empty label', () => {
  assert.equal(shortPlaceName(', TX'), ', TX');
  assert.equal(shortPlaceName(''), '');
});
