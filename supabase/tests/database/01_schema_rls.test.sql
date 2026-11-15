-- Phase 0: schema constraints and baseline RLS.
-- Run with: npx supabase test db
begin;
select plan(13);

-- A = captain (not a member), B = crew member, C = outsider.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');
insert into public.odysseys (id, captain_id, title, start_name, destination_name, visibility_mode)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'T', 'S', 'D', 'fog');
insert into public.members (id, odyssey_id, user_id, nickname, avatar_id)
values ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Bee', 'a1');
insert into public.stages (id, odyssey_id, "order", name, title, lat, lng)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'Place', 'Isle', 31, -97);
insert into public.points_ledger (odyssey_id, member_id, stage_id, points, reason)
values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 100, 'stage_cleared');

select matches(
  (select join_code from public.odysseys where id = '10000000-0000-0000-0000-000000000001'),
  '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$',
  'join code is 6 unambiguous uppercase characters'
);
select is(
  (select status || '/' || current_stage_order from public.odysseys where id = '10000000-0000-0000-0000-000000000001'),
  'forging/1',
  'a new odyssey starts as forging at stage 1'
);
select throws_ok(
  $$ insert into public.points_ledger (odyssey_id, member_id, stage_id, points, reason)
     values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 100, 'again') $$,
  '23505', null, 'a stage cannot pay the same member twice'
);
select throws_ok(
  $$ insert into public.stages (odyssey_id, "order", name, title, lat, lng)
     values ('10000000-0000-0000-0000-000000000001', 1, 'Dup', 'Dup', 0, 0) $$,
  '23505', null, 'stage order is unique within an odyssey'
);

set local role authenticated;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select is((select count(*) from public.odysseys), 1::bigint, 'captain can read their odyssey before joining the crew');
select is((select count(*) from public.members), 0::bigint, 'captain who has not joined cannot read the crew');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select is(
  (select count(*) from public.odysseys) + (select count(*) from public.members) + (select count(*) from public.points_ledger),
  3::bigint, 'crew member can read the odyssey, crew and ledger'
);
select throws_ok('select count(*) from public.stages', '42501', null, 'crew cannot select stages directly');
select throws_ok($$ update public.stages set cleared_at = now() $$, '42501', null, 'crew cannot write cleared_at');
select throws_ok($$ update public.odysseys set status = 'complete' $$, '42501', null, 'crew cannot write odysseys');
select throws_ok(
  $$ insert into public.points_ledger (odyssey_id, member_id, stage_id, points, reason)
     values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-000000000001', 999, 'cheat') $$,
  '42501', null, 'crew cannot write the ledger'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000c"}';
select is(
  (select count(*) from public.odysseys) + (select count(*) from public.members) + (select count(*) from public.points_ledger),
  0::bigint, 'outsider sees nothing'
);

reset role;
set local role anon;
select throws_ok('select count(*) from public.odysseys', '42501', null, 'signed-out clients have no access');
reset role;

select * from finish();
rollback;
