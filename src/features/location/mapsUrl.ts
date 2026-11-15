// Pure URL building for "open this place in maps", kept apart from Linking so it can be unit tested.

import type { LatLng, Stage } from '../../lib/types';

/**
 * The search URL that opens the place card (with Directions) for a stage.
 * The real place name is used, not coordinates, so the maps app shows the place itself.
 * Coordinates are only a fallback when the name is empty.
 */
export function mapsPlaceUrl(stage: Pick<Stage, 'name'> & Partial<LatLng>): string {
  const name = stage.name.trim();
  if (name !== '') return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  return `https://www.google.com/maps/search/?api=1&query=${stage.lat ?? 0},${stage.lng ?? 0}`;
}
