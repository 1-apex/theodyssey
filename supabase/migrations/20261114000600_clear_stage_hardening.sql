-- Two fixes to clear_stage found by review. The function is redefined in full;
-- only the marked lines changed.
--
-- 1. distance_m was returned for every outcome, including not_current and
--    not_sailing. With a hidden stage's id, a crew member could call it from a
--    few points and work out where a fogged stage is. It is now returned only
--    when the stage was the current target (cleared or too_far).
-- 2. Coordinates outside the valid range were accepted, and a latitude 360
--    degrees off measured as 0 m away. They are now rejected (invalid_position).

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
  -- Out-of-range values wrap around in the distance formula (lat + 360 measures as 0 m).
  if p_lat is not null and p_lng is not null
     and not (p_lat between -90 and 90 and p_lng between -180 and 180) then
    raise exception 'invalid_position';
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

    -- points_mode `crew`: every member is paid. `arriver`: only the member who
    -- triggered the clear.
    insert into public.points_ledger (odyssey_id, member_id, stage_id, points, reason)
    select v_odyssey_id, m.id, p_stage_id, v_stage.points,
           case when v_stage."order" = (
             select max(s."order") from public.stages s where s.odyssey_id = v_odyssey_id
           ) then 'ithaca_reached' else 'stage_cleared' end
    from public.members m
    where m.odyssey_id = v_odyssey_id
      and (v_odyssey.points_mode = 'crew' or m.id = v_member_id)
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
    -- Only for the stage the crew is allowed to know about. Returning it for any
    -- other stage would let a caller locate a stage hidden by fog.
    'distance_m', case when v_result in ('cleared', 'too_far') then v_distance end,
    'points_awarded', v_awarded,
    'odyssey_status', v_odyssey.status,
    'current_stage_order', v_odyssey.current_stage_order
  );
end;
$$;
