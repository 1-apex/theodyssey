-- Phase 2: get_visible_stages and clear_stage.
begin;
select plan(30);

-- A = captain and member, B = member, C = outsider.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');

-- Fog odyssey, already sailing, three stages one degree of latitude apart.
insert into public.odysseys (id, captain_id, title, start_name, destination_name, visibility_mode, status)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Fog', 'S', 'D', 'fog', 'voyage');
insert into public.members (id, odyssey_id, user_id, nickname, avatar_id) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Ay', 'a1'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Bee', 'a2');
insert into public.stages (id, odyssey_id, "order", name, title, lat, lng, points) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'One', 'Isle One', 30, -97, 100),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 2, 'Two', 'Isle Two', 31, -97, 100),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 3, 'Three', 'Ithaca', 32, -97, 250);

-- Open odyssey still in the lobby.
insert into public.odysseys (id, captain_id, title, start_name, destination_name, visibility_mode, status)
values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Open', 'S', 'D', 'open', 'lobby');
insert into public.members (odyssey_id, user_id, nickname, avatar_id)
values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'Bee', 'a2');
insert into public.stages (id, odyssey_id, "order", name, title, lat, lng) values
  ('30000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000002', 1, 'One', 'Isle One', 30, -97),
  ('30000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000002', 2, 'Two', 'Ithaca', 31, -97);

select is(round(public.haversine_m(0, 0, 0, 1)), 111195::double precision, 'haversine: one degree of longitude at the equator');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b"}';

-- Fog visibility ---------------------------------------------------------
select is(
  public.get_visible_stages('10000000-0000-0000-0000-000000000001') -> 'total_stages', '3'::jsonb,
  'fog: total_stages is the real count'
);
select is(
  jsonb_array_length(public.get_visible_stages('10000000-0000-0000-0000-000000000001') -> 'stages'), 1,
  'fog: only the current target is visible at the start'
);
select is(
  public.get_visible_stages('10000000-0000-0000-0000-000000000001') #>> '{stages,0,title}', 'Isle One',
  'fog: the visible stage is stage 1, with its full row'
);

-- Refusals ---------------------------------------------------------------
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000002', 31, -97) ->> 'result', 'not_current',
  'cannot skip ahead to a later stage'
);
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000001', 30.01, -97) ->> 'result', 'too_far',
  'about 1.1 km away is too far'
);
select is(
  (public.clear_stage('30000000-0000-0000-0000-000000000001', 30.01, -97) ->> 'distance_m')::int, 1112,
  'too_far reports the distance in metres'
);
select throws_ok(
  $$ select public.clear_stage('30000000-0000-0000-0000-000000000001') $$,
  'P0001', 'position_required', 'a position is required unless manual'
);
select throws_ok(
  $$ select public.clear_stage('39999999-0000-0000-0000-000000000000', 30, -97) $$,
  'P0001', 'stage_not_found', 'unknown stage id'
);
select is(
  (select count(*) from public.points_ledger), 0::bigint,
  'refused clears pay nothing'
);

-- A real clear -----------------------------------------------------------
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000001', 30.001, -97) - 'distance_m',
  '{"result":"cleared","stage_id":"30000000-0000-0000-0000-000000000001","points_awarded":100,"odyssey_status":"voyage","current_stage_order":2}'::jsonb,
  'inside the radius: cleared, 100 points, odyssey advances to stage 2'
);
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000001', 30.001, -97) - 'distance_m',
  '{"result":"already_cleared","stage_id":"30000000-0000-0000-0000-000000000001","points_awarded":0,"odyssey_status":"voyage","current_stage_order":2}'::jsonb,
  'clearing again is a no-op (idempotent)'
);
select is(
  (select count(*) from public.points_ledger where stage_id = '30000000-0000-0000-0000-000000000001'), 2::bigint,
  'every crew member is paid once, not just the one who arrived'
);
select is(
  jsonb_array_length(public.get_visible_stages('10000000-0000-0000-0000-000000000001') -> 'stages'), 2,
  'fog: cleared stage plus the new target are visible'
);
select is(
  public.get_visible_stages('10000000-0000-0000-0000-000000000001') #>> '{stages,0,cleared_by}',
  '20000000-0000-0000-0000-00000000000b',
  'cleared_by is the member who triggered the clear'
);

-- Outsider ---------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000c"}';
select throws_ok(
  $$ select public.get_visible_stages('10000000-0000-0000-0000-000000000001') $$,
  'P0001', 'not_crew', 'outsider cannot read stages'
);
select throws_ok(
  $$ select public.get_visible_stages('19999999-0000-0000-0000-000000000000') $$,
  'P0001', 'not_crew', 'unknown odyssey looks the same as someone else''s'
);
select throws_ok(
  $$ select public.clear_stage('30000000-0000-0000-0000-000000000002', 31, -97) $$,
  'P0001', 'not_crew', 'outsider cannot clear stages'
);

-- Manual arrival, then Ithaca ----------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000002', p_manual => true) ->> 'result', 'cleared',
  'manual arrival skips the distance check'
);
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000003', 0, 0, true) ->> 'odyssey_status', 'complete',
  'clearing Ithaca completes the odyssey'
);
select is(
  jsonb_array_length(public.get_visible_stages('10000000-0000-0000-0000-000000000001') -> 'stages'), 3,
  'fog: the full route is revealed once complete'
);
select is(
  (select array_agg(distinct reason order by reason) from public.points_ledger),
  array['ithaca_reached', 'stage_cleared'],
  'ledger records Ithaca separately from ordinary stages'
);
select is(
  (select sum(points) from public.points_ledger where member_id = '20000000-0000-0000-0000-00000000000b'), 450::bigint,
  'each member earned 100 + 100 + 250'
);
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000003', 0, 0, true) ->> 'result', 'already_cleared',
  'clearing Ithaca again is a no-op'
);
select is((select count(*) from public.points_ledger), 6::bigint, 'ledger has exactly members x stages rows');

-- Open mode, and the lobby -------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select is(
  jsonb_array_length(public.get_visible_stages('10000000-0000-0000-0000-000000000002') -> 'stages'), 2,
  'open: every stage is visible from the start'
);
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000011', 30, -97) ->> 'result', 'not_sailing',
  'stages cannot be cleared before the captain sets sail'
);
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select is(
  jsonb_array_length(public.get_visible_stages('10000000-0000-0000-0000-000000000002') -> 'stages'), 2,
  'captain can read stages before joining the crew'
);
select throws_ok(
  $$ select public.clear_stage('30000000-0000-0000-0000-000000000011', 30, -97) $$,
  'P0001', 'not_crew', 'captain must join the crew before clearing stages'
);

reset role;
set local role anon;
select throws_ok(
  $$ select public.get_visible_stages('10000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'signed-out clients cannot call the RPCs'
);
reset role;

select * from finish();
rollback;
