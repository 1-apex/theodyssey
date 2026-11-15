-- A player's chosen avatar lives on their profile, so it follows them into
-- every crew (join_odyssey still takes an avatar per crew; the app starts it
-- from this one). Clients still cannot write profiles directly: they call
-- set_my_avatar, which only ever touches the caller's own row.
--
-- Errors: not_authenticated, invalid_avatar, profile_not_found.

alter table public.profiles
  add column avatar_id text not null default 'avatar_0'
  check (avatar_id ~ '^avatar_[0-4]$');

create or replace function public.set_my_avatar(p_avatar_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_avatar text := btrim(coalesce(p_avatar_id, ''));
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_avatar !~ '^avatar_[0-4]$' then
    raise exception 'invalid_avatar';
  end if;

  update public.profiles set avatar_id = v_avatar where id = v_uid
  returning * into v_profile;
  -- Anonymous users have no profile.
  if not found then
    raise exception 'profile_not_found';
  end if;

  return jsonb_build_object('id', v_profile.id, 'username', v_profile.username, 'avatar_id', v_profile.avatar_id);
end;
$$;

revoke all on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;
