-- Usernames: one unique name per signed-in player, linked to auth.users by id.
--
-- The app signs players up with Supabase password auth. Supabase needs an
-- email, so the app derives one from the username (<username>@<project host>);
-- no email is ever sent. The password is stored and checked by Supabase Auth.
--
-- A profile row is created by a trigger when the auth user is created, so a
-- username cannot exist without its user, and the client never writes here.
-- Anonymous users (still used by the test scripts) get no profile.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  -- Lowercase letters, digits and underscore, 3 to 20 characters.
  username    text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- Usernames are not secret: any signed-in player can look them up.
create policy "signed-in players can read profiles"
  on public.profiles for select to authenticated
  using (true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := new.raw_user_meta_data ->> 'username';
begin
  -- Anonymous sign-ins carry no username and get no profile.
  if v_username is null then
    return new;
  end if;

  -- The login email is derived from the username, so the two must agree.
  -- Otherwise someone could hold a name that its login can never reach.
  if new.email is null or split_part(new.email, '@', 1) <> v_username then
    raise exception 'username_mismatch';
  end if;

  -- The check constraint rejects a badly formed name and the unique
  -- constraint a taken one; either aborts the sign-up.
  insert into public.profiles (id, username) values (new.id, v_username);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
