-- Phase 5: create_demo_odyssey.
begin;
select plan(8);

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a"}';

select matches(
  public.create_demo_odyssey('fog') ->> 'join_code', '^[A-Z2-9]{6}$',
  'returns a join code'
);
select throws_ok(
  $$ select public.create_demo_odyssey('invisible') $$,
  'P0001', 'invalid_visibility_mode', 'rejects an unknown visibility mode'
);
select is(
  (select status || '/' || visibility_mode from public.odysseys), 'lobby/fog',
  'caller is the captain of a fog odyssey waiting in the lobby'
);
select is(
  jsonb_array_length(public.get_visible_stages((select id from public.odysseys)) -> 'stages'), 1,
  'the demo route obeys fog rules like any other'
);

reset role;

-- Other rows may exist in the database; look only at this captain's route.
create temp view demo_stages as
  select s.* from public.stages s
  join public.odysseys o on o.id = s.odyssey_id
  where o.captain_id = '00000000-0000-0000-0000-00000000000a';

select is((select count(*) from demo_stages), 7::bigint, 'seven stages');
select is(
  (select array_agg("order" order by "order") from demo_stages), array[1, 2, 3, 4, 5, 6, 7],
  'orders are contiguous from 1'
);
select is(
  (select name || ' / ' || points from demo_stages order by "order" desc limit 1),
  'Big Bend National Park, TX / 250',
  'the last stage is Ithaca and pays 250'
);
-- The same sanity check the Oracle applies: no stage backtracks.
select is(
  (select bool_and(to_ithaca < prev) from (
     select d.to_ithaca, lag(d.to_ithaca) over (order by d."order") as prev
     from (
       select s."order", public.haversine_m(s.lat, s.lng, i.lat, i.lng) as to_ithaca
       from demo_stages s, (select lat, lng from demo_stages where "order" = 7) i
     ) d
   ) x where prev is not null),
  true,
  'every stage is closer to Ithaca than the one before'
);

select * from finish();
rollback;
