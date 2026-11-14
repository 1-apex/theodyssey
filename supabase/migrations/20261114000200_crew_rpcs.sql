-- Phase 3: joining a crew, setting sail, and Realtime.
--
-- Errors: not_authenticated, invalid_join_code, odyssey_not_joinable,
-- invalid_nickname, invalid_avatar, not_captain, odyssey_not_ready.

-- ---------------------------------------------------------------------------
-- join_odyssey: join by code. Calling it again updates nickname and avatar
-- instead of failing, so a retry or a rejoin is safe.
-- ---------------------------------------------------------------------------
create or replace function public.join_odyssey(
  p_join_code text,
  p_nickname text,
  p_avatar_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_avatar text := btrim(coalesce(p_avatar_id, ''));
  v_odyssey public.odysseys%rowtype;
  v_member_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(v_nickname) not between 1 and 24 then
    raise exception 'invalid_nickname';
  end if;
  if char_length(v_avatar) not between 1 and 40 then
    raise exception 'invalid_avatar';
  end if;

  select * into v_odyssey
  from public.odysseys
  where join_code = upper(btrim(coalesce(p_join_code, '')));
  if not found then
    raise exception 'invalid_join_code';
  end if;
  if v_odyssey.status not in ('lobby', 'voyage') then
    raise exception 'odyssey_not_joinable';
  end if;

  insert into public.members (odyssey_id, user_id, nickname, avatar_id)
  values (v_odyssey.id, v_uid, v_nickname, v_avatar)
  on conflict (odyssey_id, user_id)
    do update set nickname = excluded.nickname, avatar_id = excluded.avatar_id
  returning id into v_member_id;

  return jsonb_build_object('odyssey_id', v_odyssey.id, 'member_id', v_member_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- set_sail: Captain moves the odyssey from lobby to voyage. Safe to repeat.
-- ---------------------------------------------------------------------------
create or replace function public.set_sail(p_odyssey_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_odyssey public.odysseys%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_odyssey from public.odysseys where id = p_odyssey_id for update;
  if not found or v_odyssey.captain_id <> v_uid then
    raise exception 'not_captain';
  end if;
  if v_odyssey.status = 'forging' then
    raise exception 'odyssey_not_ready';
  end if;

  if v_odyssey.status = 'lobby' then
    update public.odysseys set status = 'voyage' where id = p_odyssey_id
    returning * into v_odyssey;
  end if;

  return jsonb_build_object('odyssey_id', v_odyssey.id, 'status', v_odyssey.status);
end;
$$;

revoke all on function public.join_odyssey(text, text, text) from public, anon;
revoke all on function public.set_sail(uuid) from public, anon;
grant execute on function public.join_odyssey(text, text, text) to authenticated;
grant execute on function public.set_sail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime. `stages` is deliberately left out: clients cannot select it, so
-- they would receive nothing. Every stage clear also updates the odyssey row
-- (current_stage_order or status), so subscribing to `odysseys` and calling
-- get_visible_stages on change is enough.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime
  add table public.odysseys, public.members, public.points_ledger;
