import type { LatLng, Stage } from './types';

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** True when the position is inside the stage's clear radius. */
export function isWithinStage(pos: LatLng, stage: Pick<Stage, 'lat' | 'lng' | 'radius_m'>): boolean {
  return haversineM(pos, stage) <= stage.radius_m;
}

/** Point a fraction `t` (0..1) of the way from `a` to `b`. Good enough for simulate mode. Not valid across the antimeridian. */
export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Point `northM` metres north and `eastM` metres east of `pos` (negative for south/west). Flat-earth approximation. Not valid at the poles. */
export function offsetLatLng(pos: LatLng, northM: number, eastM: number): LatLng {
  const dLat = northM / EARTH_RADIUS_M;
  const dLng = eastM / (EARTH_RADIUS_M * Math.cos(toRad(pos.lat)));
  const lng = pos.lng + (dLng * 180) / Math.PI;
  // Wrap into [-180, 180].
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  return { lat: pos.lat + (dLat * 180) / Math.PI, lng: wrapped };
}
