-- clear_stage must not reveal where a hidden stage is, and must reject impossible coordinates.
begin;
select plan(11);

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.odysseys (id, captain_id, title, start_name, destination_name, visibility_mode, status)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Fog', 'S', 'D', 'fog', 'lobby');
insert into public.members (id, odyssey_id, user_id, nickname, avatar_id)
values ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Ay', 'a1');
insert into public.stages (id, odyssey_id, "order", name, title, lat, lng) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'One', 'One', 30, -97),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 2, 'Two', 'Two', 31, -97),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 3, 'Hidden', 'Ithaca', 32, -97);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a"}';

-- Before sailing: no distance for any stage.
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000003', 32, -97),
  '{"result":"not_sailing","stage_id":"30000000-0000-0000-0000-000000000003","distance_m":null,"points_awarded":0,"odyssey_status":"lobby","current_stage_order":1}'::jsonb,
  'not_sailing: no distance, even standing on the hidden stage'
);

reset role;
update public.odysseys set status = 'voyage' where id = '10000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a"}';

-- The fogged stage: the response is the same wherever the caller stands.
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000003', 32, -97) -> 'distance_m', 'null'::jsonb,
  'not_current: no distance when standing exactly on a hidden stage'
);
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000003', 10, 10),
  public.clear_stage('30000000-0000-0000-0000-000000000003', 32, -97),
  'not_current: the whole response is identical from near and from far'
);

-- The current target still reports distance, which the app shows.
select is(
  (public.clear_stage('30000000-0000-0000-0000-000000000001', 30.01, -97) ->> 'distance_m')::int, 1112,
  'too_far on the current target still reports the distance'
);

-- Impossible coordinates.
select throws_ok(
  $$ select public.clear_stage('30000000-0000-0000-0000-000000000001', 390, -97) $$,
  'P0001', 'invalid_position', 'latitude 360 degrees off is rejected, not measured as 0 m'
);
select throws_ok(
  $$ select public.clear_stage('30000000-0000-0000-0000-000000000001', 30, 263) $$,
  'P0001', 'invalid_position', 'longitude 360 degrees off is rejected'
);
select throws_ok(
  $$ select public.clear_stage('30000000-0000-0000-0000-000000000001', 'NaN', -97) $$,
  'P0001', 'invalid_position', 'NaN is rejected'
);
select is(
  public.get_visible_stages('10000000-0000-0000-0000-000000000001') #>> '{stages,0,cleared_at}', null,
  'none of that cleared anything'
);

-- A real clear, then a repeat.
select is(
  (public.clear_stage('30000000-0000-0000-0000-000000000001', 30, -97) ->> 'distance_m')::int, 0,
  'cleared reports the distance'
);
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000001', 30.01, -97) -> 'distance_m', 'null'::jsonb,
  'already_cleared: no distance'
);
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000002', p_manual => true) -> 'distance_m', 'null'::jsonb,
  'manual arrival: no distance'
);

reset role;
select * from finish();
rollback;
