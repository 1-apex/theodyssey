-- points_mode: crew (default) pays everyone, arriver pays only the member who cleared.
begin;
select plan(11);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

insert into public.odysseys (id, captain_id, title, start_name, destination_name, status, points_mode)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Arriver', 'S', 'D', 'voyage', 'arriver');
insert into public.members (id, odyssey_id, user_id, nickname, avatar_id) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Ay', 'a1'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Bee', 'a2');
insert into public.stages (id, odyssey_id, "order", name, title, lat, lng, points) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'One', 'One', 30, -97, 100),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 2, 'Two', 'Ithaca', 31, -97, 250);

select is(
  (select points_mode from public.odysseys where id = '10000000-0000-0000-0000-000000000001'), 'arriver',
  'points_mode is stored'
);
select throws_ok(
  $$ update public.odysseys set points_mode = 'everyone' where id = '10000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'points_mode only accepts crew or arriver'
);

set local role authenticated;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000001', 30, -97) ->> 'points_awarded', '100',
  'arriver mode: Bee clears stage 1'
);
select is(
  (select array_agg(nickname || ':' || total_points order by nickname)
   from public.get_points_summary('10000000-0000-0000-0000-000000000001')),
  array['Ay:0', 'Bee:100'],
  'arriver mode: only the member who arrived is paid'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000001', 30, -97) ->> 'result', 'already_cleared',
  'arriver mode: a second arrival at the same stage is a no-op'
);
select is(
  public.clear_stage('30000000-0000-0000-0000-000000000002', p_manual => true) ->> 'odyssey_status', 'complete',
  'arriver mode: Ay clears Ithaca'
);
select is(
  (select array_agg(nickname || ':' || total_points order by nickname)
   from public.get_points_summary('10000000-0000-0000-0000-000000000001')),
  array['Ay:250', 'Bee:100'],
  'arriver mode: each member keeps only what they cleared'
);

-- Demo odyssey accepts the setting; the default is still crew.
select throws_ok(
  $$ select public.create_demo_odyssey('fog', 'nobody') $$,
  'P0001', 'invalid_points_mode', 'demo odyssey rejects an unknown points mode'
);
select lives_ok($$ select public.create_demo_odyssey('open', 'arriver') $$, 'demo odyssey accepts a points mode');
select lives_ok($$ select public.create_demo_odyssey('open') $$, 'demo odyssey still works with one argument');
-- RLS limits this to odysseys the caller captains.
select is(
  (select array_agg(points_mode order by points_mode) from public.odysseys
   where title = 'The Voyage to the Western Wilds'),
  array['arriver', 'crew'],
  'demo odyssey stores the chosen points mode and defaults to crew'
);

reset role;
select * from finish();
rollback;
