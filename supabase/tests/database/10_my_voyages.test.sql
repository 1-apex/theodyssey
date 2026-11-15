-- get_my_voyages: the caller's own Odysseys, points and counts.
-- Run with: npx supabase test db
begin;
select plan(14);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),  -- me
  ('00000000-0000-0000-0000-0000000000c2'),  -- friend
  ('00000000-0000-0000-0000-0000000000c3');  -- stranger

-- A: open, voyage, captained by friend, I joined. Oldest.
-- B: fog, voyage, captained by me.
-- C: fog, complete, captained by friend, I joined.
-- D: forging, I am a member. E: friend and stranger only.
insert into public.odysseys (id, captain_id, title, start_name, destination_name, visibility_mode, status, created_at) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2', 'A', 'SA', 'DA', 'open', 'voyage', now() - interval '3 days'),
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'B', 'SB', 'DB', 'fog', 'voyage', now() - interval '1 day'),
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 'C', 'SC', 'DC', 'fog', 'complete', now() - interval '2 days'),
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'D', 'SD', 'DD', 'open', 'forging', now()),
  ('10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2', 'E', 'SE', 'DE', 'open', 'voyage', now());

insert into public.members (id, odyssey_id, user_id, nickname, avatar_id) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Me', 'a1'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2', 'Fr', 'a2'),
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'Me', 'a1'),
  ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 'Me', 'a1'),
  ('20000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 'Fr', 'a2'),
  ('20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'Me', 'a1'),
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2', 'Fr', 'a2'),
  ('20000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c3', 'St', 'a3');

insert into public.stages (id, odyssey_id, "order", name, title, lat, lng, cleared_at) values
  ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 1, 'A1', 'A1', 30, -97, now()),
  ('30000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a1', 2, 'A2', 'A2', 31, -97, now()),
  ('30000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-0000000000a1', 3, 'A3', 'A3', 32, -97, null),
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 1, 'B1', 'B1', 30, -97, null),
  ('30000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-0000000000b1', 2, 'B2', 'B2', 31, -97, null),
  ('30000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 1, 'C1', 'C1', 30, -97, '2026-01-01 10:00+00'),
  ('30000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', 2, 'C2', 'C2', 31, -97, '2026-01-02 10:00+00');

-- A: I earned 100 + 50, friend earned 100. C: I earned 250, friend 250.
insert into public.points_ledger (odyssey_id, member_id, stage_id, points, reason) values
  ('10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 100, 'stage_cleared'),
  ('10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a2', 50, 'stage_cleared'),
  ('10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a2', '30000000-0000-0000-0000-0000000000a1', 100, 'stage_cleared'),
  ('10000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000c2', 250, 'ithaca_reached'),
  ('10000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-0000000000c2', '30000000-0000-0000-0000-0000000000c2', 250, 'ithaca_reached');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1"}';

select is(jsonb_array_length(public.get_my_voyages()), 3, 'only my non-forging Odysseys are returned (not D, not E)');
select is(
  (select jsonb_agg(e ->> 'title') from jsonb_array_elements(public.get_my_voyages()) e),
  '["B", "C", "A"]'::jsonb, 'newest first'
);

create temp table v as select e from jsonb_array_elements(public.get_my_voyages()) e;
grant select on v to authenticated;

select is((select (e ->> 'my_points')::int from v where e ->> 'title' = 'A'), 150, 'points are my own sum, not the crew''s');
select is((select (e ->> 'my_points')::int from v where e ->> 'title' = 'B'), 0, 'no ledger rows means 0 points');
select is((select (e ->> 'my_points')::int from v where e ->> 'title' = 'C'), 250, 'complete voyage points');
select is(
  (select array[(e ->> 'stages_cleared')::int, (e ->> 'stages_total')::int] from v where e ->> 'title' = 'A'),
  array[2, 3], 'cleared and total stage counts'
);
select is((select (e ->> 'crew_size')::int from v where e ->> 'title' = 'A'), 2, 'crew size counts all members');
select is((select (e ->> 'is_captain')::boolean from v where e ->> 'title' = 'B'), true, 'is_captain is true where I created it');
select is((select (e ->> 'is_captain')::boolean from v where e ->> 'title' = 'A'), false, 'is_captain is false where someone else did');
select is((select e ->> 'destination_name' from v where e ->> 'title' = 'B'), null, 'fog hides the destination while at sea');
select is((select e ->> 'destination_name' from v where e ->> 'title' = 'A'), 'DA', 'open mode shows the destination');
select is((select e ->> 'destination_name' from v where e ->> 'title' = 'C'), 'DC', 'fog shows the destination once complete');
select is(
  (select (e ->> 'completed_at')::timestamptz from v where e ->> 'title' = 'C'),
  '2026-01-02 10:00+00'::timestamptz, 'completed_at is the latest clear; null while at sea'
);

reset role;
set local role anon;
select throws_ok($$ select public.get_my_voyages() $$, '42501', null, 'signed-out clients cannot call it');
reset role;

select * from finish();
