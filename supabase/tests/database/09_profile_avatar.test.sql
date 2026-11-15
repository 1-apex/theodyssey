-- Profile avatar: default, set_my_avatar, and access.
-- Run with: npx supabase test db
begin;
select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'circe@players.test', '{"username":"circe"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'calypso@players.test', '{"username":"calypso"}');
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000b3', true);

select is(
  (select avatar_id from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  'avatar_0', 'a new profile starts on avatar_0'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1"}';

select is(
  public.set_my_avatar('avatar_3') ->> 'avatar_id', 'avatar_3', 'a valid avatar is saved and returned'
);
select is(
  (select avatar_id from public.profiles where username = 'circe'), 'avatar_3', 'the profile row holds the new avatar'
);
select is(
  public.set_my_avatar('  avatar_4 ') ->> 'username', 'circe', 'the result carries the username and ignores spaces'
);
select throws_ok($$ select public.set_my_avatar('avatar_5') $$, 'P0001', 'invalid_avatar', 'an unknown avatar is rejected');
select throws_ok($$ select public.set_my_avatar(null) $$, 'P0001', 'invalid_avatar', 'a missing avatar is rejected');
select is(
  (select avatar_id from public.profiles where username = 'calypso'), 'avatar_0', 'another player''s avatar is untouched'
);
select throws_ok(
  $$ update public.profiles set avatar_id = 'avatar_1' $$, '42501', null, 'players cannot update profiles directly'
);

-- An anonymous user has no profile.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b3"}';
select throws_ok($$ select public.set_my_avatar('avatar_1') $$, 'P0001', 'profile_not_found', 'a user without a profile cannot set an avatar');

reset role;
set local role anon;
select throws_ok($$ select public.set_my_avatar('avatar_1') $$, '42501', null, 'signed-out clients cannot call it');
reset role;

select is(
  (select avatar_id from public.profiles where username = 'circe'), 'avatar_4', 'only the caller''s own row changed'
);

select * from finish();
rollback;
