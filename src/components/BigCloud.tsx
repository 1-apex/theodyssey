// The cloud sprite as horizontal runs of one colour (about 60 rects, not 400).
// Memoised so a cloud is drawn once and then only moved with transforms.

import { memo } from 'react';
import Svg, { Rect } from 'react-native-svg';

import { CLOUD_ROWS } from './PixelCloud';

// Web-only SVG hint (not in the native typings): stops hairline seams between rows.
const CRISP = { shapeRendering: 'crispEdges' } as object;
export const CLOUD_COLS = 33;
export const CLOUD_ROW_COUNT = 18;
const palette: Record<string, string> = { o: '#3b5276', H: '#f2f4dc', L: '#b9d6dc', S: '#7da1bc' };

const RUNS = CLOUD_ROWS.flatMap((row, y) => {
  const runs: { x: number; y: number; w: number; fill: string }[] = [];
  let x = 0;
  while (x < row.length) {
    const ch = row[x];
    let end = x + 1;
    while (end < row.length && row[end] === ch) end++;
    if (ch !== '.') runs.push({ x, y, w: end - x, fill: palette[ch] });
    x = end;
  }
  return runs;
});

export const BigCloud = memo(function BigCloud({ width }: { width: number }) {
  return (
    <Svg width={width} height={(width * CLOUD_ROW_COUNT) / CLOUD_COLS} viewBox={`0 0 ${CLOUD_COLS} ${CLOUD_ROW_COUNT}`}>
      {RUNS.map((r) => (
        <Rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1.02} fill={r.fill} {...CRISP} />
      ))}
    </Svg>
  );
});
