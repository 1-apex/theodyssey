-- Phase 4: get_points_summary.
begin;
select plan(5);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');
insert into public.odysseys (id, captain_id, title, start_name, destination_name, status)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'T', 'S', 'D', 'voyage');
insert into public.members (id, odyssey_id, user_id, nickname, avatar_id, joined_at) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Ay', 'a1', now() - interval '2 hours'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Bee', 'a2', now() - interval '1 hour');
insert into public.stages (id, odyssey_id, "order", name, title, lat, lng) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'One', 'One', 30, -97),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 2, 'Two', 'Two', 31, -97);
-- Ay was there for both stages; Bee joined after stage 1.
insert into public.points_ledger (odyssey_id, member_id, stage_id, points, reason) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 100, 'stage_cleared'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000002', 250, 'ithaca_reached');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b"}';

select results_eq(
  $$ select nickname, avatar_id, total_points, stages_cleared
     from public.get_points_summary('10000000-0000-0000-0000-000000000001') $$,
  $$ values ('Ay', 'a1', 350, 2), ('Bee', 'a2', 0, 0) $$,
  'totals are summed from the ledger, highest first, and include members with nothing yet'
);
select is(
  (select member_id from public.get_points_summary('10000000-0000-0000-0000-000000000001') limit 1),
  '20000000-0000-0000-0000-00000000000a'::uuid,
  'rows carry the member id'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000c"}';
select is_empty(
  $$ select * from public.get_points_summary('10000000-0000-0000-0000-000000000001') $$,
  'outsider gets no rows'
);
select is_empty(
  $$ select * from public.get_points_summary('19999999-0000-0000-0000-000000000000') $$,
  'unknown odyssey gets no rows'
);

reset role;
set local role anon;
select throws_ok(
  $$ select * from public.get_points_summary('10000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'signed-out clients cannot call it'
);
reset role;

select * from finish();
rollback;
