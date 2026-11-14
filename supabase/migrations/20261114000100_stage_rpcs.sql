-- Phase 2: the only read and write paths for stages.
--
-- RPC errors are raised with a stable snake_case message the app can switch
-- on: not_authenticated, not_crew, stage_not_found, position_required.

-- Great-circle distance in metres.
create or replace function public.haversine_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ---------------------------------------------------------------------------
-- get_visible_stages: what the caller is allowed to see.
--   open                 -> every stage
--   fog                  -> cleared stages plus the current target
--   fog, status complete -> every stage (full reveal at Ithaca)
-- total_stages is always the real count, so fog mode can draw the right
-- number of hidden islands.
-- ---------------------------------------------------------------------------
create or replace function public.get_visible_stages(p_odyssey_id uuid)
returns jsonb
language plpgsql
stable
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

  select * into v_odyssey from public.odysseys where id = p_odyssey_id;
  -- Same error for "no such odyssey" and "not yours", so ids cannot be probed.
  if not found or not (v_odyssey.captain_id = v_uid or public.is_crew(p_odyssey_id)) then
    raise exception 'not_crew';
  end if;

  return jsonb_build_object(
    'total_stages',
    (select count(*) from public.stages s where s.odyssey_id = p_odyssey_id),
    'stages',
    coalesce((
      select jsonb_agg(to_jsonb(s) order by s."order")
      from public.stages s
      where s.odyssey_id = p_odyssey_id
        and (
          v_odyssey.visibility_mode = 'open'
          or v_odyssey.status = 'complete'
          or s.cleared_at is not null
          or s."order" = v_odyssey.current_stage_order
        )
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- clear_stage: the only way a stage is cleared and Drachma are paid.
--
-- Returns { result, stage_id, distance_m, points_awarded, odyssey_status,
-- current_stage_order } where result is one of:
--   cleared          the stage was cleared by this call
--   already_cleared  someone got there first; nothing changed (idempotent)
--   not_sailing      the odyssey is not in status `voyage`
--   not_current      the stage is not the crew's current target
--   too_far          the position is outside the stage radius
--
-- p_manual = true is the "We have arrived" fallback and skips the distance
-- check. Everything else is identical.
-- ---------------------------------------------------------------------------
create or replace function public.clear_stage(
  p_stage_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_manual boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_odyssey_id uuid;
  v_odyssey public.odysseys%rowtype;
  v_stage public.stages%rowtype;
  v_member_id uuid;
  v_distance double precision;
  v_result text;
  v_awarded int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select odyssey_id into v_odyssey_id from public.stages where id = p_stage_id;
  if not found then
    raise exception 'stage_not_found';
  end if;

  select id into v_member_id
  from public.members
  where odyssey_id = v_odyssey_id and user_id = v_uid;
  if not found then
    raise exception 'not_crew';
  end if;

  -- Serialize clears per odyssey. Two phones arriving at once queue up here,
  -- and the second one sees cleared_at already set.
  select * into v_odyssey from public.odysseys where id = v_odyssey_id for update;
  select * into v_stage from public.stages where id = p_stage_id;

  if not p_manual and p_lat is not null and p_lng is not null then
    v_distance := round(public.haversine_m(p_lat, p_lng, v_stage.lat, v_stage.lng));
  end if;

  if v_stage.cleared_at is not null then
    v_result := 'already_cleared';
  elsif v_odyssey.status <> 'voyage' then
    v_result := 'not_sailing';
  elsif v_stage."order" <> v_odyssey.current_stage_order then
    v_result := 'not_current';
  elsif not p_manual and v_distance is null then
    raise exception 'position_required';
  elsif not p_manual and v_distance > v_stage.radius_m then
    v_result := 'too_far';
  else
    v_result := 'cleared';
    v_awarded := v_stage.points;

    update public.stages
    set cleared_at = now(), cleared_by = v_member_id
    where id = p_stage_id;

    -- Every crew member is paid, not just whoever triggered the clear.
    insert into public.points_ledger (odyssey_id, member_id, stage_id, points, reason)
    select v_odyssey_id, m.id, p_stage_id, v_stage.points,
           case when v_stage."order" = (
             select max(s."order") from public.stages s where s.odyssey_id = v_odyssey_id
           ) then 'ithaca_reached' else 'stage_cleared' end
    from public.members m
    where m.odyssey_id = v_odyssey_id
    on conflict (member_id, stage_id) do nothing;

    -- Advance, or finish if that was Ithaca.
    if exists (
      select 1 from public.stages s
      where s.odyssey_id = v_odyssey_id and s."order" > v_stage."order"
    ) then
      update public.odysseys
      set current_stage_order = v_stage."order" + 1
      where id = v_odyssey_id
      returning * into v_odyssey;
    else
      update public.odysseys
      set status = 'complete'
      where id = v_odyssey_id
      returning * into v_odyssey;
    end if;
  end if;

  return jsonb_build_object(
    'result', v_result,
    'stage_id', p_stage_id,
    'distance_m', v_distance,
    'points_awarded', v_awarded,
    'odyssey_status', v_odyssey.status,
    'current_stage_order', v_odyssey.current_stage_order
  );
end;
$$;

revoke all on function public.haversine_m(double precision, double precision, double precision, double precision) from public, anon;
revoke all on function public.get_visible_stages(uuid) from public, anon;
revoke all on function public.clear_stage(uuid, double precision, double precision, boolean) from public, anon;
grant execute on function public.haversine_m(double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.get_visible_stages(uuid) to authenticated;
grant execute on function public.clear_stage(uuid, double precision, double precision, boolean) to authenticated;
