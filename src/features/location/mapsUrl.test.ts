/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mapsPlaceUrl } from './mapsUrl';

test('opens the place by its full real name, url-encoded', () => {
  assert.equal(
    mapsPlaceUrl({ name: 'Czech Stop, West, TX', lat: 31.8, lng: -97.1 }),
    'https://www.google.com/maps/search/?api=1&query=Czech%20Stop%2C%20West%2C%20TX',
  );
});

test('encodes characters that would break the query', () => {
  const url = mapsPlaceUrl({ name: "Buc-ee's & Sons #1, Temple TX", lat: 1, lng: 2 });
  assert.ok(url.endsWith('query=Buc-ee\'s%20%26%20Sons%20%231%2C%20Temple%20TX'));
});

test('does not put coordinates in the url when there is a name', () => {
  assert.ok(!mapsPlaceUrl({ name: 'Waco, TX', lat: 31.55, lng: -97.14 }).includes('31.55'));
});

test('falls back to coordinates only when the name is empty', () => {
  assert.equal(mapsPlaceUrl({ name: '  ', lat: 31.5, lng: -97.1 }), 'https://www.google.com/maps/search/?api=1&query=31.5,-97.1');
});
