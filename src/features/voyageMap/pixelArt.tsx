// Small pixel-art helpers for the treasure map: sprites drawn from text rows, with an optional
// ink outline so they stand out on parchment, and a few generated shapes (compass, diamond).

import { memo } from 'react';
import Svg, { Rect } from 'react-native-svg';

import { colors, pixels } from '@/components/PixelSprite';

export const INK = colors.ink;
export const RED = '#a83a1f';

export type Palette = Record<string, string>;

export interface SpriteProps {
  rows: readonly string[];
  palette: Palette;
  /** Screen pixels per sprite pixel. */
  size: number;
  /** Draw a one-pixel ink outline around the shape (the sprite grows by one pixel on each side). */
  outline?: boolean;
  opacity?: number;
  label?: string;
}

/** Outer size in screen pixels of a sprite drawn with these rows. */
export function spriteSize(rows: readonly string[], size: number, outline: boolean): { width: number; height: number } {
  const pad = outline ? 2 : 0;
  return { width: (rows[0].length + pad) * size, height: (rows.length + pad) * size };
}

function AsciiSpriteView({ rows, palette, size, outline = false, opacity = 1, label }: SpriteProps) {
  const pad = outline ? 1 : 0;
  const cols = rows[0].length;
  const filled = (x: number, y: number): boolean => y >= 0 && y < rows.length && x >= 0 && x < cols && rows[y][x] !== '.';
  const cells: React.ReactElement[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < cols; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      cells.push(<Rect key={`${x}-${y}`} x={x + pad} y={y + pad} width={1.02} height={1.02} fill={palette[ch] ?? 'transparent'} />);
    }
  });
  const edge: React.ReactElement[] = [];
  if (outline) {
    for (let y = -1; y <= rows.length; y++) {
      for (let x = -1; x <= cols; x++) {
        if (filled(x, y)) continue;
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
          edge.push(<Rect key={`o${x}-${y}`} x={x + pad} y={y + pad} width={1.02} height={1.02} fill={INK} />);
        }
      }
    }
  }
  const { width, height } = spriteSize(rows, size, outline);
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${cols + pad * 2} ${rows.length + pad * 2}`}
      opacity={opacity}
      accessible={label !== undefined}
      accessibilityLabel={label}
    >
      {edge}
      {cells}
    </Svg>
  );
}
export const AsciiSprite = memo(AsciiSpriteView);

/** The app's sprite palette (island, ship, temple). */
export const spritePalette: Palette = pixels.palette;
export const ISLAND_ROWS: readonly string[] = pixels.ISLAND;
export const ITHACA_ROWS: readonly string[] = pixels.ITHACA;
export const SHIP_ROWS: readonly string[] = pixels.SHIP;

const MAP_INK: Palette = { k: INK, r: RED, g: '#c28b2a', G: '#f0bb3b', w: '#6a4225', t: '#8a6a3a' };

/** A red "X marks the spot". */
export const X_ROWS = [
  'rr.....rr',
  'rrr...rrr',
  '.rrr.rrr.',
  '..rrrrr..',
  '...rrr...',
  '..rrrrr..',
  '.rrr.rrr.',
  'rrr...rrr',
  'rr.....rr',
] as const;

/** A flag on a pole, planted on cleared stops. */
export const FLAG_ROWS = ['kRRR..', 'kRRRR.', 'kRRR..', 'k.....', 'k.....', 'k.....'] as const;

export const SERPENT_ROWS = [
  '...kk.......kk......',
  '..kkkk.....kkkk...k.',
  '..kk.kk...kk..kk.kk.',
  '.kk...kk.kk....kkk..',
  'kk.....kkk..........',
] as const;

export const ROCK_ROWS = ['...kk...', '..kttk..', '.kttttk.', 'kttttttk', 'kkkkkkkk'] as const;

export const markPalette: Palette = { ...MAP_INK, R: RED };

/** Faded sepia fog patch for stages the Crew has not discovered (same silhouette as the app's cloud). */
export const FOG_PALETTE: Palette = { o: '#7b6247', H: '#efe4c6', L: '#d6c398', S: '#b39a6c' };

function compassRows(): string[] {
  const n = 15;
  const c = 7;
  const rows: string[] = [];
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      let ch = '.';
      if (d >= 5.6 && d <= 6.6 && (x + y) % 2 === 0) ch = 't';
      const arm = (a: number, b: number): boolean => Math.abs(a) <= (7 - Math.abs(b)) / 3.4;
      if (dy < 0 && arm(dx, dy)) ch = 'r';
      else if ((dy > 0 && arm(dx, dy)) || (dx !== 0 && Math.abs(dy) <= (7 - Math.abs(dx)) / 3.4)) ch = 'k';
      else if (Math.abs(dx) === Math.abs(dy) && Math.abs(dx) <= 3 && dx !== 0) ch = 't';
      if (dx === 0 && dy === 0) ch = 'G';
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}
export const COMPASS_ROWS = compassRows();

/** A faceted gold lozenge with an engraved inner pattern, for the progress marker. */
function diamondRows(): string[] {
  const n = 15;
  const c = 7;
  const rows: string[] = [];
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) {
      const dx = x - c;
      const dy = y - c;
      const m = Math.abs(dx) + Math.abs(dy);
      let ch = '.';
      if (m <= 7) {
        if (m === 7) ch = 'k';
        else if (m === 6) ch = dx + dy <= 0 ? 'L' : 'd';
        else if (m === 4 || (m === 2 && dx !== 0 && dy !== 0)) ch = 'e';
        else if (m === 0) ch = 'e';
        else ch = dx < 0 && dy < 0 ? 'L' : dx > 0 && dy > 0 ? 'd' : 'G';
      }
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}
export const DIAMOND_ROWS = diamondRows();
export const DIAMOND_PALETTE: Palette = { k: INK, L: '#ffe39a', G: '#f0bb3b', d: '#b17000', e: '#7a4c08' };
