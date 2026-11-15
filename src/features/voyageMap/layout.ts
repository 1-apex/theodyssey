// One coordinate system for the whole treasure map: pixels, origin at the top-left of the map.
// The route line, the stop markers, the fog patches and the ship are all placed from these
// points, so the line always passes through the markers.

export interface Point {
  x: number;
  y: number;
}

export interface MapLayout {
  width: number;
  height: number;
  /** Where the voyage starts, near the bottom. */
  harbour: Point;
  /** One per stage, index 0 = stage 1 ... last = Ithaca, bottom to top. */
  stops: Point[];
  /** Width reserved for a place name under a marker. */
  labelWidth: number;
  /** The corner the compass rose goes in: the side away from the final stop. */
  compassSide: 'left' | 'right';
}

/** Space above the final stop (scroll roll, border, room for its marker) and below the harbour. */
export const TOP_PAD = 108;
export const BOTTOM_PAD = 128;

// Alternate sides, with a little variety so it reads as a drawn route and not a ruler line.
const ZIGZAG = [0.7, 0.3, 0.66, 0.34, 0.71, 0.29, 0.65, 0.35];

/** Positions for any number of stages (designed for 3 to 8). */
export function mapLayout(width: number, total: number): MapLayout {
  const n = Math.max(1, Math.floor(total));
  const gap = Math.min(170, Math.max(112, width * 0.44));
  const height = Math.round(TOP_PAD + BOTTOM_PAD + n * gap);
  const harbour = { x: width / 2, y: height - BOTTOM_PAD };
  // Keeps x within 30%..70% of the width: with the label width below, names stay clear of the torn edges.
  const stops = Array.from({ length: n }, (_, i) => ({
    x: Math.round(width * ZIGZAG[i % ZIGZAG.length]),
    y: Math.round(harbour.y - (i + 1) * gap),
  }));
  const labelWidth = Math.round(Math.min(116, width * 0.34));
  const last = stops[n - 1];
  return { width, height, harbour, stops, labelWidth, compassSide: last.x < width / 2 ? 'right' : 'left' };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** How long the ship takes to sail a leg of this many map pixels: slow and smooth, 2.5 to 4 seconds. */
export function sailDurationMs(legLength: number): number {
  return Math.round(Math.min(4000, Math.max(2500, 1800 + legLength * 8)));
}

/** Point `t` (0..1) of the way from a to b. */
export function along(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Shortest distance from p to the segment a-b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (len2 === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2));
  return distance(p, along(a, b, t));
}

/** Small deterministic random numbers, so the parchment looks the same on every render and device. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
