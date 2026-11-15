// End-to-end test of the real app UI, as two phones.
//
// Builds the web version of the Expo app pointed at the LOCAL Supabase stack,
// opens it in headless Chrome as two separate users (Captain and Sailor), and
// plays a whole Odyssey through the screens: create, preview, lobby, join,
// set sail, clear every stage, Ithaca. Screenshots are saved along the way.
//
//   npx supabase start            (once; and `npx supabase db reset` after schema changes)
//   node scripts/app-e2e.mjs                      fog, crew points, demo route
//   node scripts/app-e2e.mjs --mode=open
//   node scripts/app-e2e.mjs --points=arriver
//   node scripts/app-e2e.mjs --oracle             route from generate-odyssey (needs `supabase functions serve`)
//   node scripts/app-e2e.mjs --skip-build         reuse the last web build
//   node scripts/app-e2e.mjs --out=/some/dir      where the build and screenshots go
//
// Needs Node 22+, Google Chrome, and the local stack. No npm dependencies.
// Without --oracle the Oracle call is expected to fail (no function served),
// which exercises the app's "Sail the demo route instead" fallback.

import { execSync, spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => (args.find((a) => a.startsWith(`--${name}=`)) ?? `=${fallback}`).split('=').slice(1).join('=');

const MODE = option('mode', 'fog');
const POINTS = option('points', 'crew');
const USE_ORACLE = flag('oracle');
const OUT = path.resolve(option('out', path.join(os.tmpdir(), 'odyssey-app-e2e')));
const WEB = path.join(OUT, 'web');
const SHOTS = path.join(OUT, `shots-${MODE}-${POINTS}${USE_ORACLE ? '-oracle' : ''}`);
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8090 + Math.floor(Math.random() * 500);
const DEBUG_PORT = 9300 + Math.floor(Math.random() * 500);

mkdirSync(SHOTS, { recursive: true });

// --- results -----------------------------------------------------------------

let failures = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `\n        got: ${String(detail).slice(0, 300)}`}`);
  return ok;
}
const section = (title) => console.log(`\n${title}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- build and serve ---------------------------------------------------------

const status = JSON.parse(execSync('npx -y supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
const SUPABASE_URL = status.API_URL;
const SUPABASE_KEY = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Local Supabase is not running. Start it with: npx supabase start');
  process.exit(1);
}

if (!flag('skip-build') || !existsSync(path.join(WEB, 'index.html'))) {
  console.log(`Building the web app into ${WEB} ...`);
  execSync(`npx expo export --platform web --output-dir "${WEB}"`, {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, EXPO_PUBLIC_SUPABASE_URL: SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_KEY },
  });
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const requested = path.join(WEB, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  // Single-page app: anything that is not a file gets index.html.
  const file = requested.startsWith(WEB) && existsSync(requested) && statSync(requested).isFile() ? requested : path.join(WEB, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const APP = `http://127.0.0.1:${PORT}`;

// --- Chrome over the DevTools protocol -------------------------------------------

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${path.join(OUT, `chrome-${Date.now()}`)}`, 'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await sleep(200);
  try {
    wsUrl = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json()).webSocketDebuggerUrl;
  } catch { /* not up yet */ }
}
if (!wsUrl) {
  console.error('Could not start Chrome. Set CHROME_PATH if it is installed somewhere else.');
  process.exit(1);
}

const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let nextId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
  }
};
const cdp = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

/** One isolated browser profile = one phone with its own anonymous user. */
async function openPhone(name) {
  const { browserContextId } = await cdp('Target.createBrowserContext');
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => cdp(method, params, sessionId);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 1, mobile: true });

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
  `;
  const run = (body) => evaluate(`(() => { ${HELPERS} ${body} })()`);

  const phone = {
    name,
    goto: (url) => send('Page.navigate', { url }),
    text: () => run('return text();'),
    has: (needle) => run(`return text().includes(${JSON.stringify(needle)});`),
    /** Waits until the visible text contains `needle`. */
    async waitFor(needle, timeoutMs = 15000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (await phone.has(needle)) return true;
        await sleep(150);
      }
      return false;
    },
    async waitGone(needle, timeoutMs = 15000) {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end) {
        if (!(await phone.has(needle))) return true;
        await sleep(150);
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
    labelled: (label) => run(`return all('[aria-label=${JSON.stringify(label)}]').map((e) => e.textContent)[0] ?? null;`),
    count: (needle) => run(`return text().split(${JSON.stringify(needle)}).length - 1;`),
    path: () => evaluate('location.pathname'),
    async shot(label) {
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      const file = path.join(SHOTS, `${String(++shotNo).padStart(2, '0')}-${name}-${label}.png`);
      writeFileSync(file, Buffer.from(data, 'base64'));
    },
  };
  return phone;
}
let shotNo = 0;

// --- the test ----------------------------------------------------------------------

async function main() {
  console.log(`App: ${APP}   Supabase: ${SUPABASE_URL}   mode: ${MODE}   points: ${POINTS}   route: ${USE_ORACLE ? 'Oracle' : 'demo fallback'}`);
  const captain = await openPhone('captain');
  const sailor = await openPhone('sailor');

  section('Home');
  await captain.goto(APP);
  check('Captain: home screen loads', await captain.waitFor('Create an Odyssey'));
  check('Home is connected to Supabase (no configuration warning)', !(await captain.has('not connected to Supabase')));
  await captain.shot('home');

  section('Create');
  await captain.press('Create an Odyssey');
  check('Create screen opens', await captain.waitFor('Summon the Oracle'));
  await captain.press('Summon the Oracle');
  check('Empty form is rejected with a message', await captain.waitFor('Enter where you start'));
  await captain.type('SETTING SAIL FROM', 'Arlington, TX');
  await captain.type('BOUND FOR (ITHACA)', 'Big Bend National Park, TX');
  await captain.type('CAPTAIN NICKNAME', 'Odysseus');
  await captain.press('Monarch');
  await captain.press(MODE === 'fog' ? 'Fog' : 'Open');
  await captain.press(POINTS === 'arriver' ? 'The one who arrives' : 'The whole Crew');
  await captain.shot('create-filled');
  await captain.press('Summon the Oracle');
  if (USE_ORACLE) {
    check('Oracle returns a route and the preview opens', await captain.waitFor('Gather Your Crew', 60000), await captain.text());
  } else {
    check('Oracle failure shows a message and offers the demo route', await captain.waitFor('Sail the demo route instead', 30000), await captain.text());
    await captain.shot('create-oracle-failed');
    await captain.press('Sail the demo route instead');
    check('Demo route opens the preview', await captain.waitFor('Gather Your Crew', 20000), await captain.text());
  }

  section('Oracle preview');
  const previewText = await captain.text();
  const total = (previewText.match(/STAGE \d+/g) ?? []).length;
  check('Preview lists at least 3 stages', total >= 3, total);
  const hidden = await captain.count('Uncharted island');
  check(MODE === 'fog' ? `Fog: ${total - 1} of ${total} stages are hidden` : 'Open: no stage is hidden', hidden === (MODE === 'fog' ? total - 1 : 0), hidden);
  check(MODE === 'fog' ? 'Fog: destination is not named' : 'Open: destination is named', (await captain.has('Ithaca (hidden)')) === (MODE === 'fog'));
  await captain.shot('preview');
  await captain.press('Gather Your Crew');

  section('Lobby');
  check('Captain reaches the lobby', await captain.waitFor('Share this code'));
  const code = (await captain.labelled('JOIN CODE'))?.trim() ?? '';
  check('Lobby shows a 6 character join code', /^[A-Z2-9]{6}$/.test(code), code);
  check('Crew list shows the Captain', (await captain.has('Odysseus')) && (await captain.waitFor('Crew · 1')));
  check('Captain sees the launch button', await captain.has('Begin the Voyage'));

  section('Join (second phone)');
  await sailor.goto(APP);
  await sailor.waitFor('Join a Crew');
  await sailor.press('Join a Crew');
  await sailor.waitFor('Join the Odyssey');
  await sailor.type('JOIN CODE', 'ZZZZZZ');
  await sailor.type('YOUR NICKNAME', 'Eurylochus');
  await sailor.press('Join the Odyssey');
  check('Wrong join code is rejected with a message', await sailor.waitFor('No Odyssey has that code'));
  await sailor.type('JOIN CODE', code.toLowerCase());
  await sailor.press('Join the Odyssey');
  check('Sailor joins with a lower-case code and reaches the lobby', await sailor.waitFor('Share this code'), await sailor.text());
  check('Sailor sees both crew members', await sailor.waitFor('Crew · 2'));
  check('Sailor cannot set sail, and is told to wait', (await sailor.has('Waiting for the Captain')) && !(await sailor.has('Begin the Voyage')));
  check('REALTIME: Captain sees the Sailor arrive without reloading', await captain.waitFor('Crew · 2'));
  await captain.shot('lobby');
  await sailor.shot('lobby');

  section('Set sail');
  await captain.press('Begin the Voyage');
  check('Captain lands on the voyage screen', await captain.waitFor('We have arrived'));
  check('REALTIME: Sailor is moved to the voyage screen', await sailor.waitFor('We have arrived'));
  check(`Voyage shows stage 1 of ${total}`, await captain.waitFor(`STAGE 1 / ${total}`));
  if (MODE === 'fog') check('Fog: the map hides the other islands', (await captain.count('?')) >= total - 1, await captain.count('?'));
  await captain.shot('voyage-start');

  section('Clearing stages');
  const earned = { captain: 0, sailor: 0 };
  let sum = 0;
  for (let n = 1; n <= total; n++) {
    const who = n % 2 ? captain : sailor;
    const other = n % 2 ? sailor : captain;
    const before = await who.text();
    const pts = n === total ? 250 : 100;
    if (n % 2) {
      await who.press('Simulate travel');
      check(`Stage ${n}: Captain sails (simulated GPS) and the stage clears`, await who.waitFor(`+${pts} Drachma`, 20000), await who.text());
    } else {
      await who.press('We have arrived');
      check(`Stage ${n}: Sailor arrives manually and the stage clears`, await who.waitFor(`+${pts} Drachma`, 20000), await who.text());
    }
    sum += pts;
    earned[who.name] += pts;
    const next = n === total ? 'Voyage complete' : `STAGE ${n + 1} / ${total}`;
    check(`Stage ${n}: both phones move on to "${next}"`, (await who.waitFor(next)) && (await other.waitFor(next)), `${before.slice(0, 80)} ...`);
    const expectOther = POINTS === 'arriver' ? earned[other.name] : sum;
    check(`Stage ${n}: the other phone shows ♦ ${expectOther}`, await other.waitFor(`♦ ${expectOther}`), await other.text());
    if (n === 1) await who.shot('voyage-after-stage-1');
  }
  await captain.shot('voyage-complete');

  section('Ithaca');
  await captain.press('Enter Ithaca');
  check('Captain reaches Ithaca', await captain.waitFor('ITHACA!'));
  const mine = POINTS === 'arriver' ? earned.captain : sum;
  const summary = (await captain.labelled('finish-summary')) ?? '';
  check(`Summary shows ${total} / ${total} and ${mine} Drachma`, summary.includes(`${total} / ${total}`) && summary.includes(String(mine)), summary);
  check('Full route is listed, nothing hidden', (await captain.count('Uncharted island')) === 0 && ((await captain.text()).match(/STAGE \d+/g) ?? []).length === total);
  const theirs = POINTS === 'arriver' ? earned.sailor : sum;
  check(`Crew totals list both members (Sailor has ♦ ${theirs})`, (await captain.has('Eurylochus')) && (await captain.has(`♦ ${theirs}`)));
  await captain.shot('ithaca');
  await sailor.press('Enter Ithaca');
  check('Sailor reaches Ithaca too', await sailor.waitFor('ITHACA!'));

  section('Rejoining');
  await sailor.goto(APP);
  await sailor.waitFor('Join a Crew');
  await sailor.press('Join a Crew');
  await sailor.waitFor('Join the Odyssey');
  await sailor.type('JOIN CODE', code);
  await sailor.type('YOUR NICKNAME', 'Latecomer');
  await sailor.press('Join the Odyssey');
  check('A completed Odyssey cannot be joined', await sailor.waitFor('not taking new crew'));

  check('No uncaught JavaScript errors in either phone', consoleErrors.length === 0, consoleErrors.join(' | '));
}

let crashed = null;
try {
  await main();
} catch (e) {
  crashed = e;
  failures++;
  console.log(`\n  FAIL  test stopped: ${e.message}`);
}

chrome.kill();
server.close();
console.log(`\nScreenshots: ${SHOTS}`);
console.log(failures === 0 ? `ALL ${results.length} CHECKS PASSED` : `${failures} FAILED (of ${results.length} checks${crashed ? ', run stopped early' : ''})`);
process.exit(failures === 0 ? 0 : 1);
