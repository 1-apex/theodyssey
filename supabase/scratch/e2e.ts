// End-to-end check of the whole backend over HTTP, exactly as the app uses it:
// anonymous auth, the Edge Function, RPCs, RLS, fog rules, Drachma, Realtime.
// No dependencies. Needs Node 22+ (run with `nvm use 24`).
//
//   Local stack (after `npx supabase start`):
//     node supabase/scratch/e2e.ts --local
//   Hosted project (reads the URL and publishable key from the env file):
//     node --env-file=supabase/functions/.env supabase/scratch/e2e.ts
//
//   --oracle       create the Odyssey with the real generate-odyssey function
//                  (default: create_demo_odyssey, which needs no LLM keys)
//   --mode=open    visibility mode (default: fog)
//
// Each run creates three anonymous users and one Odyssey, and leaves them
// in the database.

import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const useOracle = args.includes('--oracle');
const mode = args.includes('--mode=open') ? 'open' : 'fog';

const env = process.env;
let url = env.SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
let key =
  env.SUPABASE_PUBLISHABLE_KEY ??
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (args.includes('--local')) {
  const status = JSON.parse(execSync('npx -y supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  url = status.API_URL;
  key = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
}
if (!url || !key) {
  console.error('No Supabase URL / publishable key. Use --local, or pass an env file (see the header).');
  process.exit(1);
}

// --- tiny test harness -----------------------------------------------------

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        got: ${JSON.stringify(detail)}`}`);
  }
}
const section = (title: string) => console.log(`\n${title}`);

// --- HTTP helpers ----------------------------------------------------------

interface User { id: string; token: string }
interface Res { status: number; body: any } // any: responses are checked field by field below

async function http(path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<Res> {
  const res = await fetch(`${url}${path}`, {
    method: init.method ?? 'POST',
    headers: {
      apikey: key!,
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep raw text */ }
  return { status: res.status, body };
}

async function signIn(): Promise<User> {
  const r = await http('/auth/v1/signup', { body: {} });
  if (!r.body?.access_token) {
    throw new Error(`Anonymous sign-in failed (${r.status}). Is it enabled in Authentication settings? ${JSON.stringify(r.body)}`);
  }
  return { id: r.body.user.id, token: r.body.access_token };
}

const rpc = (name: string, user: User, params: object) => http(`/rest/v1/rpc/${name}`, { token: user.token, body: params });
const select = (query: string, user: User) => http(`/rest/v1/${query}`, { method: 'GET', token: user.token });

// --- Realtime: wait for one UPDATE on an odyssey row -------------------------

function waitForOdysseyUpdate(user: User, odysseyId: string): { ready: Promise<void>; event: Promise<boolean> } {
  const ws = new WebSocket(`${url!.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${key}&vsn=1.0.0`);
  let subscribed: () => void = () => {};
  let got: (v: boolean) => void = () => {};
  const ready = new Promise<void>((r) => (subscribed = r));
  const event = new Promise<boolean>((r) => (got = r));
  const done = (v: boolean) => { got(v); subscribed(); try { ws.close(); } catch { /* already closed */ } };

  ws.onopen = () => ws.send(JSON.stringify({
    topic: `realtime:e2e-${odysseyId}`,
    event: 'phx_join',
    ref: '1',
    payload: {
      config: { postgres_changes: [{ event: 'UPDATE', schema: 'public', table: 'odysseys', filter: `id=eq.${odysseyId}` }] },
      access_token: user.token,
    },
  }));
  ws.onmessage = (m) => {
    const msg = JSON.parse(String(m.data));
    // The join reply arrives before the DB subscription is live; `system` confirms it.
    if (msg.event === 'system' && msg.payload?.status === 'ok') subscribed();
    if (msg.event === 'postgres_changes') done(true);
  };
  ws.onerror = () => done(false);
  setTimeout(() => done(false), 15000);
  return { ready, event };
}

// --- the voyage ------------------------------------------------------------

console.log(`Target: ${url}   mode: ${mode}   route: ${useOracle ? 'Oracle (generate-odyssey)' : 'demo odyssey'}`);

section('Auth');
const [captain, sailor, outsider] = await Promise.all([signIn(), signIn(), signIn()]);
check('three anonymous users signed in', new Set([captain.id, sailor.id, outsider.id]).size === 3);

section(useOracle ? 'Create: the Oracle' : 'Create: demo odyssey');
let created: Res;
if (useOracle) {
  const t0 = Date.now();
  created = await http('/functions/v1/generate-odyssey', {
    token: captain.token,
    body: {
      start: 'Arlington, TX', destination: 'Big Bend National Park, TX', crew_size: 2,
      travel_style: 'scenic, food stops, no rush', duration: '2 days', visibility_mode: mode,
    },
  });
  console.log(`        (took ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  const bad = await http('/functions/v1/generate-odyssey', { token: captain.token, body: { start: 'x' } });
  check('invalid request is rejected with 400', bad.status === 400 && bad.body?.error === 'invalid_request', bad);
} else {
  created = await rpc('create_demo_odyssey', captain, { p_visibility_mode: mode });
}
check('odyssey created with id and join code', created.status === 200 && /^[A-Z2-9]{6}$/.test(created.body?.join_code ?? ''), created);
if (created.status !== 200) {
  console.log('\nCannot continue without an Odyssey.');
  process.exit(1);
}
const odysseyId: string = created.body.odyssey_id;
const joinCode: string = created.body.join_code;

const lobby = await select(`odysseys?id=eq.${odysseyId}&select=*`, captain);
check('captain can read the odyssey, status is lobby', lobby.body?.[0]?.status === 'lobby', lobby);
check('visibility mode saved', lobby.body?.[0]?.visibility_mode === mode, lobby.body?.[0]);

section('Crew');
const badCode = await rpc('join_odyssey', sailor, { p_join_code: 'ZZZZZZ', p_nickname: 'Nobody', p_avatar_id: 'a1' });
check('wrong join code is rejected', badCode.status >= 400 && badCode.body?.message === 'invalid_join_code', badCode);

const capJoin = await rpc('join_odyssey', captain, { p_join_code: joinCode, p_nickname: 'Odysseus', p_avatar_id: 'avatar_01' });
const sailJoin = await rpc('join_odyssey', sailor, { p_join_code: ` ${joinCode.toLowerCase()} `, p_nickname: 'Eurylochus', p_avatar_id: 'avatar_02' });
check('captain joins', capJoin.status === 200 && capJoin.body?.odyssey_id === odysseyId, capJoin);
check('sailor joins (code is case and space insensitive)', sailJoin.status === 200 && !!sailJoin.body?.member_id, sailJoin);
const rejoin = await rpc('join_odyssey', sailor, { p_join_code: joinCode, p_nickname: 'Eury', p_avatar_id: 'avatar_03' });
check('joining twice keeps the same member', rejoin.body?.member_id === sailJoin.body?.member_id, rejoin);

const crew = await select(`members?odyssey_id=eq.${odysseyId}&select=nickname`, sailor);
check('crew list has 2 members with the updated nickname', crew.body?.length === 2 && crew.body.some((m: { nickname: string }) => m.nickname === 'Eury'), crew);

section('Access control');
const outOdyssey = await select(`odysseys?id=eq.${odysseyId}&select=id`, outsider);
check('outsider cannot read the odyssey', Array.isArray(outOdyssey.body) && outOdyssey.body.length === 0, outOdyssey);
const outStages = await rpc('get_visible_stages', outsider, { p_odyssey_id: odysseyId });
check('outsider cannot call get_visible_stages', outStages.status >= 400 && outStages.body?.message === 'not_crew', outStages);
const direct = await select(`stages?odyssey_id=eq.${odysseyId}&select=*`, sailor);
check('direct select on stages is denied, even for crew', direct.status === 401 || direct.status === 403, direct);
const directWrite = await http(`/rest/v1/odysseys?id=eq.${odysseyId}`, { method: 'PATCH', token: captain.token, body: { status: 'complete' } });
check('direct write to odysseys is denied', directWrite.status === 401 || directWrite.status === 403, directWrite);

section('Before sailing');
let visible = await rpc('get_visible_stages', sailor, { p_odyssey_id: odysseyId });
const total: number = visible.body?.total_stages;
check('total_stages is reported', total >= 3, visible);
check(
  mode === 'fog' ? 'fog: only the first stage is visible' : 'open: every stage is visible',
  visible.body?.stages?.length === (mode === 'fog' ? 1 : total),
  visible.body?.stages?.length,
);
const first = visible.body.stages[0];
const early = await rpc('clear_stage', sailor, { p_stage_id: first.id, p_lat: first.lat, p_lng: first.lng });
check('cannot clear a stage before setting sail', early.body?.result === 'not_sailing', early);
const mutiny = await rpc('set_sail', sailor, { p_odyssey_id: odysseyId });
check('only the captain can set sail', mutiny.status >= 400 && mutiny.body?.message === 'not_captain', mutiny);

section('Set sail (with Realtime)');
const listener = waitForOdysseyUpdate(sailor, odysseyId);
await listener.ready;
const sail = await rpc('set_sail', captain, { p_odyssey_id: odysseyId });
check('captain sets sail, status is voyage', sail.body?.status === 'voyage', sail);
check('sailor receives a Realtime update for the odyssey', await listener.event);

section('Clearing stages');
const far = await rpc('clear_stage', sailor, { p_stage_id: first.id, p_lat: first.lat + 0.05, p_lng: first.lng });
check('too far away is rejected with the distance', far.body?.result === 'too_far' && far.body?.distance_m > first.radius_m, far);
const noPos = await rpc('clear_stage', sailor, { p_stage_id: first.id });
check('missing position is rejected', noPos.status >= 400 && noPos.body?.message === 'position_required', noPos);

let expectedPoints = 0;
let clearedCount = 0;
let lastStatus = '';
for (let order = 1; order <= total; order++) {
  visible = await rpc('get_visible_stages', order % 2 ? sailor : captain, { p_odyssey_id: odysseyId });
  const stage = visible.body.stages.find((s: { order: number }) => s.order === order);
  if (!stage) { check(`stage ${order} is visible as the current target`, false, visible.body); break; }
  if (mode === 'fog') {
    check(`fog: before clearing stage ${order}, exactly ${order} stage(s) visible`, visible.body.stages.length === order, visible.body.stages.length);
  }

  // Alternate who clears; use the manual button for even stages.
  const who = order % 2 ? sailor : captain;
  const params = order % 2
    ? { p_stage_id: stage.id, p_lat: stage.lat + 0.001, p_lng: stage.lng } // ~111 m off, inside 250 m
    : { p_stage_id: stage.id, p_manual: true };
  const [a, b] = await Promise.all([rpc('clear_stage', who, params), rpc('clear_stage', who === sailor ? captain : sailor, params)]);
  const results = [a.body?.result, b.body?.result].sort();
  check(`stage ${order}: two phones at once -> one cleared, one already_cleared`, results[0] === 'already_cleared' && results[1] === 'cleared', [a, b]);
  expectedPoints += stage.points;
  clearedCount++;
  lastStatus = (a.body?.result === 'cleared' ? a : b).body?.odyssey_status;
}
check('odyssey is complete after Ithaca', lastStatus === 'complete', lastStatus);

section('Ithaca');
visible = await rpc('get_visible_stages', sailor, { p_odyssey_id: odysseyId });
check('full route is revealed on completion', visible.body?.stages?.length === total, visible.body?.stages?.length);
check('every stage has cleared_at', visible.body?.stages?.every((s: { cleared_at: string | null }) => s.cleared_at !== null), visible.body?.stages);
const again = await rpc('clear_stage', sailor, { p_stage_id: first.id, p_manual: true });
check('clearing again changes nothing', again.body?.result === 'already_cleared' && again.body?.points_awarded === 0, again);

section('Drachma');
const summary = await rpc('get_points_summary', captain, { p_odyssey_id: odysseyId });
check(
  `both members have ${expectedPoints} Drachma from ${clearedCount} stages`,
  summary.body?.length === 2 &&
    summary.body.every((m: { total_points: number; stages_cleared: number }) => m.total_points === expectedPoints && m.stages_cleared === clearedCount),
  summary,
);
const ledger = await select(`points_ledger?odyssey_id=eq.${odysseyId}&select=reason`, sailor);
check('ledger has one row per member per stage', ledger.body?.length === 2 * total, ledger.body?.length);
check('Ithaca is recorded in the ledger', ledger.body?.filter((l: { reason: string }) => l.reason === 'ithaca_reached').length === 2, ledger.body);
const outSummary = await rpc('get_points_summary', outsider, { p_odyssey_id: odysseyId });
check('outsider sees no points', Array.isArray(outSummary.body) && outSummary.body.length === 0, outSummary);
const lateJoin = await rpc('join_odyssey', outsider, { p_join_code: joinCode, p_nickname: 'Late', p_avatar_id: 'a1' });
check('cannot join a completed odyssey', lateJoin.status >= 400 && lateJoin.body?.message === 'odyssey_not_joinable', lateJoin);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
