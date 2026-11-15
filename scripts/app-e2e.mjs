// End-to-end test of the real app UI, as two (sometimes three) phones.
//
// Builds the web version of the Expo app pointed at the LOCAL Supabase stack, opens it in
// headless Chrome as separate users (each phone is an isolated browser profile with its own
// account) and plays a whole Odyssey through the screens: sign up, profile and avatar, the chat
// with Odysseus, the Oracle, lobby, join, set sail, every stage, Ithaca, sign out and back in.
//
//   npx supabase start            (once; and `npx supabase db reset` after schema changes)
//   node scripts/app-e2e.mjs                      fog, whole-crew Drachma
//   node scripts/app-e2e.mjs --mode=open
//   node scripts/app-e2e.mjs --points=arriver     Drachma only to whoever arrives
//   node scripts/app-e2e.mjs --skip-build         reuse the last web build
//   node scripts/app-e2e.mjs --out=/some/dir      where the build, logs and screenshots go
//   node scripts/app-e2e.mjs --no-extras          skip the failure-path phone
//   node scripts/app-e2e.mjs --extras             run it even with --mode=open / --points=arriver
//
// Needs Node 22+, Docker (for the local stack), Google Chrome. No npm dependencies.
//
// The LLM and geocoding are replaced by a mock HTTP server that this script starts itself (it
// speaks the Gemini Interactions and Mapbox Search Box endpoints), and the script starts
// `supabase functions serve` pointed at it, so no API keys and no internet are needed. Both are
// stopped on exit, also on failure and Ctrl-C. Control endpoint of the mock:
//   GET /ctl?failchat=N&failroute=N&chatdelay=MS&routedelay=MS
// failchat / failroute make the next N MODEL calls fail with 503. The Edge Functions retry
// once, so one failure seen by the app costs 2 model calls.
//
// The extras phone (a third account) covers the failure paths: two chat failures in a row ->
// scripted fallback -> summon fails -> "Sail the demo route instead". One chat failure + Try
// again is covered on the Captain's phone in every run.
//
// The chat has no points-mode choice any more (it always asks for whole-Crew Drachma), so with
// --points=arriver the Captain still chats up to the Summon button, then the Odyssey is created
// by calling generate-odyssey from the page with points_mode "arriver" and opened on its preview.

import { execSync, spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, openSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => (args.find((a) => a.startsWith(`--${name}=`)) ?? `=${fallback}`).split('=').slice(1).join('=');

const MODE = option('mode', 'fog');
const POINTS = option('points', 'crew');
const EXTRAS = flag('extras') || (!flag('no-extras') && MODE === 'fog' && POINTS === 'crew');
const OUT = path.resolve(option('out', path.join(os.tmpdir(), 'odyssey-app-e2e')));
const WEB = path.join(OUT, 'web');
const SHOTS = path.join(OUT, `shots-${MODE}-${POINTS}${EXTRAS ? '' : '-noextras'}`);
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8090 + Math.floor(Math.random() * 500);
const DEBUG_PORT = 9300 + Math.floor(Math.random() * 500);
const WIDTH = 412;

if (MODE !== 'fog' && MODE !== 'open') throw new Error('--mode must be fog or open');
if (POINTS !== 'crew' && POINTS !== 'arriver') throw new Error('--points must be crew or arriver');
mkdirSync(SHOTS, { recursive: true });

// --- results -----------------------------------------------------------------

let failures = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `\n        got: ${String(detail).slice(0, 400)}`}`);
  return ok;
}
const section = (title) => console.log(`\n${title}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = () => Math.random().toString(36).slice(2, 8);

// --- cleanup: everything started here is stopped here ------------------------------

const cleanups = [];
let cleaning = null;
function cleanup() {
  cleaning ??= (async () => {
    for (const fn of cleanups.reverse()) {
      try {
        await fn();
      } catch { /* best effort */ }
    }
  })();
  return cleaning;
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => void cleanup().then(() => process.exit(130)));
}

// --- the mock LLM and geocoder -------------------------------------------------------

const PLACES = {
  'Arlington, TX': [-97.108, 32.7357],
  'Big Bend National Park, TX': [-103.25, 29.25],
  'Lotus Taqueria, Abilene, TX': [-99.73, 32.45],
  'Cyclops Cavern Museum, Big Spring, TX': [-101.48, 32.25],
  'Circe Roadhouse, Fort Stockton, TX': [-102.88, 30.89],
  'Sirens Overlook, Marathon, TX': [-103.24, 30.2],
};
/** The mock route: 4 waypoints, then Ithaca. Names are unique so tests can look for them or for their absence. */
const STAGES = [
  { place: 'Lotus Taqueria', region: 'Abilene, TX', title: 'Isle of the Lotus Eaters', lore: 'Lore of the lotus, first isle.' },
  { place: 'Cyclops Cavern Museum', region: 'Big Spring, TX', title: 'Cave of the Cyclops', lore: 'Lore of the one-eyed shepherd.' },
  { place: 'Circe Roadhouse', region: 'Fort Stockton, TX', title: 'Table of Circe', lore: 'Lore of the enchantress and her swine.' },
  { place: 'Sirens Overlook', region: 'Marathon, TX', title: 'Rock of the Sirens', lore: 'Lore of the singing rocks.' },
  { place: 'Big Bend National Park', region: 'TX', title: 'Ithaca, Home at Last', lore: 'Lore of the long road ending.' },
];
const stageName = (i) => (i === STAGES.length - 1 ? 'Big Bend National Park, TX' : `${STAGES[i].place}, ${STAGES[i].region}`);
const EMPTY_TRIP = { start: null, destination: null, crew_size: null, duration: null, travel_style: null, visibility_mode: null };
/** One scripted Odysseus turn per traveler message, keyed by how many traveler lines the transcript has. */
const TURNS = [
  [{ destination: 'Big Bend National Park, TX' }, 'Big Bend, a worthy shore, traveler! And from which harbor does your crew set sail?', false],
  [{ start: 'Arlington, TX' }, 'Arlington, then. A long road lies between, and the desert keeps its secrets well. How many souls will share the ship?', false],
  [{ crew_size: 4 }, 'Four of you, a sturdy crew. How many days will you give to the wandering?', false],
  [{ duration: '2 days' }, 'Two days is a brief voyage, yet heroes have won glory in less. Tell me, what does your crew hunger for along the road? Tacos in dusty towns, wide silent skies, old stories carved in stone, or all of it at once? Speak freely, and I shall remember.', false],
  [{ travel_style: 'tacos and star-gazing' }, 'Tacos and starlight, a fine appetite! Shall the route lie open for all to see, or hidden in fog so each island is a surprise?', false],
];

const mock = { chatCalls: [], routeCalls: [], failChat: 0, failRoute: 0, chatDelay: 0, routeDelay: 0, port: 0 };

function startMock() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      const send = (code, obj) => {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/ctl') {
        const n = (k) => (url.searchParams.has(k) ? Number(url.searchParams.get(k)) : undefined);
        mock.failChat = n('failchat') ?? mock.failChat;
        mock.failRoute = n('failroute') ?? mock.failRoute;
        mock.chatDelay = n('chatdelay') ?? mock.chatDelay;
        mock.routeDelay = n('routedelay') ?? mock.routeDelay;
        return send(200, { failChat: mock.failChat, failRoute: mock.failRoute, chatCalls: mock.chatCalls.length, routeCalls: mock.routeCalls.length });
      }
      if (req.method === 'POST' && url.pathname === '/v1beta/interactions') {
        const b = JSON.parse(body);
        const out = (o) => send(200, { id: 'i1', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(o) }] }] });
        const system = String(b.system_instruction);
        if (system.startsWith('You are Odysseus of Ithaca')) {
          const call = { input: String(b.input), failed: false };
          mock.chatCalls.push(call);
          if (mock.chatDelay) await sleep(mock.chatDelay);
          if (mock.failChat > 0) {
            mock.failChat--;
            call.failed = true;
            return send(503, { error: { message: 'overloaded' } });
          }
          const travelerLines = call.input.split('\n').filter((l) => l.startsWith('[traveler] '));
          const n = travelerLines.length;
          const trip = { ...EMPTY_TRIP };
          for (let i = 0; i < Math.min(n, TURNS.length); i++) Object.assign(trip, TURNS[i][0]);
          if (n <= TURNS.length) return out({ reply: TURNS[n - 1][1], trip, done: false, on_topic: true });
          const open = /\bopen\b/i.test(travelerLines[n - 1]);
          trip.visibility_mode = open ? 'open' : 'fog';
          const reply = open
            ? 'Open waters, then, where every island can be seen. The tale is ready, traveler. Summon the Oracle below, and she will chart your course.'
            : 'Fog it shall be. The tale is ready, traveler. Summon the Oracle below, and she will chart your course.';
          return out({ reply, trip, done: true, on_topic: true });
        }
        if (system.startsWith('You are the Oracle')) {
          const call = { input: String(b.input), failed: false };
          mock.routeCalls.push(call);
          if (mock.routeDelay) await sleep(mock.routeDelay);
          if (mock.failRoute > 0) {
            mock.failRoute--;
            call.failed = true;
            return send(503, { error: { message: 'down' } });
          }
          return out({
            title: 'The Voyage to the Western Wilds',
            stages: STAGES.map((s, i) => ({ order: i + 1, place_name: s.place, city_region: s.region, title: s.title, lore: s.lore, why: 'It fits.' })),
          });
        }
        return send(400, { error: { message: 'unknown system instruction' } });
      }
      if (req.method === 'GET' && url.pathname === '/search/searchbox/v1/forward') {
        const c = PLACES[url.searchParams.get('q')];
        return send(200, { type: 'FeatureCollection', features: c ? [{ geometry: { coordinates: c } }] : [] });
      }
      send(404, { error: 'not found' });
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '0.0.0.0', () => {
      mock.port = server.address().port;
      cleanups.push(() => new Promise((r) => server.close(r)));
      resolve();
    }),
  );
}
const ctl = (q) => fetch(`http://127.0.0.1:${mock.port}/ctl?${q}`).then((r) => r.json());

// --- local stack, Edge Functions, web build -------------------------------------------

let status;
try {
  status = JSON.parse(execSync('npx -y supabase status -o json', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
} catch {
  status = {};
}
const SUPABASE_URL = status.API_URL;
const SUPABASE_KEY = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Local Supabase is not running. Start it with: npx supabase start');
  process.exit(1);
}

async function startFunctions() {
  const envFile = path.join(OUT, 'functions.env');
  writeFileSync(
    envFile,
    [
      'LLM_API_KEY=mock',
      'GEOCODING_API_KEY=mock',
      `LLM_BASE_URL=http://host.docker.internal:${mock.port}`,
      `GEOCODING_BASE_URL=http://host.docker.internal:${mock.port}`,
      '',
    ].join('\n'),
  );
  const log = openSync(path.join(OUT, 'functions-serve.log'), 'w');
  const proc = spawn('npx', ['-y', 'supabase', 'functions', 'serve', '--env-file', envFile], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', log, log],
  });
  let exited = false;
  proc.on('exit', () => (exited = true));
  cleanups.push(async () => {
    if (!exited) {
      try {
        process.kill(-proc.pid, 'SIGTERM');
      } catch { /* already gone */ }
      for (let i = 0; i < 50 && !exited; i++) await sleep(200);
      if (!exited) {
        try {
          process.kill(-proc.pid, 'SIGKILL');
        } catch { /* already gone */ }
      }
    }
    // The CLI normally removes its container; make sure it did.
    try {
      execSync('docker rm -f supabase_edge_runtime_theodyssey', { stdio: 'ignore' });
    } catch { /* not there */ }
  });
  // Wait until both functions answer with their own "sign in first" (so the runtime is up and booted).
  for (const name of ['odysseus-chat', 'generate-odyssey']) {
    let ok = false;
    for (let i = 0; i < 150 && !ok && !exited; i++) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${status.ANON_KEY}`, 'Content-Type': 'application/json' },
          body: '{}',
        });
        ok = res.status === 401 && (await res.json().catch(() => ({}))).error === 'not_authenticated';
      } catch { /* not up yet */ }
      if (!ok) await sleep(1000);
    }
    if (!ok) throw new Error(`Edge Function ${name} did not come up; see ${path.join(OUT, 'functions-serve.log')}`);
  }
}

// --- web build and static server ----------------------------------------------------------

function buildWeb() {
  if (flag('skip-build') && existsSync(path.join(WEB, 'index.html'))) return;
  console.log(`Building the web app into ${WEB} ...`);
  execSync(`npx expo export --platform web --output-dir "${WEB}"`, {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_KEY },
  });
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
function startStatic() {
  const server = http.createServer((req, res) => {
    const requested = path.join(WEB, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    // Single-page app: anything that is not a file gets index.html.
    const file = requested.startsWith(WEB) && existsSync(requested) && statSync(requested).isFile() ? requested : path.join(WEB, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  cleanups.push(() => {
    server.closeAllConnections?.();
    server.close();
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', r));
}
const APP = `http://127.0.0.1:${PORT}`;

// --- Chrome over the DevTools protocol --------------------------------------------------------

let ws;
let nextId = 0;
const pending = new Map();
const phonesBySession = new Map();
const cdp = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

async function startChrome() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${path.join(OUT, `chrome-${Date.now()}`)}`, 'about:blank',
  ], { stdio: 'ignore' });
  cleanups.push(() => chrome.kill());
  let wsUrl = null;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    await sleep(200);
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json()).webSocketDebuggerUrl;
    } catch { /* not up yet */ }
  }
  if (!wsUrl) throw new Error('Could not start Chrome. Set CHROME_PATH if it is installed somewhere else.');
  ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    const phone = phonesBySession.get(msg.sessionId);
    if (!phone) return;
    if (msg.method === 'Runtime.exceptionThrown') {
      phone.errors.push(`uncaught: ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      phone.errors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      const e = msg.params.entry;
      phone.errors.push(`${e.source}: ${e.text}${e.url ? ` (${e.url})` : ''}`);
    }
  };
}

/** One isolated browser profile = one phone with its own account. */
async function openPhone(name, allow = []) {
  const { browserContextId } = await cdp('Target.createBrowserContext');
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => cdp(method, params, sessionId);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 915, deviceScaleFactor: 1, mobile: true });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };

  // Helpers injected into the page. Only elements that are actually laid out count,
  // because the router keeps earlier screens mounted but hidden.
  const HELPERS = `
    const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const all = (sel) => [...document.querySelectorAll(sel)].filter(shown);
    const text = () => document.body.innerText;
    // react-native-web does not put aria-checked on radios, so the selected avatar is the raised one (translateY(-3px)).
    const checkedLabel = () => all('[role="radio"]').find((e) => getComputedStyle(e).transform !== 'none')?.getAttribute('aria-label') ?? null;
    const token = () => {
      const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
      return key ? JSON.parse(localStorage.getItem(key)).access_token : null;
    };
  `;
  const run = (body) => evaluate(`(async () => { ${HELPERS} ${body} })()`);

  const phone = {
    name,
    username: null,
    errors: [],
    allow,
    goto: (url) => send('Page.navigate', { url }),
    text: () => run('return text();'),
    has: (needle) => run(`return text().includes(${JSON.stringify(needle)});`),
    /** Waits until the visible text contains `needle`. */
    async waitFor(needle, timeoutMs = 15000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (await phone.has(needle)) return true;
        await sleep(120);
      }
      return false;
    },
    async waitGone(needle, timeoutMs = 15000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (!(await phone.has(needle))) return true;
        await sleep(120);
      }
      return false;
    },
    /** Polls a page-side expression body (it must `return` something) until it is truthy; returns that value or false. */
    async waitUntil(body, timeoutMs = 15000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        const v = await run(body);
        if (v) return v;
        await sleep(120);
      }
      return false;
    },
    /** Clicks the visible button or radio whose text or label contains `label`. */
    async press(label) {
      const ok = await run(`
        const el = all('[role="button"], [role="radio"]').find((e) =>
          (e.textContent + ' ' + (e.getAttribute('aria-label') ?? '')).includes(${JSON.stringify(label)}) && e.getAttribute('aria-disabled') !== 'true');
        if (!el) return false;
        el.scrollIntoView({ block: 'center' });
        el.click();
        return true;`);
      if (!ok) throw new Error(`[${name}] no enabled button containing "${label}". Screen says:\n${(await phone.text()).slice(0, 600)}`);
    },
    /** Whether a button with this text or label is visible, and whether it is disabled (null when absent). */
    buttonDisabled: (label) =>
      run(`
        const el = all('[role="button"], [role="radio"]').find((e) => (e.textContent + ' ' + (e.getAttribute('aria-label') ?? '')).includes(${JSON.stringify(label)}));
        return el ? el.getAttribute('aria-disabled') === 'true' : null;`),
    /** Types into the input with this accessibility label, the way React expects. */
    async type(label, value) {
      const ok = await run(`
        const el = all('input, textarea').find((e) => e.getAttribute('aria-label') === ${JSON.stringify(label)});
        if (!el) return false;
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;`);
      if (!ok) throw new Error(`[${name}] no input labelled "${label}"`);
    },
    value: (label) => run(`return all('input, textarea').find((e) => e.getAttribute('aria-label') === ${JSON.stringify(label)})?.value ?? null;`),
    labelled: (label) => run(`return all('[aria-label=${JSON.stringify(label)}]').map((e) => e.textContent)[0] ?? null;`),
    exists: (label) => run(`return all('[aria-label=${JSON.stringify(label)}]').length > 0;`),
    count: (needle) => run(`return text().split(${JSON.stringify(needle)}).length - 1;`),
    /** The label of the avatar radio that is selected right now. */
    checkedAvatar: () => run('return checkedLabel();'),
    /** Leaf elements whose whole text is a Drachma figure, like "♦ 100" (exact, so 100 never matches 1000). */
    hud: () => run(`return all('div, span').filter((e) => e.children.length === 0 && /^♦ \\d+$/.test(e.textContent.trim())).map((e) => e.textContent.trim());`),
    /** The Drachma figure on the row of the crew member with this nickname (Ithaca, scoped to that row). */
    rowTotal: (nickname) =>
      run(`
        const leaf = all('div, span').find((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(nickname)});
        const m = /♦ (\\d+)/.exec(leaf?.parentElement?.innerText ?? '');
        return m ? Number(m[1]) : null;`),
    /** The text of the lobby crew row of this nickname (the name has a "(you)" child on your own row), or null. */
    rowText: (nickname) =>
      run(`
        const own = all('div, span').find((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === ${JSON.stringify(nickname)}));
        return own?.parentElement?.innerText ?? null;`),
    hasRow: async (nickname) => (await phone.rowText(nickname)) !== null,
    /** The chat bubbles in order: who, text, where on the screen, and how many characters are still unwritten. */
    bubbles: () =>
      run(`
        return all('[aria-label*=" says: "]').map((e) => {
          const label = e.getAttribute('aria-label');
          const r = e.getBoundingClientRect();
          const ghost = [...e.querySelectorAll('*')].filter((n) => getComputedStyle(n).color === 'rgba(0, 0, 0, 0)').map((n) => n.textContent).join('');
          return { who: label.startsWith('You says: ') ? 'You' : 'Odysseus', text: label.slice(label.indexOf(' says: ') + 7), left: r.left, right: r.right, unwritten: ghost.length };
        });`),
    path: () => evaluate('location.pathname'),
    /** Calls an Edge Function from the page with this phone's session. */
    invoke: (fn, body) =>
      run(`
        const res = await fetch(${JSON.stringify(SUPABASE_URL)} + '/functions/v1/' + ${JSON.stringify(fn)}, {
          method: 'POST',
          headers: { apikey: ${JSON.stringify(SUPABASE_KEY)}, Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
          body: ${JSON.stringify(JSON.stringify(body))},
        });
        return { status: res.status, body: await res.json() };`),
    /** A PostgREST GET as this phone's user. */
    rest: (query) =>
      run(`
        const res = await fetch(${JSON.stringify(SUPABASE_URL)} + '/rest/v1/' + ${JSON.stringify(query)}, {
          headers: { apikey: ${JSON.stringify(SUPABASE_KEY)}, Authorization: 'Bearer ' + token() },
        });
        return await res.json();`),
    async shot(label) {
      await sleep(1100); // let a parting cloud curtain finish (900 ms) so it is not in the picture
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(SHOTS, `${String(++shotNo).padStart(2, '0')}-${name}-${label}.png`);
      writeFileSync(file, Buffer.from(data, 'base64'));
    },
  };
  phonesBySession.set(sessionId, phone);
  return phone;
}
let shotNo = 0;

// --- shared steps ------------------------------------------------------------------------

const NO_QUESTION_COUNTER = /QUESTION\s*\d+\s*(OF|\/)\s*\d+/i;

/** Start page: sign up as a new user and wait for Home. */
async function signUp(phone) {
  phone.username = `${phone.name}_${rand()}`.slice(0, 20);
  phone.password = `pw-${rand()}-${rand()}`;
  await phone.goto(APP);
  if (!(await phone.waitFor('Board the ship'))) throw new Error(`[${phone.name}] start page did not load`);
  await phone.type('YOUR NAME', phone.username);
  await phone.type('PASSWORD', phone.password);
  await phone.press('Board the ship');
  return phone.waitFor(`Sailing as ${phone.username}`, 20000);
}

/** Sends one message in the chat and returns once the traveler's bubble is shown. */
async function say(phone, textToSend) {
  const before = (await phone.bubbles()).length;
  await phone.type('Your reply to Odysseus', textToSend);
  await phone.press('Send your reply');
  const shownIt = await phone.waitUntil(`return all('[aria-label*=" says: "]').length >= ${before + 1};`, 5000);
  return shownIt;
}

// --- the test ----------------------------------------------------------------------------------

async function main() {
  console.log(`App: ${APP}   Supabase: ${SUPABASE_URL}   mock LLM/geocoder: :${mock.port}   mode: ${MODE}   points: ${POINTS}   extras: ${EXTRAS}`);
  const base = [/\/auth\/v1\/token/, /\/auth\/v1\/signup/]; // signing in as a name nobody has yet is expected to fail first
  const captain = await openPhone('captain', [...base, /functions\/v1\/odysseus-chat/]);
  const sailor = await openPhone('sailor', [...base, /rpc\/join_odyssey/]);

  // ---- 1. Start page ----
  section('Start page and sign-up');
  await captain.goto(APP);
  check('Signed out, the start page shows the sign-in form', await captain.waitFor('Board the ship'));
  check('Start page does not claim a signed-in user', !(await captain.has('Sailing as')));
  await captain.shot('start');
  await captain.press('Board the ship');
  check('Empty form is rejected with the name rule', await captain.waitFor('Names are 3 to 20 characters'));
  captain.username = `captain_${rand()}`;
  captain.password = `pw-${rand()}-${rand()}`;
  await captain.type('YOUR NAME', captain.username);
  await captain.type('PASSWORD', 'abc');
  await captain.press('Board the ship');
  check('A 3 character password is rejected with the password rule', await captain.waitFor('The password needs at least 6 characters'));
  check('The earlier name message is gone', !(await captain.has('Names are 3 to 20 characters:')));
  await captain.type('YOUR NAME', 'a b');
  await captain.type('PASSWORD', captain.password);
  await captain.press('Board the ship');
  check('A name with a space is rejected with the name rule (and the password message is replaced)', (await captain.waitFor('Names are 3 to 20 characters')) && !(await captain.has('The password needs at least 6 characters')));
  check('Still on the start page after the rejections', (await captain.has('Board the ship')) && !(await captain.has('Sailing as')));
  await captain.type('YOUR NAME', captain.username);
  await captain.type('PASSWORD', captain.password);
  await captain.press('Board the ship');
  check('Sign-up works and Home says "Sailing as <username>"', await captain.waitFor(`Sailing as ${captain.username}`, 20000));
  check('Home offers Create and Join, and the ship\'s wheel', (await captain.has('Create an Odyssey')) && (await captain.has('Join a Crew')) && (await captain.exists('Open your profile')));
  check('The curtain has parted (no sign-in message left)', await captain.waitGone('THE CLOUDS GATHER'));
  await captain.shot('home');

  check('Sailor signs up in a second browser profile', await signUp(sailor), sailor.username);
  check('The two phones are different users', captain.username !== sailor.username);

  // ---- 2. Profile ----
  section('Profile and avatar');
  async function openProfile(phone) {
    await phone.press('Open your profile');
    return phone.waitFor('YOUR PROFILE');
  }
  async function pickAvatar(phone, avatarName) {
    check(`${phone.name}: "Saved." is not showing before picking`, !(await phone.has('Saved.')));
    await phone.press(avatarName);
    check(`${phone.name}: picking ${avatarName} shows "Saved."`, await phone.waitFor('Saved.'));
    check(`${phone.name}: ${avatarName} is the checked avatar`, (await phone.checkedAvatar()) === avatarName, await phone.checkedAvatar());
  }
  check('Captain opens the profile through the ship\'s wheel', await openProfile(captain));
  check('Profile shows the username', await captain.has(captain.username));
  check('A new user starts with the first avatar (Hoplite)', (await captain.checkedAvatar()) === 'Hoplite', await captain.checkedAvatar());
  await pickAvatar(captain, 'Monarch');
  const profileRow = await captain.rest(`profiles?select=username,avatar_id&username=eq.${captain.username}`);
  check('The choice is saved on the server (profiles.avatar_id = avatar_4)', profileRow?.[0]?.avatar_id === 'avatar_4' && profileRow?.[0]?.username === captain.username, JSON.stringify(profileRow));
  await captain.shot('profile');
  await captain.press('Go back');
  check('Back returns to Home', await captain.waitFor('Create an Odyssey'));
  await captain.goto(APP);
  check('After a reload the session is kept (Home, not the start page)', await captain.waitFor(`Sailing as ${captain.username}`, 20000));
  await openProfile(captain);
  check('After a reload the avatar is still Monarch', await captain.waitUntil(`return checkedLabel() === 'Monarch';`, 8000));
  await captain.press('Go back');
  await captain.waitFor('Create an Odyssey');

  check('Sailor picks a different avatar (Owl Seer)', await openProfile(sailor));
  await pickAvatar(sailor, 'Owl Seer');
  await sailor.press('Go back');
  await sailor.waitFor('Join a Crew');

  // ---- 3. Chat ----
  section('Chat with Odysseus');
  await ctl(`chatdelay=1500&failchat=0&failroute=0&routedelay=1500`);
  await captain.press('Create an Odyssey');
  check('The chat opens with the greeting', await captain.waitFor('Odysseus of Ithaca'));
  let b = await captain.waitUntil(`return all('[aria-label*=" says: "]').length >= 1;`, 5000);
  b = await captain.bubbles();
  check('Greeting is Odysseus\'s, on the left', b.length === 1 && b[0].who === 'Odysseus' && b[0].left < WIDTH * 0.25 && b[0].text.startsWith('Come closer, traveler'), JSON.stringify(b));
  check('The chat shows no "QUESTION n OF m" counter', !NO_QUESTION_COUNTER.test(await captain.text()));
  check('Send is disabled with an empty box', (await captain.buttonDisabled('Send your reply')) === true);
  await captain.shot('chat-greeting');
  check('The Summon button is not offered yet', !(await captain.has('Summon the Oracle')));

  const fragments = ['worthy shore', 'A long road lies between', 'sturdy crew', 'brief voyage', 'Tacos and starlight'];
  const sentLines = ['I want to drive to Big Bend National Park, TX', 'We start in Arlington, TX', 'Four of us', '2 days', 'Tacos and star-gazing please'];
  let sawTypewriter = false;
  let retryChecked = false;
  for (let i = 0; i < sentLines.length; i++) {
    const turn = `Turn ${i + 1}`;
    // Let the previous reply finish writing before the next message (send is disabled until then).
    await captain.waitUntil(`return all('[aria-label*=" says: "]').every((e) => ![...e.querySelectorAll('*')].some((n) => getComputedStyle(n).color === 'rgba(0, 0, 0, 0)' && n.textContent !== ''));`, 8000);
    const failThisOne = i === 2;
    if (failThisOne) await ctl('failchat=2');
    const callsBefore = mock.chatCalls.length;
    check(`${turn}: message is sent`, await say(captain, sentLines[i]));
    let bs = await captain.bubbles();
    const mine = bs[bs.length - 1];
    check(`${turn}: the traveler's message appears on the right`, mine.who === 'You' && mine.text === sentLines[i] && mine.right > WIDTH * 0.75, JSON.stringify(mine));
    check(`${turn}: the message box is emptied`, (await captain.value('Your reply to Odysseus')) === '');
    check(`${turn}: typing indicator appears while he thinks`, await captain.waitUntil(`return all('[aria-label="Odysseus is writing"]').length > 0;`, 5000));
    await captain.type('Your reply to Odysseus', 'a draft');
    check(`${turn}: Send is disabled while he is writing, even with a draft`, (await captain.buttonDisabled('Send your reply')) === true);
    if (i === 1) await captain.shot('chat-typing-dots');
    await captain.type('Your reply to Odysseus', '');

    if (failThisOne) {
      check(`${turn}: after a failed call Odysseus apologises in character`, await captain.waitFor('The winds swallowed my words', 20000));
      check(`${turn}: "Try again" is offered`, (await captain.buttonDisabled('Try again')) === false);
      check(`${turn}: typing indicator is gone and nothing was added after the message`, !(await captain.exists('Odysseus is writing')) && (await captain.bubbles()).at(-1).who === 'You');
      await captain.shot('chat-failed');
      await captain.press('Try again');
      check(`${turn}: Try again hides the error and shows the dots`, (await captain.waitGone('The winds swallowed my words', 3000)) && (await captain.waitUntil(`return all('[aria-label="Odysseus is writing"]').length > 0;`, 3000)));
      retryChecked = true;
    }

    // The reply: wait for it to appear, watch it being written, then see it finished.
    const arrived = await captain.waitUntil(`return all('[aria-label^="Odysseus says: "][aria-label*=${JSON.stringify(fragments[i])}]').length > 0;`, 20000);
    check(`${turn}: Odysseus's reply arrives`, arrived, JSON.stringify((await captain.bubbles()).map((x) => x.text)));
    bs = await captain.bubbles();
    const his = bs[bs.length - 1];
    check(`${turn}: the reply is Odysseus's, on the left, after the traveler's line`, his.who === 'Odysseus' && his.left < WIDTH * 0.25 && bs[bs.length - 2].who === 'You', JSON.stringify(bs.slice(-2)));
    if (his.unwritten > 0) {
      sawTypewriter = true;
      await captain.type('Your reply to Odysseus', 'a draft');
      check(`${turn}: Send is disabled while the reply is still being written`, (await captain.buttonDisabled('Send your reply')) === true);
      check(`${turn}: typing indicator is gone once the reply starts`, !(await captain.exists('Odysseus is writing')));
    }
    const finished = await captain.waitUntil(`return all('[aria-label^="Odysseus says: "]').every((e) => ![...e.querySelectorAll('*')].some((n) => getComputedStyle(n).color === 'rgba(0, 0, 0, 0)' && n.textContent !== ''));`, 8000);
    check(`${turn}: the reply is written out in full`, finished);
    if (his.unwritten > 0) {
      check(`${turn}: with the draft, Send is enabled again once he has finished`, (await captain.buttonDisabled('Send your reply')) === false);
      await captain.type('Your reply to Odysseus', '');
    }
    bs = await captain.bubbles();
    check(`${turn}: each message appears once (${(i + 1) * 2 + 1} bubbles)`, bs.length === (i + 1) * 2 + 1, bs.length);
    check(`${turn}: no "QUESTION n OF m" text`, !NO_QUESTION_COUNTER.test(await captain.text()));
    const sentCalls = mock.chatCalls.slice(callsBefore);
    const lastCall = sentCalls[sentCalls.length - 1];
    check(`${turn}: the model got the whole transcript (${i + 1} traveler lines, last is this message)`,
      lastCall.input.split('\n').filter((l) => l.startsWith('[traveler] ')).length === i + 1 && lastCall.input.includes(`[traveler] ${sentLines[i]}`), lastCall.input);
    if (failThisOne) {
      const failedInputs = sentCalls.filter((c) => c.failed).map((c) => c.input);
      check(`${turn}: Try again resent exactly the same transcript`, failedInputs.length === 2 && failedInputs.every((x) => x === lastCall.input) && !lastCall.failed);
      check(`${turn}: the failing mode was used up (nothing left to fail)`, (await ctl('')).failChat === 0);
      check(`${turn}: the retried message is shown once, not twice`, (await captain.bubbles()).filter((x) => x.who === 'You' && x.text === sentLines[i]).length === 1);
    }
    if (i === 0) await captain.shot('chat-first-reply');
    if (i < sentLines.length - 1) check(`${turn}: the Summon button is not offered yet`, !(await captain.has('Summon the Oracle')));
  }
  check('The typewriter was seen working (some reply was still being written when it arrived)', sawTypewriter);
  check('The failure and Try again path ran', retryChecked);

  // Last turn: choose the visibility; this is the one that makes him ready.
  const choice = MODE === 'open' ? 'Open please, show me the whole route' : 'Fog please, surprise us';
  await captain.waitUntil(`return all('[aria-label*=" says: "]').every((e) => ![...e.querySelectorAll('*')].some((n) => getComputedStyle(n).color === 'rgba(0, 0, 0, 0)' && n.textContent !== ''));`, 8000);
  await say(captain, choice);
  check('After the last answer the Summon button appears', await captain.waitFor('Summon the Oracle', 20000));
  check('The closing line is Odysseus\'s', (await captain.bubbles()).at(-1).text.includes(MODE === 'open' ? 'Open waters' : 'Fog it shall be'));
  await captain.waitUntil(`return all('[aria-label*=" says: "]').every((e) => ![...e.querySelectorAll('*')].some((n) => getComputedStyle(n).color === 'rgba(0, 0, 0, 0)' && n.textContent !== ''));`, 8000);
  check('Still no "QUESTION n OF m" text', !NO_QUESTION_COUNTER.test(await captain.text()));
  await captain.shot('chat-ready');

  // ---- 5. Summon ----
  section('Summon the Oracle');
  const routeCallsBefore = mock.routeCalls.length;
  let odysseyId;
  if (POINTS === 'crew') {
    await captain.press('Summon the Oracle');
    check('The cloud curtain shows its message while the Oracle works', await captain.waitFor('The Oracle is consulting the gods', 8000));
    await captain.shot('summon-curtain');
    check('The route preview opens', await captain.waitFor('Gather Your Crew', 30000), await captain.text());
    check('The curtain parts (its message is gone)', await captain.waitGone('The Oracle is consulting the gods', 8000));
    odysseyId = /\/odyssey\/([^/]+)\/preview/.exec(await captain.path())?.[1];
  } else {
    const made = await captain.invoke('generate-odyssey', {
      start: 'Arlington, TX', destination: 'Big Bend National Park, TX', crew_size: 4, duration: '2 days', travel_style: 'tacos and star-gazing',
      visibility_mode: MODE, points_mode: 'arriver', nickname: captain.username, avatar_id: 'avatar_4',
    });
    check('Arriver mode: generate-odyssey is called directly with points_mode arriver (the chat cannot choose it)', made.status === 200 && !!made.body.odyssey_id, JSON.stringify(made));
    odysseyId = made.body.odyssey_id;
    await captain.goto(`${APP}/odyssey/${odysseyId}/preview`);
    check('The route preview opens', await captain.waitFor('Gather Your Crew', 30000), await captain.text());
  }
  check('The URL is the preview of an Odyssey', !!odysseyId, await captain.path());
  const oracleCall = mock.routeCalls.slice(routeCallsBefore)[0]?.input ?? '';
  check('The Oracle was asked with what the chat learned', ['Start: Arlington, TX', 'Destination: Big Bend National Park, TX', 'Crew size: 4', 'Duration: 2 days', 'Travel style: tacos and star-gazing'].every((l) => oracleCall.includes(l)), oracleCall);
  if (POINTS === 'crew') {
    const odyssey = (await captain.rest(`odysseys?select=visibility_mode,points_mode&id=eq.${odysseyId}`))?.[0];
    check(`The Odyssey is saved with the chosen visibility (${MODE}) and whole-crew points`, odyssey?.visibility_mode === MODE && odyssey?.points_mode === 'crew', JSON.stringify(odyssey));
  } else {
    const odyssey = (await captain.rest(`odysseys?select=visibility_mode,points_mode&id=eq.${odysseyId}`))?.[0];
    check(`The Odyssey is saved as ${MODE} with arriver points`, odyssey?.visibility_mode === MODE && odyssey?.points_mode === 'arriver', JSON.stringify(odyssey));
  }

  section('Oracle preview');
  const previewText = await captain.text();
  const total = (previewText.match(/STAGE \d+/g) ?? []).length;
  check('Preview lists the 5 stages of the mock route', total === 5, total);
  const hiddenNow = await captain.count('Uncharted island');
  const lookedFor = (i) => [STAGES[i].title, stageName(i), STAGES[i].lore];
  const hiddenAbsent = (text, from) => STAGES.flatMap((_, i) => (i >= from ? lookedFor(i) : [])).filter((s) => text.includes(s));
  if (MODE === 'fog') {
    check('Fog: 4 of 5 stages are shown as "Uncharted island"', hiddenNow === 4, hiddenNow);
    check('Fog: stage 1 is named', stageName(0) && previewText.includes(STAGES[0].title) && previewText.includes(stageName(0)));
    const leaked = hiddenAbsent(previewText, 1);
    check('Fog: no name, title or lore of stages 2 to 5 is in the page text', leaked.length === 0, leaked.join(' | '));
    check('Fog: the destination is not named anywhere ("Big Bend" absent, "Ithaca (hidden)" shown)', !previewText.includes('Big Bend') && previewText.includes('Ithaca (hidden)'));
    check('Fog: no stage title is "Ithaca, Home at Last"', !previewText.includes('Home at Last'));
  } else {
    check('Open: no stage is hidden', hiddenNow === 0, hiddenNow);
    const missing = STAGES.flatMap((_, i) => lookedFor(i)).filter((s) => !previewText.includes(s));
    check('Open: every stage name, title and lore is shown', missing.length === 0, missing.join(' | '));
    check('Open: the destination is named', previewText.includes('Big Bend National Park, TX') && !previewText.includes('Ithaca (hidden)'));
  }
  await captain.shot('preview');
  await captain.press('Gather Your Crew');

  // ---- 7. Lobby, join ----
  section('Lobby');
  check('Captain reaches the lobby', await captain.waitFor('Share this code'));
  const code = (await captain.labelled('JOIN CODE'))?.trim() ?? '';
  check('Lobby shows a 6 character join code', /^[A-Z2-9]{6}$/.test(code), code);
  const ownRow = await captain.rowText(captain.username);
  check('Crew list shows the Captain, alone, marked "(you)" and as Captain', (await captain.waitFor('Crew · 1')) && /\(you\)/.test(ownRow ?? '') && /Captain/.test(ownRow ?? ''), ownRow);
  check('Captain sees the launch button', await captain.has('Begin the Voyage'));

  section('Join (second phone)');
  await sailor.press('Join a Crew');
  await sailor.waitFor('Join the Odyssey');
  check('The nickname starts as the Sailor\'s username', (await sailor.value('YOUR NICKNAME')) === sailor.username, await sailor.value('YOUR NICKNAME'));
  check('The avatar starts as the one saved on the profile (Owl Seer)', (await sailor.checkedAvatar()) === 'Owl Seer', await sailor.checkedAvatar());
  await sailor.press('Join the Odyssey');
  check('Joining with no code is rejected', await sailor.waitFor('Enter the join code from your Captain'));
  await sailor.type('JOIN CODE', 'ZZZZZZ');
  await sailor.press('Join the Odyssey');
  check('A wrong join code is rejected with a message', await sailor.waitFor('No Odyssey has that code'));
  await sailor.type('JOIN CODE', code.toLowerCase());
  await sailor.press('Join the Odyssey');
  check('Sailor joins with a lower-case code and reaches the lobby', await sailor.waitFor('Share this code'), await sailor.text());
  check('Sailor sees both crew members', (await sailor.waitFor('Crew · 2')) && (await sailor.hasRow(sailor.username)) && (await sailor.hasRow(captain.username)));
  check('Sailor cannot set sail, and is told to wait', (await sailor.has('Waiting for the Captain')) && !(await sailor.has('Begin the Voyage')));
  check('REALTIME: Captain sees the Sailor arrive without reloading', (await captain.waitFor('Crew · 2')) && (await captain.waitUntil(`return all('div, span').some((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === ${JSON.stringify(sailor.username)}));`, 8000)));
  const sailorRowOnCaptain = (await captain.rowText(sailor.username)) ?? '';
  check('On the Captain\'s phone the Sailor\'s row is not "(you)" and not the Captain', !/\(you\)/.test(sailorRowOnCaptain) && !/Captain/.test(sailorRowOnCaptain), sailorRowOnCaptain);
  check('On the Sailor\'s phone his own row is "(you)"', /\(you\)/.test((await sailor.rowText(sailor.username)) ?? ''));
  const memberRows = await captain.rest(`members?select=nickname,avatar_id&odyssey_id=eq.${odysseyId}`);
  const sailorMember = memberRows.find((m) => m.nickname === sailor.username);
  check('The Sailor\'s crew entry carries his profile avatar (avatar_3)', sailorMember?.avatar_id === 'avatar_3', JSON.stringify(memberRows));
  await captain.shot('lobby');
  await sailor.shot('lobby');

  // ---- Set sail ----
  section('Set sail');
  await captain.press('Begin the Voyage');
  check('Captain lands on the voyage screen', await captain.waitFor('We have arrived'));
  check('REALTIME: Sailor is moved to the voyage screen', await sailor.waitFor('We have arrived'));
  check(`Voyage shows stage 1 of ${total}`, (await captain.waitFor(`STAGE 1 / ${total}`)) && (await sailor.waitFor(`STAGE 1 / ${total}`)));
  check('Both phones start on ♦ 0', (await captain.hud())[0] === '♦ 0' && (await sailor.hud())[0] === '♦ 0', JSON.stringify([await captain.hud(), await sailor.hud()]));
  if (MODE === 'fog') {
    const leaked = [...hiddenAbsent(await captain.text(), 1), ...hiddenAbsent(await sailor.text(), 1)];
    check('Fog: stages 2 to 5 are absent from both phones\' text at the start', leaked.length === 0, leaked.join(' | '));
  }
  await captain.shot('voyage-start');

  // ---- Clearing ----
  section('Clearing stages');
  const earned = { captain: 0, sailor: 0 };
  let sum = 0;
  for (let n = 1; n <= total; n++) {
    const who = n % 2 ? captain : sailor;
    const other = n % 2 ? sailor : captain;
    const pts = n === total ? 250 : 100;
    const i = n - 1;
    const expectedMessage = `${STAGES[i].title} cleared. +${pts} Drachma.`;
    check(`Stage ${n}: the target is "${STAGES[i].title}" on both phones`, (await captain.has(STAGES[i].title)) && (await sailor.has(STAGES[i].title)));
    if (n % 2) {
      await who.press('Simulate travel');
      check(`Stage ${n}: Captain sails (simulated GPS) and gets "${expectedMessage}"`, await who.waitUntil(`return all('[aria-label="voyage-message"]').some((e) => e.textContent.trim() === ${JSON.stringify(expectedMessage)});`, 20000), await who.labelled('voyage-message'));
    } else {
      await who.press('We have arrived');
      check(`Stage ${n}: Sailor arrives manually and gets "${expectedMessage}"`, await who.waitUntil(`return all('[aria-label="voyage-message"]').some((e) => e.textContent.trim() === ${JSON.stringify(expectedMessage)});`, 20000), await who.labelled('voyage-message'));
    }
    sum += pts;
    earned[who.name] += pts;
    const next = n === total ? 'Voyage complete' : `STAGE ${n + 1} / ${total}`;
    check(`Stage ${n}: both phones move to "${next}"`, (await who.waitFor(next)) && (await other.waitFor(next)));
    if (n < total) {
      check(`Stage ${n}: both phones now target "${STAGES[n].title}"`, (await who.waitFor(STAGES[n].title)) && (await other.waitFor(STAGES[n].title)));
    }
    for (const p of [captain, sailor]) {
      const expected = POINTS === 'arriver' ? earned[p.name] : sum;
      const got = await p.waitUntil(`return all('div, span').some((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(`♦ ${expected}`)});`, 10000);
      check(`Stage ${n}: ${p.name}'s total reads exactly ♦ ${expected}`, got, JSON.stringify(await p.hud()));
    }
    if (MODE === 'fog' && n < total) {
      const leaked = [...hiddenAbsent(await captain.text(), n + 1), ...hiddenAbsent(await sailor.text(), n + 1)];
      check(`Stage ${n}: Fog: stages ${n + 2} to ${total} are still absent from both phones' text`, leaked.length === 0, leaked.join(' | '));
    }
    if (n === 1) await who.shot('voyage-after-stage-1');
  }
  await captain.shot('voyage-complete');

  // ---- Ithaca ----
  section('Ithaca');
  await captain.press('Enter Ithaca');
  check('Captain reaches Ithaca', await captain.waitFor('ITHACA!'));
  const mine = POINTS === 'arriver' ? earned.captain : sum;
  const summary = (await captain.waitUntil(`return all('[aria-label="finish-summary"]')[0]?.textContent.trim() === ${JSON.stringify(`${total} / ${total} · ${mine} ◈`)};`, 8000)) ? `${total} / ${total} · ${mine} ◈` : await captain.labelled('finish-summary');
  check(`Summary reads exactly "${total} / ${total} · ${mine} ◈"`, summary === `${total} / ${total} · ${mine} ◈`, summary);
  const ithacaText = await captain.text();
  check('Full route is listed, nothing hidden', !ithacaText.includes('Uncharted island') && (ithacaText.match(/STAGE \d+/g) ?? []).length === total);
  check('Every stage name appears on the Ithaca screen', STAGES.every((_, i) => ithacaText.includes(stageName(i))));
  const theirs = POINTS === 'arriver' ? earned.sailor : sum;
  check(`Crew totals: the Sailor's row says ♦ ${theirs}`, (await captain.rowTotal(sailor.username)) === theirs, await captain.rowTotal(sailor.username));
  check(`Crew totals: the Captain's row says ♦ ${mine}`, (await captain.rowTotal(captain.username)) === mine, await captain.rowTotal(captain.username));
  await captain.shot('ithaca');
  await sailor.press('Enter Ithaca');
  check('Sailor reaches Ithaca too', await sailor.waitFor('ITHACA!'));
  check(`Sailor's summary reads "${total} / ${total} · ${theirs} ◈"`, (await sailor.waitUntil(`return all('[aria-label="finish-summary"]')[0]?.textContent.trim() === ${JSON.stringify(`${total} / ${total} · ${theirs} ◈`)};`, 8000)) !== false, await sailor.labelled('finish-summary'));

  section('Rejoining');
  await sailor.press('Return home');
  await sailor.waitFor('Join a Crew');
  await sailor.press('Join a Crew');
  await sailor.waitFor('Join the Odyssey');
  await sailor.type('JOIN CODE', code);
  await sailor.press('Join the Odyssey');
  check('A completed Odyssey cannot be joined', await sailor.waitFor('not taking new crew'));

  // ---- 4 and 6. Failure paths on a third phone ----
  if (EXTRAS) await failurePaths();

  // ---- 8. Sign out and back in ----
  section('Sign out and back in (Captain\'s phone)');
  await captain.press('Return home');
  await captain.waitFor('Create an Odyssey');
  await openProfile(captain);
  await captain.press('Leave the ship');
  check('Sign out returns to the start page', await captain.waitFor('Board the ship', 15000));
  check('Home is gone: no "Sailing as"', !(await captain.has('Sailing as')));
  check('The curtain has parted after signing out', await captain.waitGone('RETURNING TO HARBOR'));
  await captain.shot('signed-out');
  await captain.type('YOUR NAME', captain.username);
  await captain.type('PASSWORD', 'definitely-wrong');
  await captain.press('Board the ship');
  check('Wrong password for a taken name is refused', await captain.waitFor('That name is already taken, and the password does not match it'), await captain.text());
  check('Still on the start page after the refusal', (await captain.has('Board the ship')) && !(await captain.has('Sailing as')));
  // Another account on this phone must not inherit the previous user's avatar.
  await captain.type('YOUR NAME', sailor.username);
  await captain.type('PASSWORD', sailor.password);
  await captain.press('Board the ship');
  check('The Sailor\'s account signs in on this phone', await captain.waitFor(`Sailing as ${sailor.username}`, 20000));
  await openProfile(captain);
  check('Profile of the other user shows HIS avatar (Owl Seer), not Monarch', await captain.waitUntil(`return checkedLabel() === 'Owl Seer';`, 8000), await captain.checkedAvatar());
  await captain.press('Leave the ship');
  await captain.waitFor('Board the ship');
  const fresh = `fresh_${rand()}`;
  await captain.type('YOUR NAME', fresh);
  await captain.type('PASSWORD', 'fresh-pass-1');
  await captain.press('Board the ship');
  await captain.waitFor(`Sailing as ${fresh}`, 20000);
  await openProfile(captain);
  check('A brand-new user shows the first avatar (Hoplite), not the previous one', (await captain.checkedAvatar()) === 'Hoplite', await captain.checkedAvatar());
  await captain.press('Leave the ship');
  await captain.waitFor('Board the ship');
  await captain.type('YOUR NAME', captain.username);
  await captain.type('PASSWORD', captain.password);
  await captain.press('Board the ship');
  check('Signing back in with the same username and password works', await captain.waitFor(`Sailing as ${captain.username}`, 20000));
  await openProfile(captain);
  check('The Captain\'s avatar is Monarch again after signing back in', await captain.waitUntil(`return checkedLabel() === 'Monarch';`, 8000), await captain.checkedAvatar());
  await captain.shot('signed-back-in');

  // ---- errors ----
  section('Browser errors');
  const phones = [captain, sailor, ...(EXTRAS ? [wanderer] : [])];
  for (const p of phones) {
    const unexpected = p.errors.filter((e) => !p.allow.some((re) => re.test(e)) );
    const expected = p.errors.length - unexpected.length;
    check(`${p.name}: no uncaught exceptions or unexpected console errors (${expected} expected failed requests ignored)`, unexpected.length === 0, unexpected.join(' | '));
  }
}

let wanderer = null;

/** Two chat failures in a row -> scripted fallback -> summon fails -> demo route. Third account, third phone. */
async function failurePaths() {
  section('Failure paths (third phone)');
  wanderer = await openPhone('wanderer', [/\/auth\/v1\/token/, /\/auth\/v1\/signup/, /functions\/v1\/odysseus-chat/, /functions\/v1\/generate-odyssey/]);
  check('Wanderer signs up', await signUp(wanderer));
  await ctl('chatdelay=300&routedelay=300&failchat=0&failroute=0');
  await wanderer.press('Create an Odyssey');
  await wanderer.waitFor('Odysseus of Ithaca');
  await wanderer.waitUntil(`return all('[aria-label*=" says: "]').every((e) => ![...e.querySelectorAll('*')].some((n) => getComputedStyle(n).color === 'rgba(0, 0, 0, 0)' && n.textContent !== ''));`, 8000);

  const calls0 = mock.chatCalls.length;
  await ctl('failchat=4'); // two failures seen by the app, two model calls each
  await say(wanderer, 'Big Bend National Park, TX');
  check('First failure: in-character error and Try again', (await wanderer.waitFor('The winds swallowed my words', 20000)) && (await wanderer.buttonDisabled('Try again')) === false);
  await wanderer.press('Try again');
  check('Second failure in a row: the scripted Odysseus takes over', await wanderer.waitFor('The sea-winds drown out the gods', 20000));
  check('The error and Try again are gone', !(await wanderer.has('The winds swallowed my words')) && (await wanderer.buttonDisabled('Try again')) === null);
  check('He asks for the next missing thing (the harbor), since the first message answered "where to"', await wanderer.waitFor('From which harbor will your crew set sail?'));
  check('The model was called exactly 4 times for the 2 failures', mock.chatCalls.length - calls0 === 4, mock.chatCalls.length - calls0);
  check('The failing mode was used up', (await ctl('')).failChat === 0);
  await wanderer.shot('fallback-scripted');
  const scriptedCalls = mock.chatCalls.length;
  const waitDone = () => wanderer.waitUntil(`return all('[aria-label*=" says: "]').every((e) => ![...e.querySelectorAll('*')].some((n) => getComputedStyle(n).color === 'rgba(0, 0, 0, 0)' && n.textContent !== ''));`, 8000);
  const scriptedTurns = [
    ['Arlington, TX', 'How many travelers will join you'],
    ['four of us', 'How long shall you wander'],
    ['two days', 'What does your crew seek along the way'],
  ];
  for (const [answer, nextQuestion] of scriptedTurns) {
    await waitDone();
    check(`Scripted: Summon is not offered before the questions are done (${answer})`, !(await wanderer.has('Summon the Oracle')));
    await say(wanderer, answer);
    check(`Scripted: after "${answer}" he asks "${nextQuestion}..."`, await wanderer.waitFor(nextQuestion, 10000), (await wanderer.bubbles()).at(-1)?.text);
  }
  await waitDone();
  await say(wanderer, 'tacos and old stories');
  check('Scripted: after the last answer he closes and the Summon button appears', (await wanderer.waitFor('A worthy tale is taking shape', 10000)) && (await wanderer.waitFor('Summon the Oracle', 5000)));
  check('Scripted mode never called the model', mock.chatCalls.length === scriptedCalls, mock.chatCalls.length - scriptedCalls);
  await waitDone();
  await wanderer.shot('fallback-ready');

  // Summon fails.
  const routeCalls0 = mock.routeCalls.length;
  await ctl('failroute=2');
  await wanderer.press('Summon the Oracle');
  check('Summon: the cloud curtain shows', await wanderer.waitFor('The Oracle is consulting the gods', 8000));
  check('Summon fails: the error line appears', await wanderer.waitFor('The Oracle is silent. Try again in a moment.', 30000), await wanderer.text());
  check('Summon fails: the curtain parted (its message is gone)', await wanderer.waitGone('The Oracle is consulting the gods', 8000));
  check('Summon fails: "Sail the demo route instead" is offered, and Summon can be tried again', (await wanderer.buttonDisabled('Sail the demo route instead')) === false && (await wanderer.buttonDisabled('Summon the Oracle')) === false);
  check('Summon fails: still in the chat', (await wanderer.path()) === '/storyteller', await wanderer.path());
  const oracleInput = mock.routeCalls[routeCalls0]?.input ?? '';
  check('The scripted answers reached the Oracle in the right fields', ['Start: Arlington, TX', 'Destination: Big Bend National Park, TX', 'Crew size: 4', 'Duration: two days', 'Travel style: tacos and old stories'].every((l) => oracleInput.includes(l)), oracleInput);
  check('Both model attempts failed and were used up', mock.routeCalls.length - routeCalls0 === 2 && (await ctl('')).failRoute === 0, mock.routeCalls.length - routeCalls0);
  await wanderer.shot('summon-failed');
  await wanderer.press('Sail the demo route instead');
  check('The demo route opens the preview', await wanderer.waitFor('Gather Your Crew', 30000), await wanderer.text());
  check('The curtain parted on the preview', await wanderer.waitGone('The Oracle is consulting the gods', 8000));
  const demoStages = ((await wanderer.text()).match(/STAGE \d+/g) ?? []).length;
  check('The demo preview lists its stages', demoStages >= 3, demoStages);
  await wanderer.shot('demo-preview');
}

// --- run -------------------------------------------------------------------------------------------

let crashed = null;
try {
  await startMock();
  await startFunctions();
  buildWeb();
  await startStatic();
  await startChrome();
  await main();
} catch (e) {
  crashed = e;
  failures++;
  console.log(`\n  FAIL  test stopped: ${e.stack ?? e.message}`);
}

await cleanup();
console.log(`\nScreenshots: ${SHOTS}`);
console.log(failures === 0 ? `ALL ${results.length} CHECKS PASSED` : `${failures} FAILED (of ${results.length} checks${crashed ? ', run stopped early' : ''})`);
process.exit(failures === 0 ? 0 : 1);
