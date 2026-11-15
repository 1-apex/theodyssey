/// <reference types="node" />
// The Supabase adapter and the Edge Function / RPC wrappers, against a fake Supabase client.
// No network: `../../lib/supabase` and `react-native` are replaced before the modules load.
import assert from 'node:assert/strict';
import Module from 'node:module';
import { afterEach, test } from 'node:test';

import type { Stage } from '../../lib/types';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface RpcReply {
  data?: unknown;
  error?: { message: string } | null;
}
interface FakeChannel {
  topic: string;
  filters: { table: string; filter: string; event: string }[];
  onSubscribe: ((status: string) => void) | null;
  fire: () => void;
}

const fake = {
  rpcReplies: [] as RpcReply[],
  rpcCalls: [] as { name: string; params: Record<string, unknown> }[],
  tableCalls: [] as string[],
  tableReply: { data: null as unknown, error: null as { message: string } | null },
  channels: [] as FakeChannel[],
  removed: [] as string[],
  appStateListeners: [] as ((s: string) => void)[],
  appStateRemoved: 0,
};

const fakeSupabase = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  isSupabaseConfigured: true,
  ensureSignedIn: async () => 'user-1',
  accessToken: async () => 'token-1',
  supabase: {
    rpc: async (name: string, params: Record<string, unknown>) => {
      fake.rpcCalls.push({ name, params });
      const reply = fake.rpcReplies.shift();
      if (reply === undefined) throw new Error(`no fake reply queued for rpc ${name}`);
      return { data: reply.data ?? null, error: reply.error ?? null };
    },
    from: (table: string) => {
      fake.tableCalls.push(table);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order']) builder[m] = () => builder;
      builder.single = async () => fake.tableReply;
      builder.maybeSingle = async () => fake.tableReply;
      builder.then = (ok: (v: unknown) => unknown) => Promise.resolve(fake.tableReply).then(ok);
      return builder;
    },
    channel: (topic: string) => {
      const ch: FakeChannel & { on: unknown; subscribe: unknown } = {
        topic,
        filters: [],
        onSubscribe: null,
        fire: () => {},
        on(_type: string, cfg: { table: string; filter: string; event: string }, _cb: () => void) {
          ch.filters.push(cfg);
          ch.fire = _cb;
          return ch;
        },
        subscribe(cb: (status: string) => void) {
          ch.onSubscribe = cb;
          return ch;
        },
      };
      fake.channels.push(ch);
      return ch;
    },
    removeChannel: async (ch: FakeChannel) => {
      fake.removed.push(ch.topic);
    },
  },
};

const fakeReactNative = {
  AppState: {
    addEventListener: (_event: string, cb: (s: string) => void) => {
      fake.appStateListeners.push(cb);
      return { remove: () => (fake.appStateRemoved += 1) };
    },
  },
};

// `any` is deliberate: Node's private loader hook has no public types.
const mod = Module as any;
const originalLoad = mod._load;
mod._load = function (request: string, ...rest: unknown[]) {
  if (request === '../../lib/supabase') return fakeSupabase;
  if (request === 'react-native') return fakeReactNative;
  return originalLoad.call(this, request, ...rest);
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after the hook is installed
const { supabaseBackend, refreshOdyssey } = require('./supabaseBackend') as typeof import('./supabaseBackend');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- same
const api = require('./api') as typeof import('./api');

const ID = 'odyssey-1';
const stage = (over: Partial<Stage> = {}): Stage => ({
  id: 's1',
  odyssey_id: ID,
  order: 1,
  name: 'Place',
  title: 'Isle',
  lore: '',
  lat: 1,
  lng: 2,
  radius_m: 250,
  points: 100,
  cleared_at: null,
  cleared_by: null,
  ...over,
});
const clearedStage = stage({ cleared_at: '2026-01-01T00:00:00Z', cleared_by: 'm1' });
const visible = (stages: Stage[], total = stages.length) => ({ data: { total_stages: total, stages } });
const clearReply = (result: string) => ({
  data: { result, stage_id: 's1', distance_m: null, points_awarded: 0, odyssey_status: 'voyage', current_stage_order: 1 },
});
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  fake.rpcReplies.length = 0;
  fake.rpcCalls.length = 0;
  fake.tableCalls.length = 0;
  fake.tableReply = { data: null, error: null };
  fake.channels.length = 0;
  fake.removed.length = 0;
  fake.appStateListeners.length = 0;
  fake.appStateRemoved = 0;
});

// ---------------------------------------------------------------------------
// D3: stages are read only through the visible-stages RPC
// ---------------------------------------------------------------------------

test('D3: getVisibleStages and getStageCount use get_visible_stages and never select from stages', async () => {
  fake.rpcReplies.push(visible([stage()], 5), visible([stage()], 5));
  assert.deepEqual(await supabaseBackend.getVisibleStages(ID), [stage()]);
  assert.equal(await supabaseBackend.getStageCount!(ID), 5);
  assert.deepEqual(fake.rpcCalls.map((c) => c.name), ['get_visible_stages', 'get_visible_stages']);
  assert.deepEqual(fake.rpcCalls[0].params, { p_odyssey_id: ID });
  assert.equal(fake.tableCalls.includes('stages'), false);
});

test('D3: a failed visible-stages read rejects with the server message', async () => {
  fake.rpcReplies.push({ error: { message: 'not_crew' } });
  await assert.rejects(supabaseBackend.getVisibleStages(ID), /not_crew/);
});

test('D1: getOdyssey, getMembers and getLedger read their tables and reject on error', async () => {
  fake.tableReply = { data: { id: ID }, error: null };
  assert.deepEqual(await supabaseBackend.getOdyssey(ID), { id: ID });
  fake.tableReply = { data: [{ id: 'm' }], error: null };
  assert.deepEqual(await supabaseBackend.getMembers(ID), [{ id: 'm' }]);
  assert.deepEqual(await supabaseBackend.getLedger(ID), [{ id: 'm' }]);
  assert.deepEqual(fake.tableCalls, ['odysseys', 'members', 'points_ledger']);
  fake.tableReply = { data: null, error: { message: 'boom' } };
  await assert.rejects(supabaseBackend.getOdyssey(ID), /boom/);
  await assert.rejects(supabaseBackend.getMembers(ID), /boom/);
  await assert.rejects(supabaseBackend.getLedger(ID), /boom/);
});

// ---------------------------------------------------------------------------
// D2 / D5: clear_stage mapping and who decides the member
// ---------------------------------------------------------------------------

test('D2: RPC errors map to rejection reasons', async () => {
  const cases: [string, string][] = [
    ['stage_not_found', 'not_found'],
    ['not_crew', 'not_member'],
    ['position_required', 'too_far'],
    ['invalid_position', 'too_far'],
  ];
  for (const [message, reason] of cases) {
    fake.rpcReplies.push({ error: { message } });
    const r = await supabaseBackend.clearStage({ odysseyId: ID, stageId: 's1', memberId: 'm1', position: { lat: 1, lng: 2 } });
    assert.deepEqual(r, { status: 'rejected', reason }, message);
  }
});

test('D2: unknown RPC errors reject instead of pretending success', async () => {
  for (const message of ['not_authenticated', 'something unexpected', 'JWT expired']) {
    fake.rpcReplies.push({ error: { message } });
    await assert.rejects(
      supabaseBackend.clearStage({ odysseyId: ID, stageId: 's1', memberId: 'm1', position: { lat: 1, lng: 2 } }),
      new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  }
});

test('D2: non-clear outcomes map to rejection reasons', async () => {
  const cases: [string, string][] = [
    ['not_sailing', 'not_in_voyage'],
    ['not_current', 'not_current_target'],
    ['too_far', 'too_far'],
  ];
  for (const [outcome, reason] of cases) {
    fake.rpcReplies.push(clearReply(outcome));
    const r = await supabaseBackend.clearStage({ odysseyId: ID, stageId: 's1', memberId: 'm1', position: { lat: 1, lng: 2 } });
    assert.deepEqual(r, { status: 'rejected', reason }, outcome);
  }
});

test('D2: cleared and already_cleared return the stage from the visible list', async () => {
  for (const outcome of ['cleared', 'already_cleared'] as const) {
    fake.rpcReplies.push(clearReply(outcome), visible([clearedStage]));
    const r = await supabaseBackend.clearStage({ odysseyId: ID, stageId: 's1', memberId: 'm1', position: { lat: 1, lng: 2 } });
    assert.deepEqual(r, { status: outcome, stage: clearedStage });
  }
});

test('D2: a cleared stage that cannot be re-read rejects (the clear happened, the app must not claim a result it lacks)', async () => {
  fake.rpcReplies.push(clearReply('cleared'), visible([]));
  await assert.rejects(
    supabaseBackend.clearStage({ odysseyId: ID, stageId: 's1', memberId: 'm1', position: { lat: 1, lng: 2 } }),
    /not visible/,
  );
});

test('D5: memberId is never sent; manual sends null position and p_manual', async () => {
  fake.rpcReplies.push(clearReply('too_far'), clearReply('cleared'), visible([clearedStage]));
  await supabaseBackend.clearStage({ odysseyId: ID, stageId: 's1', memberId: 'spoofed', position: { lat: 1.5, lng: 2.5 } });
  await supabaseBackend.clearStage({ odysseyId: ID, stageId: 's1', memberId: 'spoofed', position: null, manual: true });
  assert.deepEqual(fake.rpcCalls[0].params, { p_stage_id: 's1', p_lat: 1.5, p_lng: 2.5, p_manual: false });
  assert.deepEqual(fake.rpcCalls[1].params, { p_stage_id: 's1', p_lat: null, p_lng: null, p_manual: true });
  assert.equal(JSON.stringify(fake.rpcCalls).includes('spoofed'), false);
});

// ---------------------------------------------------------------------------
// D4: subscribe
// ---------------------------------------------------------------------------

test('D4: one channel per Odyssey covers odysseys, members and points_ledger, never stages', () => {
  const unsub1 = supabaseBackend.subscribe(ID, () => {});
  const unsub2 = supabaseBackend.subscribe(ID, () => {});
  assert.equal(fake.channels.length, 1, 'two subscribers share one channel');
  assert.deepEqual(
    fake.channels[0].filters.map((f) => f.table).sort(),
    ['members', 'odysseys', 'points_ledger'],
  );
  assert.ok(fake.channels[0].filters.every((f) => f.filter.includes(ID) && f.event === '*'));
  unsub1();
  assert.deepEqual(fake.removed, [], 'channel stays while one subscriber is left');
  unsub2();
  assert.deepEqual(fake.removed, [`odyssey-${ID}`]);
  assert.equal(fake.appStateRemoved, 1, 'AppState listener removed with the channel');
});

test('D4: a burst of changes becomes one notification per listener; a throwing listener does not starve the rest', async () => {
  let a = 0;
  let b = 0;
  const unsubA = supabaseBackend.subscribe(ID, () => {
    a += 1;
    throw new Error('listener bug');
  });
  const unsubB = supabaseBackend.subscribe(ID, () => {
    b += 1;
  });
  const ch = fake.channels[0];
  ch.fire();
  ch.fire();
  ch.fire();
  await wait(200);
  assert.deepEqual([a, b], [1, 1]);
  unsubA();
  unsubB();
});

test('D4: reconnect (SUBSCRIBED) and returning to the app both trigger a reload', async () => {
  let n = 0;
  const unsub = supabaseBackend.subscribe(ID, () => {
    n += 1;
  });
  fake.channels[0].onSubscribe!('SUBSCRIBED');
  await wait(200);
  assert.equal(n, 1);
  fake.channels[0].onSubscribe!('TIMED_OUT');
  await wait(200);
  assert.equal(n, 1, 'no reload for a non-SUBSCRIBED status');
  fake.appStateListeners[0]('background');
  fake.appStateListeners[0]('active');
  await wait(200);
  assert.equal(n, 2);
  unsub();
});

test('D4: after the last unsubscribe nothing fires, and a new subscribe opens a fresh channel', async () => {
  let n = 0;
  const unsub = supabaseBackend.subscribe(ID, () => {
    n += 1;
  });
  const first = fake.channels[0];
  unsub();
  refreshOdyssey(ID);
  first.fire();
  await wait(200);
  assert.equal(n, 0);
  const unsub2 = supabaseBackend.subscribe(ID, () => {});
  assert.equal(fake.channels.length, 2);
  unsub2();
});

test('D4: a pending debounce timer is cleared on close (no notification after unsubscribe)', async () => {
  let n = 0;
  const unsub = supabaseBackend.subscribe(ID, () => {
    n += 1;
  });
  fake.channels[0].fire();
  unsub();
  await wait(200);
  assert.equal(n, 0);
});

// ---------------------------------------------------------------------------
// D7: the create flow's wrappers
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
const request = {
  start: 'A',
  destination: 'B',
  crew_size: 4,
  travel_style: '',
  duration: '',
  visibility_mode: 'fog' as const,
};
const reply = (status: number, body: string): void => {
  globalThis.fetch = (async () => new Response(body, { status })) as typeof fetch;
};

test('D7: createOdyssey returns the response on success', async () => {
  reply(200, JSON.stringify({ odyssey_id: 'o', join_code: 'ABC234' }));
  assert.deepEqual(await api.createOdyssey(request), { odyssey_id: 'o', join_code: 'ABC234' });
});

test('D7: createOdyssey surfaces each function error code', async () => {
  for (const code of ['invalid_request', 'not_authenticated', 'endpoint_not_found', 'too_few_stages', 'llm_failed', 'llm_bad_output', 'not_configured', 'internal']) {
    reply(500, JSON.stringify({ error: code, message: 'x' }));
    await assert.rejects(api.createOdyssey(request), (e: InstanceType<typeof api.ApiError>) => e.code === code, code);
  }
});

test('D7: network failure becomes `network`; non-JSON and gateway-shaped bodies become `internal`', async () => {
  globalThis.fetch = (async () => {
    throw new TypeError('Network request failed');
  }) as typeof fetch;
  await assert.rejects(api.createOdyssey(request), (e: InstanceType<typeof api.ApiError>) => e.code === 'network');
  reply(502, '<html>Bad gateway</html>');
  await assert.rejects(api.createOdyssey(request), (e: InstanceType<typeof api.ApiError>) => e.code === 'internal');
  // Supabase gateway rejections use { code, message }, not { error }.
  reply(401, JSON.stringify({ code: 'UNAUTHORIZED_NO_AUTH_HEADER', message: 'Missing authorization header' }));
  await assert.rejects(api.createOdyssey(request), (e: InstanceType<typeof api.ApiError>) => e.code === 'internal');
  reply(200, JSON.stringify({ unexpected: true }));
  await assert.rejects(api.createOdyssey(request), (e: InstanceType<typeof api.ApiError>) => e.code === 'internal');
});

test('D7: RPC wrappers pass server snake_case errors through and hide everything else behind `unknown`', async () => {
  fake.rpcReplies.push({ error: { message: 'invalid_join_code' } });
  await assert.rejects(api.joinOdyssey('x', 'n', 'avatar_0'), (e: InstanceType<typeof api.ApiError>) => e.code === 'invalid_join_code');
  // The hosted project today answers create_demo_odyssey with a PostgREST 404 text like this.
  fake.rpcReplies.push({ error: { message: 'Could not find the function public.create_demo_odyssey(p_points_mode, p_visibility_mode) in the schema cache' } });
  await assert.rejects(api.createDemoOdyssey('fog', 'crew'), (e: InstanceType<typeof api.ApiError>) => e.code === 'unknown');
  assert.deepEqual(fake.rpcCalls.at(-1)!.params, { p_visibility_mode: 'fog', p_points_mode: 'crew' });
});

test('D7: every error code the app can raise has copy', async () => {
  const { app } = await import('../../theme/copy');
  const codes = [
    // function
    'invalid_request', 'not_authenticated', 'endpoint_not_found', 'too_few_stages', 'llm_failed', 'llm_bad_output', 'not_configured', 'internal',
    // RPCs the app calls (join_odyssey, set_sail, create_demo_odyssey)
    'invalid_join_code', 'odyssey_not_joinable', 'invalid_nickname', 'invalid_avatar', 'not_captain', 'odyssey_not_ready',
    // client
    'network', 'unknown',
  ];
  for (const code of codes) assert.ok(app.errors[code], `missing copy for ${code}`);
  // create_demo_odyssey can also raise these; they fall back to "unknown" copy, which is acceptable only because the UI never sends bad values.
  for (const code of ['invalid_visibility_mode', 'invalid_points_mode']) assert.equal(app.errors[code], undefined);
});

test('D7: toApiError classification', () => {
  assert.equal(api.toApiError(new Error('not_authenticated')).code, 'not_authenticated');
  assert.equal(api.toApiError(new TypeError('Network request failed')).code, 'network');
  assert.equal(api.toApiError(new Error('Failed to fetch')).code, 'network');
  assert.equal(api.toApiError('weird').code, 'unknown');
  const e = new api.ApiError('llm_failed');
  assert.equal(api.toApiError(e), e);
});
