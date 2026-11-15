-- The caller's voyage history, for the profile screen: one entry per Odyssey
-- they are crew of (Captain or not), newest first, with their own Drachma.
--
-- SECURITY DEFINER because stages cannot be read by clients. Only two counts
-- (cleared, total) are derived from stages; no stage names, order or
-- coordinates leave this function. In fog mode the destination is the hidden
-- final stage, so destination_name is null until the Odyssey is complete.
-- Odysseys still being forged are skipped.
--
-- Returns a jsonb array (empty when there are none).
-- Errors: not_authenticated.

create or replace function public.get_my_voyages()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  return coalesce((
    select jsonb_agg(v.row order by v.created_at desc, v.odyssey_id)
    from (
      select
        o.id as odyssey_id,
        o.created_at,
        jsonb_build_object(
          'odyssey_id', o.id,
          'title', o.title,
          'start_name', o.start_name,
          'destination_name',
            case when o.visibility_mode = 'fog' and o.status <> 'complete' then null else o.destination_name end,
          'status', o.status,
          'visibility_mode', o.visibility_mode,
          'is_captain', o.captain_id = v_uid,
          'joined_at', m.joined_at,
          'my_points', coalesce((
            select sum(l.points) from public.points_ledger l where l.member_id = m.id
          ), 0)::int,
          'stages_cleared', (
            select count(*) from public.stages st where st.odyssey_id = o.id and st.cleared_at is not null
          )::int,
          'stages_total', (
            select count(*) from public.stages st where st.odyssey_id = o.id
          )::int,
          'crew_size', (
            select count(*) from public.members cm where cm.odyssey_id = o.id
          )::int,
          'completed_at', case when o.status = 'complete' then (
            select max(st.cleared_at) from public.stages st where st.odyssey_id = o.id
          ) end
        ) as row
      from public.members m
      join public.odysseys o on o.id = m.odyssey_id
      where m.user_id = v_uid and o.status <> 'forging'
    ) v
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_my_voyages() from public, anon;
grant execute on function public.get_my_voyages() to authenticated;
