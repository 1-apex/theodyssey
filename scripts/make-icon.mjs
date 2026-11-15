// Regenerates the app icon: one 32x32 pixel grid -> SVG masters + PNGs (no image library needed).
// Run: node scripts/make-icon.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 32;
const COL = { S: '#ab6c0c', N: '#001c33', B: '#1f6fa8', G: '#f2c14e', D: '#ab6c0c', P: '#fff3d0' };
const OFFSET = 6; // art is 20x20 at cells 6..25: inside the central 66% (cells 5.4..26.6) Android keeps

const ART = [
  '...PP...............',
  '..PPPP..............',
  '..PPPP..............',
  '...PP...D...........',
  '........D...........',
  '...DDDDDDDDDDD......',
  '....GGGGGGGGG.......',
  '....SSSSSSSSS.......',
  '....GGGGGGGGG...DD..',
  '....GGGGGGGGG....DD.',
  '....SSSSSSSSS.....DD',
  '.DD.GGGGGGGGGG....DD',
  'DD..GGGGGGGGGG....DD',
  'DD......D.........DD',
  'DDDDDDDDDDDDDDDDDDDD',
  '.DDPPPPPPPPPPPDDPDD.',
  'BB.DDDBBDDDDBBDDD.BB',
  'BBBBBBBBBBBBBBBBBBBB',
].map((r) => r.padEnd(20, '.').slice(0, 20));

const STARS = [[3, 5], [27, 10], [15, 5], [23, 4], [4, 16], [28, 19], [9, 28], [25, 28], [2, 25]];

/** Cell grid: char per cell ('.' = empty). `bg` fills empty cells with navy and adds stars. */
function grid({ bg, mono }) {
  const g = Array.from({ length: N }, () => Array(N).fill(bg ? 'N' : '.'));
  ART.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.' && !(mono && (c === 'P' || c === 'S'))) g[y + OFFSET][x + OFFSET] = mono ? 'M' : c; })); // mono: no sun, eye holes in the hull
  if (bg) for (const [x, y] of STARS) g[y][x] = 'P';
  return g;
}
const color = (c) => (c === 'M' ? '#000000' : COL[c]);

function svg(g, withBg) {
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">\n`;
  g.forEach((row, y) => {
    for (let x = 0; x < N; ) {
      const c = row[x];
      let e = x; while (e < N && row[e] === c) e++;
      if (c !== '.' && !(c === 'N' && withBg === 'bgrect')) out += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${color(c)}"/>\n`;
      x = e;
    }
  });
  return out + '</svg>\n';
}

const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };

/** Nearest-neighbour render of the grid at size x size, RGBA PNG. Optional inner scale for the splash. */
function png(g, size, opaque) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = g[Math.floor((y * N) / size)][Math.floor((x * N) / size)];
    const o = (y * size + x) * 4;
    if (c === '.') continue;
    const h = color(c);
    rgba[o] = parseInt(h.slice(1, 3), 16); rgba[o + 1] = parseInt(h.slice(3, 5), 16); rgba[o + 2] = parseInt(h.slice(5, 7), 16); rgba[o + 3] = 255;
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const dir = new URL('../assets/images/', import.meta.url).pathname;
const full = grid({ bg: true }), fg = grid({ bg: false }), mono = grid({ bg: false, mono: true });
const w = (f, d) => writeFileSync(dir + f, d);
w('icon.svg', svg(full)); w('android-icon-foreground.svg', svg(fg)); w('android-icon-monochrome.svg', svg(mono));
w('icon.png', png(full, 1024)); w('android-icon-foreground.png', png(fg, 1024)); w('android-icon-monochrome.png', png(mono, 1024));
w('favicon.png', png(full, 48)); w('splash-icon.png', png(fg, 1024));
console.log('icon written');
