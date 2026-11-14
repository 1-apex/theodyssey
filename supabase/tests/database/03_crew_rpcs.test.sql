-- Phase 3: join_odyssey, set_sail, Realtime publication.
begin;
select plan(19);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');
insert into public.odysseys (id, join_code, captain_id, title, start_name, destination_name, status) values
  ('10000000-0000-0000-0000-000000000001', 'LOBBY2', '00000000-0000-0000-0000-00000000000a', 'Lobby', 'S', 'D', 'lobby'),
  ('10000000-0000-0000-0000-000000000002', 'FORGE2', '00000000-0000-0000-0000-00000000000a', 'Forging', 'S', 'D', 'forging'),
  ('10000000-0000-0000-0000-000000000003', 'DONE22', '00000000-0000-0000-0000-00000000000a', 'Done', 'S', 'D', 'complete');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b"}';

-- join_odyssey -------------------------------------------------------------
select is(
  public.join_odyssey(' lobby2 ', '  Bee  ', 'avatar_01') ->> 'odyssey_id',
  '10000000-0000-0000-0000-000000000001',
  'join by code, ignoring case and surrounding spaces'
);
select is(
  (select nickname from public.members where user_id = '00000000-0000-0000-0000-00000000000b'), 'Bee',
  'nickname is trimmed'
);
select lives_ok(
  $$ select public.join_odyssey('LOBBY2', 'Bee the Bold', 'avatar_02') $$,
  'joining again does not fail'
);
select is(
  (select count(*) || ' ' || min(nickname) || ' ' || min(avatar_id) from public.members), '1 Bee the Bold avatar_02',
  'joining again updates the same member instead of adding one'
);
select throws_ok($$ select public.join_odyssey('NOPE22', 'Bee', 'a1') $$, 'P0001', 'invalid_join_code', 'wrong code');
select throws_ok($$ select public.join_odyssey(null, 'Bee', 'a1') $$, 'P0001', 'invalid_join_code', 'missing code');
select throws_ok($$ select public.join_odyssey('LOBBY2', '   ', 'a1') $$, 'P0001', 'invalid_nickname', 'blank nickname');
select throws_ok($$ select public.join_odyssey('LOBBY2', repeat('x', 25), 'a1') $$, 'P0001', 'invalid_nickname', 'nickname over 24 characters');
select throws_ok($$ select public.join_odyssey('LOBBY2', 'Bee', '') $$, 'P0001', 'invalid_avatar', 'missing avatar');
select throws_ok($$ select public.join_odyssey('FORGE2', 'Bee', 'a1') $$, 'P0001', 'odyssey_not_joinable', 'cannot join while forging');
select throws_ok($$ select public.join_odyssey('DONE22', 'Bee', 'a1') $$, 'P0001', 'odyssey_not_joinable', 'cannot join a completed odyssey');

-- set_sail -----------------------------------------------------------------
select throws_ok(
  $$ select public.set_sail('10000000-0000-0000-0000-000000000001') $$,
  'P0001', 'not_captain', 'crew cannot set sail'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select is(
  public.set_sail('10000000-0000-0000-0000-000000000001') ->> 'status', 'voyage',
  'captain sets sail: lobby becomes voyage'
);
select is(
  public.set_sail('10000000-0000-0000-0000-000000000001') ->> 'status', 'voyage',
  'setting sail twice is a no-op'
);
select throws_ok(
  $$ select public.set_sail('10000000-0000-0000-0000-000000000002') $$,
  'P0001', 'odyssey_not_ready', 'cannot set sail while the route is still forging'
);
select is(
  public.set_sail('10000000-0000-0000-0000-000000000003') ->> 'status', 'complete',
  'set_sail never moves a completed odyssey backwards'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000c"}';
select lives_ok(
  $$ select public.join_odyssey('LOBBY2', 'Late Cee', 'avatar_03') $$,
  'latecomers can still join during the voyage'
);

reset role;

-- Realtime -----------------------------------------------------------------
select is(
  (select array_agg(tablename::text order by tablename) from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'),
  array['members', 'odysseys', 'points_ledger'],
  'Realtime publishes odysseys, members and points_ledger, and not stages'
);
select is(
  (select count(*) from public.members where odyssey_id = '10000000-0000-0000-0000-000000000001'), 2::bigint,
  'two members in total'
);

select * from finish();
rollback;
