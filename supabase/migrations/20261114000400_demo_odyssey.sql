-- Phase 5: a pre-seeded Odyssey for the demo and for testing.
--
-- create_demo_odyssey gives the caller a ready-made route (Arlington to Big
-- Bend) with themselves as Captain, without touching the LLM or the geocoder.
-- Use it as the fallback if the Oracle fails on stage, and as a way for Dev A
-- and Dev C to get real data before the Oracle is deployed.
--
-- Coordinates were entered by hand and are approximate. That is fine for
-- simulate mode; do not rely on them for a real GPS check-in.

create or replace function public.create_demo_odyssey(p_visibility_mode text default 'fog')
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

  insert into public.odysseys
    (captain_id, title, start_name, destination_name, visibility_mode, status)
  values
    (v_uid, 'The Voyage to the Western Wilds', 'Arlington, TX',
     'Big Bend National Park, TX', p_visibility_mode, 'lobby')
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

revoke all on function public.create_demo_odyssey(text) from public, anon;
grant execute on function public.create_demo_odyssey(text) to authenticated;
