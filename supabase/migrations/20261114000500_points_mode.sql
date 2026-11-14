-- points_mode: the Captain chooses who earns a cleared stage's Drachma.
--   crew     every crew member (the default, and the behaviour until now)
--   arriver  only the member whose arrival cleared the stage
--
-- clear_stage and create_demo_odyssey are redefined in full; the only
-- changes are the points_mode handling.

alter table public.odysseys
  add column points_mode text not null default 'crew'
    check (points_mode in ('crew', 'arriver'));

-- In the result, points_awarded is what each paid member received: the whole
-- crew in `crew` mode, only the caller in `arriver` mode.
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
    'distance_m', v_distance,
    'points_awarded', v_awarded,
    'odyssey_status', v_odyssey.status,
    'current_stage_order', v_odyssey.current_stage_order
  );
end;
$$;

-- The signature changes, so the old one-argument version has to go first.
drop function public.create_demo_odyssey(text);

create or replace function public.create_demo_odyssey(
  p_visibility_mode text default 'fog',
  p_points_mode text default 'crew'
)
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
  if p_visibility_mode not in ('open', 'fog') then
    raise exception 'invalid_visibility_mode';
  end if;
  if p_points_mode not in ('crew', 'arriver') then
    raise exception 'invalid_points_mode';
  end if;

  insert into public.odysseys
    (captain_id, title, start_name, destination_name, visibility_mode, points_mode, status)
  values
    (v_uid, 'The Voyage to the Western Wilds', 'Arlington, TX',
     'Big Bend National Park, TX', p_visibility_mode, p_points_mode, 'lobby')
  returning * into v_odyssey;

  insert into public.stages (odyssey_id, "order", name, title, lore, lat, lng, points)
  values
    (v_odyssey.id, 1, 'Dr Pepper Museum, Waco, TX', 'Spring of the Twenty-Three Nectars',
     'Here the old alchemists first bottled a draught of twenty-three flavors. Drink, and the road ahead grows shorter.',
     31.5546, -97.1292, 100),
    (v_odyssey.id, 2, 'Texas State Capitol, Austin, TX', 'The Rose Granite Acropolis',
     'A dome taller than the one in the capital of the empire, raised by a people who do nothing small.',
     30.2747, -97.7404, 100),
    (v_odyssey.id, 3, 'Enchanted Rock State Natural Area, Fredericksburg, TX', 'The Singing Stone of the Titans',
     'A great pink dome that groans at night as it cools. Climb it, and the gods can hear you.',
     30.5066, -98.8190, 100),
    (v_odyssey.id, 4, 'Caverns of Sonora, Sonora, TX', 'The Gates of the Underworld',
     'Descend where crystal wings grow from the walls. Take nothing, for Hades counts every stone.',
     30.5550, -100.8120, 100),
    (v_odyssey.id, 5, 'Paisano Pete, Fort Stockton, TX', 'The Colossus of the Swift Bird',
     'A giant roadrunner guards the crossroads of the desert. Travelers who greet him are granted speed.',
     30.8853, -102.8791, 100),
    (v_odyssey.id, 6, 'Gage Hotel, Marathon, TX', 'The Last Hearth Before the Wilds',
     'The final inn at the edge of the known world. Beyond it there is only sky.',
     30.2066, -103.2443, 100),
    (v_odyssey.id, 7, 'Big Bend National Park, TX', 'Ithaca of the Western Wilds',
     'Where the great river bends and the mountains stand alone. The voyage ends, and the stars come home.',
     29.3280, -103.2060, 250);

  return jsonb_build_object('odyssey_id', v_odyssey.id, 'join_code', v_odyssey.join_code);
end;
$$;

revoke all on function public.create_demo_odyssey(text, text) from public, anon;
grant execute on function public.create_demo_odyssey(text, text) to authenticated;
