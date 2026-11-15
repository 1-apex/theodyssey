-- Usernames: profile rows, uniqueness and access.
-- Run with: npx supabase test db
begin;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'penelope@players.test', '{"username":"penelope"}');
-- An anonymous user: no email, no username.
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000a2', true);

select is(
  (select username from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'penelope', 'signing up with a username creates its profile'
);
select is(
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'),
  0::bigint, 'an anonymous user gets no profile'
);
select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values ('00000000-0000-0000-0000-0000000000a3', 'penelope@elsewhere.test', '{"username":"penelope"}') $$,
  '23505', null, 'a username can only be taken once'
);
select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values ('00000000-0000-0000-0000-0000000000a4', 'Bad Name@players.test', '{"username":"Bad Name"}') $$,
  '23514', null, 'a badly formed username is rejected'
);
select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values ('00000000-0000-0000-0000-0000000000a5', 'ab@players.test', '{"username":"ab"}') $$,
  '23514', null, 'a username shorter than 3 characters is rejected'
);
select throws_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values ('00000000-0000-0000-0000-0000000000a6', 'someone@players.test', '{"username":"telemachus"}') $$,
  'P0001', 'username_mismatch', 'the username must match the login it was created with'
);
select is(
  (select count(*) from auth.users where id in (
    '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4',
    '00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a6')),
  0::bigint, 'a rejected username leaves no user behind'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a2"}';
select is((select count(*) from public.profiles where username = 'penelope'), 1::bigint, 'signed-in players can look up usernames');
select throws_ok(
  $$ update public.profiles set username = 'odysseus' $$,
  '42501', null, 'players cannot change usernames directly'
);

reset role;
set local role anon;
select throws_ok('select count(*) from public.profiles', '42501', null, 'signed-out clients cannot read profiles');
reset role;

select * from finish();
rollback;
