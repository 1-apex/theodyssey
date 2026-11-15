import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import {
  bboxAround,
  chooseStageCount,
  consultOracle,
  dropCoincident,
  FLIGHT_RADIUS_KM,
  haversineKm,
  ITHACA_BONUS,
  mapLimit,
  parseDays,
  pointsForStops,
  realName,
  stagePoints,
  stagesForKm,
  trimIndices,
  wishedStages,
} from './oracle.ts';

test('stagePoints: a short leg floors at 50', () => {
  assert.equal(stagePoints(0, false), 50);
  assert.equal(stagePoints(10, false), 50); // 46 -> 50
  assert.equal(stagePoints(-5, false), 50);
});

test('stagePoints: a long leg caps at 400', () => {
  assert.equal(stagePoints(600, false), 400); // 400 exactly
  assert.equal(stagePoints(5000, false), 400);
});

test('stagePoints: rounds to the nearest 10', () => {
  assert.equal(stagePoints(100, false), 100); // 40 + 60
  assert.equal(stagePoints(112, false), 110); // 107.2 -> 110
  assert.equal(stagePoints(108, false), 100); // 104.8 -> 100
  assert.equal(stagePoints(200, false), 160); // 160
  assert.equal(stagePoints(200, false) % 10, 0);
});

test('stagePoints: Ithaca adds a 150 bonus on top of the (clamped) leg points', () => {
  assert.equal(ITHACA_BONUS, 150);
  assert.equal(stagePoints(100, true), 250);
  assert.equal(stagePoints(1, true), 200);
  assert.equal(stagePoints(5000, true), 550);
});

const A = { lat: 32.7357, lng: -97.108 }; // Arlington
const B = { lat: 31.1171, lng: -97.7278 }; // Temple-ish, ~190 km
const C = { lat: 30.2, lng: -103.24 };
const D = { lat: 29.25, lng: -103.25 };

test('a longer trip totals more than a shorter one', () => {
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const short = total(pointsForStops(A, [B, { lat: 31.0, lng: -97.8 }, { lat: 30.9, lng: -97.9 }]));
  const long = total(pointsForStops(A, [B, C, D]));
  assert.ok(long > short, `${long} > ${short}`);
});

test('pointsForStops: legs run from the previous stop, last stop gets the bonus', () => {
  const pts = pointsForStops(A, [B, C, D]);
  assert.equal(pts[0], stagePoints(haversineKm(A, B), false));
  assert.equal(pts[1], stagePoints(haversineKm(B, C), false));
  assert.equal(pts[2], stagePoints(haversineKm(C, D), true));
});

test('flight mode ignores the flight leg: origin is the destination centre', () => {
  const tokyo = { lat: 35.6762, lng: 139.6503 };
  const senso = { lat: 35.7148, lng: 139.7967 };
  const dallas = { lat: 32.7767, lng: -96.797 };
  const fromDest = pointsForStops(tokyo, [senso, tokyo]);
  const fromStart = pointsForStops(dallas, [senso, tokyo]);
  assert.equal(fromStart[0], 400); // the 10,000 km flight would have paid the cap
  assert.ok(fromDest[0] < 100, String(fromDest[0]));
});

test('realName: real place first, then region, no stray commas, no duplicate region', () => {
  assert.equal(realName({ place_name: 'Czech Stop', city_region: 'West, TX' }), 'Czech Stop, West, TX');
  assert.equal(realName({ place_name: 'Buc-ee\'s, Temple', city_region: 'TX' }), 'Buc-ee\'s Temple, TX');
  assert.equal(realName({ place_name: 'Tokyo Tower', city_region: '' }), 'Tokyo Tower');
  assert.equal(realName({ place_name: 'Big Bend National Park TX', city_region: 'TX' }), 'Big Bend National Park TX');
});

// ---- the flight pipeline against a mock LLM + geocoder ----

const PLACES: Record<string, [number, number]> = {
  'Dallas, TX': [-96.797, 32.7767],
  'Tokyo': [139.6503, 35.6762],
  'Senso-ji, Asakusa, Tokyo': [139.7967, 35.7148],
  'Meiji Shrine, Shibuya, Tokyo': [139.6993, 35.6764],
  'Tsukiji Outer Market, Chuo, Tokyo': [139.7708, 35.6655],
  'Tokyo Tower, Minato, Tokyo': [139.7454, 35.6586],
  'Wrong Tokyo Cafe, Tokyo': [-0.1276, 51.5072], // London: outlier
};

async function mock(stageNames: [string, string][]) {
  const requests: { system: string; input: string }[] = [];
  const server = createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/v1beta/interactions') {
        const j = JSON.parse(b);
        requests.push({ system: j.system_instruction, input: j.input });
        const stages = stageNames.map(([p, r], i) => ({ order: i + 1, place_name: p, city_region: r, title: 'Isle', lore: 'Lore ꗬ', why: 'w' }));
        res.end(JSON.stringify({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify({ title: 'T', stages }) }] }] }));
      } else {
        const c = PLACES[url.searchParams.get('q') ?? ''];
        res.end(JSON.stringify({ features: c ? [{ geometry: { coordinates: c } }] : [] }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { requests, base, close: () => server.close() };
}

test('flight: stages stay at the destination, outliers dropped, Ithaca is the last LLM place', async () => {
  const m = await mock([
    ['Meiji Shrine', 'Shibuya, Tokyo'], ['Wrong Tokyo Cafe', 'Tokyo'], ['Tsukiji Outer Market', 'Chuo, Tokyo'],
    ['Tokyo Tower', 'Minato, Tokyo'], ['Senso-ji', 'Asakusa, Tokyo'],
  ]);
  try {
    const r = await consultOracle(
      { start: 'Dallas, TX', destination: 'Tokyo', crew_size: 2, travel_style: 'temples', duration: '5 days', travel_mode: 'flight' },
      { llmApiKey: 'k', geocodingApiKey: 'k', llmBaseUrl: m.base, geocodingBaseUrl: m.base },
    );
    assert.deepEqual(r.stages.map((s) => s.name), [
      'Meiji Shrine, Shibuya, Tokyo', 'Tsukiji Outer Market, Chuo, Tokyo', 'Tokyo Tower, Minato, Tokyo', 'Senso-ji, Asakusa, Tokyo',
    ]);
    assert.equal(r.dropped.length, 1);
    assert.match(r.dropped[0].reason, /km from the destination/);
    for (const s of r.stages) assert.ok(haversineKm(s, PLACES.Tokyo ? { lat: 35.6762, lng: 139.6503 } : s) <= FLIGHT_RADIUS_KM);
    assert.ok(r.stages.every((s) => s.points < 400), 'no stage is paid for the flight');
    assert.equal(r.stages[r.stages.length - 1].points, stagePoints(haversineKm(r.stages[2], r.stages[3]), true));
    assert.match(m.requests[0].system, /^You are the Oracle/);
    assert.match(m.requests[0].system, /NO stops on the way/);
    assert.match(m.requests[0].input, /direct flight/);
  } finally { m.close(); }
});

test('flight: if the last LLM place is an outlier, Ithaca falls back to the destination itself', async () => {
  const m = await mock([
    ['Meiji Shrine', 'Shibuya, Tokyo'], ['Tsukiji Outer Market', 'Chuo, Tokyo'], ['Tokyo Tower', 'Minato, Tokyo'], ['Wrong Tokyo Cafe', 'Tokyo'],
  ]);
  try {
    const r = await consultOracle(
      { start: 'Dallas, TX', destination: 'Tokyo', crew_size: 2, travel_style: 'x', duration: 'y', travel_mode: 'flight' },
      { llmApiKey: 'k', geocodingApiKey: 'k', llmBaseUrl: m.base, geocodingBaseUrl: m.base },
    );
    const last = r.stages[r.stages.length - 1];
    assert.equal(last.name, 'Tokyo');
    assert.equal(last.lat, 35.6762);
  } finally { m.close(); }
});

test('road mode is unchanged: stops on the way, Ithaca keeps the Captain wording, distance points', async () => {
  PLACES['Big Bend National Park, TX'] = [-103.25, 29.25];
  PLACES['Arlington, TX'] = [-97.108, 32.7357];
  PLACES['Buc-ee\'s, Temple, TX'] = [-97.36, 31.12];
  PLACES['Marathon Motel, Marathon, TX'] = [-103.24, 30.2];
  PLACES['Fort Stockton Diner, Fort Stockton, TX'] = [-102.88, 30.89];
  const m = await mock([
    ['Buc-ee\'s', 'Temple, TX'], ['Fort Stockton Diner', 'Fort Stockton, TX'], ['Marathon Motel', 'Marathon, TX'], ['Big Bend National Park', 'TX'],
  ]);
  try {
    const r = await consultOracle(
      { start: 'Arlington, TX', destination: 'Big Bend National Park, TX', crew_size: 2, travel_style: 'x', duration: 'y' },
      { llmApiKey: 'k', geocodingApiKey: 'k', llmBaseUrl: m.base, geocodingBaseUrl: m.base },
    );
    assert.equal(r.stages.length, 4);
    assert.equal(r.stages[0].name, 'Buc-ee\'s, Temple, TX');
    assert.equal(r.stages[3].name, 'Big Bend National Park, TX');
    assert.equal(r.stages[0].points, stagePoints(haversineKm(r.start, r.stages[0]), false));
    assert.ok(r.stages[3].points >= 50 + ITHACA_BONUS);
    assert.match(m.requests[0].system, /road trips/);
    assert.match(m.requests[0].system, /REAL, official/);
  } finally { m.close(); }
});

test('dropCoincident drops every stage that shares a spot with another (geocoder fell back to the area)', () => {
  const st = (n: string) => ({ place_name: n, city_region: '', title: '', lore: '', why: '', order: 1 });
  const c = (n: string, lat: number, lng: number) => ({ stage: st(n), lat, lng });
  const r = dropCoincident([c('A', 35.689, 139.6929), c('B', 35.7, 139.7), c('C', 35.689, 139.6929), c('D', 35.6891, 139.6929)]);
  assert.deepEqual(r.kept.map((x) => x.stage.place_name), ['B']);
  assert.deepEqual(r.dropped.map((x) => x.place), ['A', 'C', 'D']);
});

test('cleaning: field labels and foreign-script glitches are stripped from the LLM text', async () => {
  PLACES['Ginza Six, Tokyo'] = [139.7631, 35.6694];
  const m = await mock([
    ['place_name: Ginza Six', 'Tokyo'], ['Meiji Shrine', 'Shibuya, Tokyo'], ['Tsukiji Outer Market', 'Chuo, Tokyo'], ['Tokyo Tower', 'Minato, Tokyo'],
  ]);
  try {
    const r = await consultOracle(
      { start: 'Dallas, TX', destination: 'Tokyo', crew_size: 2, travel_style: 'x', duration: 'y', travel_mode: 'flight' },
      { llmApiKey: 'k', geocodingApiKey: 'k', llmBaseUrl: m.base, geocodingBaseUrl: m.base },
    );
    assert.equal(r.stages[0].name, 'Ginza Six, Tokyo');
    assert.equal(r.stages[0].lore, 'Lore');
  } finally { m.close(); }
});

test('bboxAround is a box about radius km around the point, min before max', () => {
  const [w, s, e, n] = bboxAround({ lat: 35.6762, lng: 139.6503 }, 60).split(',').map(Number);
  assert.ok(w < 139.6503 && e > 139.6503 && s < 35.6762 && n > 35.6762);
  assert.ok(Math.abs(haversineKm({ lat: s, lng: 139.6503 }, { lat: n, lng: 139.6503 }) - 120) < 2);
});

test('parseDays reads hours, days, weeks, weekends and words', () => {
  assert.equal(parseDays('2 days'), 2);
  assert.equal(parseDays('a long weekend'), 4);
  assert.equal(parseDays('a weekend'), 3);
  assert.equal(parseDays('about 2 weeks'), 14);
  assert.equal(parseDays('a week'), 7);
  assert.equal(parseDays('ten days'), 10);
  assert.equal(parseDays('a couple of days'), 2);
  assert.equal(parseDays('6 hours'), 0.25);
  assert.equal(parseDays('a day trip'), 1);
  assert.equal(parseDays('flexible'), null);
  assert.equal(parseDays(''), null);
});

test('wishedStages: explicit numbers and pace words, nothing otherwise', () => {
  assert.deepEqual(wishedStages('food; 6 stops'), { count: 6 });
  assert.deepEqual(wishedStages('about eight places please'), { count: 8 });
  assert.deepEqual(wishedStages('just a couple of stops'), { fewer: true });
  assert.deepEqual(wishedStages('a few stops, mostly food'), { fewer: true });
  assert.deepEqual(wishedStages('food and forts; lots of stops'), { more: true });
  assert.deepEqual(wishedStages('as many places as possible'), { more: true });
  assert.equal(wishedStages('scenic, food stops, no rush'), null);
  assert.equal(wishedStages(''), null);
});

test('chooseStageCount: duration and route length decide, the traveller wins, always 3 to 12', () => {
  const road = (duration: string, travel_style = '', travel_mode: 'road' | 'flight' = 'road') => ({ duration, travel_style, travel_mode });
  assert.equal(stagesForKm(20), 3);
  assert.equal(stagesForKm(100000), 12);
  const short = chooseStageCount(road('a day'), 235);
  const weekend = chooseStageCount(road('a weekend'), 560);
  const week = chooseStageCount(road('10 days'), 2000);
  assert.ok(short <= 4, `a day trip over 235 km is ${short}`);
  assert.ok(weekend >= 5 && weekend <= 7, `a weekend over 560 km is ${weekend}`);
  assert.ok(week >= 10, `ten days over 2000 km is ${week}`);
  assert.ok(short < weekend && weekend < week);
  assert.equal(chooseStageCount(road('flexible'), 0), 3, 'unknown duration and a tiny route: the route length decides');
  assert.equal(chooseStageCount(road('flexible', '', 'flight'), 0), 5, 'flight with no duration: the default');
  assert.equal(chooseStageCount(road('a week', '', 'flight'), 9000), 8, 'a flight ignores the distance');
  assert.equal(chooseStageCount(road('a weekend', '4 stops'), 560), 4);
  assert.equal(chooseStageCount(road('a day', '30 stops'), 235), 12);
  assert.equal(chooseStageCount(road('a week', 'just a couple of stops'), 800), 4);
  assert.ok(chooseStageCount(road('a weekend', 'lots of stops'), 300) >= 8);
  assert.equal(chooseStageCount(road('3 months', 'lots of stops'), 5000), 12);
});

test('trimIndices drops the most crowded interior stops and always keeps the last', () => {
  const o = { lat: 0, lng: 0 };
  const stops = [0.1, 0.2, 1, 2, 3].map((lng) => ({ lat: 0, lng })); // the first two sit close together
  assert.deepEqual(trimIndices(o, stops, 5), [0, 1, 2, 3, 4]);
  assert.deepEqual(trimIndices(o, stops, 4), [1, 2, 3, 4]);
  assert.deepEqual(trimIndices(o, stops, 3), [2, 3, 4]);
  assert.deepEqual(trimIndices(o, stops, 1), [4]);
});

test('mapLimit keeps order and never runs more than the limit at once', async () => {
  let active = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.equal(peak, 3);
  assert.deepEqual(await mapLimit([], 3, async (n: number) => n), []);
});

test('the Oracle asks for target + 2 stages, then trims to the target keeping Ithaca last', async () => {
  const m = await mock([
    ['Buc-ee\'s', 'Temple, TX'], ['Fort Stockton Diner', 'Fort Stockton, TX'], ['Marathon Motel', 'Marathon, TX'], ['Big Bend National Park', 'TX'],
  ]);
  try {
    const r = await consultOracle(
      { start: 'Arlington, TX', destination: 'Big Bend National Park, TX', crew_size: 2, travel_style: 'just a couple of stops', duration: 'a week' },
      { llmApiKey: 'k', geocodingApiKey: 'k', llmBaseUrl: m.base, geocodingBaseUrl: m.base },
    );
    assert.equal(r.plan.target, 4);
    assert.equal(r.plan.requested, 6);
    assert.match(m.requests[0].input, /Stages to return: 6/);
    assert.equal(r.stages.length, 4, 'four survived and four were wanted');
    assert.equal(r.stages[r.stages.length - 1].name, 'Big Bend National Park, TX');

    const fewer = await consultOracle(
      { start: 'Arlington, TX', destination: 'Big Bend National Park, TX', crew_size: 2, travel_style: '3 stops', duration: 'a week' },
      { llmApiKey: 'k', geocodingApiKey: 'k', llmBaseUrl: m.base, geocodingBaseUrl: m.base },
    );
    assert.equal(fewer.stages.length, 3);
    assert.equal(fewer.stages[2].name, 'Big Bend National Park, TX');
    assert.equal(fewer.dropped.filter((d) => /spare/.test(d.reason)).length, 1);
    assert.deepEqual(
      fewer.stages.map((s) => s.points),
      pointsForStops(fewer.start, fewer.stages),
      'points follow the legs that remain',
    );
  } finally { m.close(); }
});
