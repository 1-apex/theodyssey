// The chart itself: aged parchment with torn side edges, a wooden roll at the top and bottom,
// a double ink border, a compass rose and a few ink doodles. One SVG in map pixels.

import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { fonts } from '@/theme/typography';
import { distance, distanceToSegment, seeded, type MapLayout, type Point } from './layout';
import { COMPASS_ROWS, INK, markPalette, ROCK_ROWS, SERPENT_ROWS, spriteSize } from './pixelArt';

const ROLL_H = 30;
const PAPER_TOP = 18;
const STEP = 6;

/** Stepped (pixel) torn edge: x offsets in from the map side, one per band of STEP pixels. */
function edgeOffsets(bands: number, rand: () => number): number[] {
  const out: number[] = [];
  let e = 9;
  for (let i = 0; i < bands; i++) {
    e += Math.round((rand() - 0.5) * 6 / 2) * 2;
    if (rand() < 0.08) e += rand() < 0.5 ? -6 : 6; // an occasional bigger tear
    e = Math.max(5, Math.min(17, e));
    out.push(e);
  }
  return out;
}

function paperPath(width: number, left: number[], right: number[]): string {
  const y0 = PAPER_TOP;
  let d = `M${left[0]} ${y0}`;
  left.forEach((x, i) => {
    d += `H${x}V${y0 + (i + 1) * STEP}`;
  });
  d += `H${width - right[right.length - 1]}`;
  for (let i = right.length - 1; i >= 0; i--) {
    d += `H${width - right[i]}V${y0 + i * STEP}`;
  }
  return `${d}Z`;
}

function notched(x0: number, y0: number, x1: number, y1: number, n: number): string {
  return `M${x0 + n} ${y0}H${x1 - n}V${y0 + n}H${x1}V${y1 - n}H${x1 - n}V${y1}H${x0 + n}V${y1 - n}H${x0}V${y0 + n}H${x0 + n}Z`;
}

function Roll({ y, width }: { y: number; width: number }) {
  const bands: [number, number, string][] = [
    [0, 2, INK],
    [2, 6, '#b98a55'],
    [8, 6, '#9a6a3a'],
    [14, 7, '#7e532b'],
    [21, 5, '#5d3a1d'],
    [26, 2, INK],
  ];
  return (
    <G>
      {bands.map(([dy, h, fill]) => (
        <Rect key={dy} x={10} y={y + dy} width={width - 20} height={h} fill={fill} />
      ))}
      {/* the rolled edge of the paper at the ends of the bar */}
      <Rect x={14} y={y + 8} width={2} height={14} fill="#a98558" />
      <Rect x={width - 16} y={y + 8} width={2} height={14} fill="#a98558" />
      {[0, width - 14].map((x) => (
        <G key={x}>
          <Rect x={x} y={y - 4} width={14} height={ROLL_H + 8} fill={INK} />
          <Rect x={x + 2} y={y - 2} width={10} height={ROLL_H + 4} fill="#c28b2a" />
          <Rect x={x + 2} y={y - 2} width={4} height={ROLL_H + 4} fill="#f0bb3b" />
          <Rect x={x + 8} y={y + 2} width={4} height={ROLL_H - 4} fill="#8a5a08" />
          <Rect x={x + 5} y={y + 11} width={4} height={8} fill="#6a4225" />
        </G>
      ))}
    </G>
  );
}

interface Doodle {
  kind: 'serpent' | 'rock' | 'wave';
  x: number;
  y: number;
}

function placeDoodles(layout: MapLayout, route: Point[], compass: { x: number; y: number; size: number }): Doodle[] {
  const rand = seeded(Math.round(layout.width * 31 + layout.height));
  const out: Doodle[] = [];
  const marks = [layout.harbour, ...layout.stops];
  const clear = (p: Point, farFromStops: number, farFromLine: number, other: number): boolean => {
    if (p.x < 40 || p.x > layout.width - 40 || p.y < 84 || p.y > layout.height - 78) return false;
    if (marks.some((m) => distance(m, { x: p.x, y: p.y }) < farFromStops)) return false;
    for (let i = 1; i < route.length; i++) if (distanceToSegment(p, route[i - 1], route[i]) < farFromLine) return false;
    if (p.x > compass.x - 24 && p.x < compass.x + compass.size + 24 && p.y > compass.y - 24 && p.y < compass.y + compass.size + 24) return false;
    return !out.some((o) => distance(o, p) < other);
  };
  const want: [Doodle['kind'], number, number, number, number][] = [
    ['serpent', 2, 74, 40, 90],
    ['rock', 3, 66, 34, 60],
    ['wave', Math.round(layout.height / 38), 52, 26, 36],
  ];
  for (const [kind, count, farStops, farLine, other] of want) {
    let tries = 0;
    let placed = 0;
    while (placed < count && tries < 400) {
      tries++;
      const p = { x: 44 + rand() * (layout.width - 88), y: 90 + rand() * (layout.height - 170) };
      if (clear(p, farStops, farLine, other)) {
        out.push({ kind, ...p });
        placed++;
      }
    }
  }
  return out;
}

function Sprite({ rows, x, y, size, opacity }: { rows: readonly string[]; x: number; y: number; size: number; opacity: number }) {
  const cells: React.ReactElement[] = [];
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      if (row[rx] === '.') continue;
      cells.push(<Rect key={`${rx}-${ry}`} x={x + rx * size} y={y + ry * size} width={size + 0.2} height={size + 0.2} fill={markPalette[row[rx]] ?? INK} />);
    }
  });
  return <G opacity={opacity}>{cells}</G>;
}

function MapParchmentView({ layout }: { layout: MapLayout }) {
  const { width, height } = layout;
  const art = useMemo(() => {
    const rand = seeded(width * 7 + height);
    const bands = Math.floor((height - PAPER_TOP * 2) / STEP);
    const left = edgeOffsets(bands, rand);
    const right = edgeOffsets(bands, rand);
    const paper = paperPath(width, left, right);

    const blotches: { x: number; y: number; fill: string; o: number }[] = [];
    const palette: [string, number][] = [
      ['#d9c099', 0.55],
      ['#c9a56a', 0.28],
      ['#f5ebce', 0.3],
      ['#cfae72', 0.22],
    ];
    const count = Math.round((width * height) / 5200);
    for (let i = 0; i < count; i++) {
      let x = 20 + rand() * (width - 40);
      let y = 30 + rand() * (height - 60);
      const [fill, o] = palette[Math.floor(rand() * palette.length)];
      const cells = 4 + Math.floor(rand() * 11);
      for (let k = 0; k < cells; k++) {
        blotches.push({ x: Math.round(x / 6) * 6, y: Math.round(y / 6) * 6, fill, o });
        x += (Math.floor(rand() * 3) - 1) * 6;
        y += (Math.floor(rand() * 3) - 1) * 6;
      }
    }
    const grain: { x: number; y: number; fill: string; o: number }[] = [];
    const specks = Math.round((width * height) / 650);
    for (let i = 0; i < specks; i++) {
      const dark = rand() < 0.72;
      grain.push({
        x: Math.round(14 + rand() * (width - 28)),
        y: Math.round(24 + rand() * (height - 48)),
        fill: dark ? '#6a4225' : '#fff6dc',
        o: dark ? 0.1 + rand() * 0.18 : 0.3,
      });
    }

    const route = [layout.harbour, ...layout.stops];
    const compassSize = 15 * 4;
    const compass = {
      x: layout.compassSide === 'left' ? 40 : width - 40 - compassSize,
      y: 78,
      size: compassSize,
    };
    const doodles = placeDoodles(layout, route, compass);
    return { paper, blotches, grain, compass, doodles };
  }, [layout, width, height]);

  const top = PAPER_TOP + 30;
  const bottom = height - PAPER_TOP - 30;
  const wave = (d: Doodle) => `M${d.x} ${d.y}l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3`;
  const serpentSize = spriteSize(SERPENT_ROWS, 3, false);
  const rockSize = spriteSize(ROCK_ROWS, 3, false);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        {/* shadow of the sheet on the table */}
        <Path d={art.paper} fill="#021630" opacity={0.5} transform="translate(4 5)" />
        <Path d={art.paper} fill="#e8d4a2" />
        {art.blotches.map((b, i) => (
          <Rect key={`b${i}`} x={b.x} y={b.y} width={6} height={6} fill={b.fill} opacity={b.o} />
        ))}
        {art.grain.map((g, i) => (
          <Rect key={`g${i}`} x={g.x} y={g.y} width={2} height={2} fill={g.fill} opacity={g.o} />
        ))}
        {/* burnt, torn rim */}
        <Path d={art.paper} fill="none" stroke="#9c7440" strokeWidth={3} opacity={0.85} />
        <Path d={art.paper} fill="none" stroke="#c9a56a" strokeWidth={3} opacity={0.5} transform="translate(0 0)" strokeDasharray="6 6" />

        {/* double ink border */}
        <Path d={notched(26, top, width - 26, bottom, 8)} fill="none" stroke={INK} strokeWidth={2} opacity={0.75} />
        <Path d={notched(31, top + 5, width - 31, bottom - 5, 6)} fill="none" stroke={INK} strokeWidth={1} opacity={0.6} />

        {/* doodles */}
        {art.doodles.map((d, i) =>
          d.kind === 'wave' ? (
            <Path key={i} d={wave(d)} stroke={INK} strokeWidth={2} fill="none" opacity={0.42} />
          ) : d.kind === 'serpent' ? (
            <Sprite key={i} rows={SERPENT_ROWS} x={d.x - serpentSize.width / 2} y={d.y} size={3} opacity={0.6} />
          ) : (
            <Sprite key={i} rows={ROCK_ROWS} x={d.x - rockSize.width / 2} y={d.y} size={3} opacity={0.6} />
          ),
        )}
        <Sprite rows={COMPASS_ROWS} x={art.compass.x} y={art.compass.y} size={4} opacity={0.85} />

        {/* shadows under the rolls, then the rolls */}
        <Rect x={16} y={ROLL_H - 2} width={width - 32} height={8} fill={INK} opacity={0.3} />
        <Rect x={16} y={ROLL_H + 6} width={width - 32} height={6} fill={INK} opacity={0.14} />
        <Rect x={16} y={height - ROLL_H - 8} width={width - 32} height={8} fill={INK} opacity={0.3} />
        <Rect x={16} y={height - ROLL_H - 14} width={width - 32} height={6} fill={INK} opacity={0.14} />
        <Roll y={0} width={width} />
        <Roll y={height - ROLL_H} width={width} />
      </Svg>
      <Text
        style={[
          styles.north,
          { left: art.compass.x + art.compass.size / 2 - 5, top: art.compass.y - 15 },
        ]}
      >
        N
      </Text>
    </View>
  );
}

export const MapParchment = memo(MapParchmentView);

const styles = StyleSheet.create({
  north: { position: 'absolute', fontFamily: fonts.numeral, fontSize: 13, lineHeight: 14, color: INK, width: 12, textAlign: 'center' },
});
