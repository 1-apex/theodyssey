-- Phase 4: Drachma totals per crew member.
--
-- Totals are always sum(points) over the ledger; nothing stores a running
-- total. SECURITY INVOKER on purpose: RLS on members and points_ledger
-- already limits this to the caller's own crew, so outsiders get no rows.

create or replace function public.get_points_summary(p_odyssey_id uuid)
returns table (
  member_id uuid,
  nickname text,
  avatar_id text,
  total_points int,
  stages_cleared int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.id,
         m.nickname,
         m.avatar_id,
         coalesce(sum(l.points), 0)::int,
         count(l.id)::int
  from public.members m
  left join public.points_ledger l on l.member_id = m.id
  where m.odyssey_id = p_odyssey_id
  group by m.id
  order by coalesce(sum(l.points), 0) desc, m.joined_at;
$$;

revoke all on function public.get_points_summary(uuid) from public, anon;
grant execute on function public.get_points_summary(uuid) to authenticated;
