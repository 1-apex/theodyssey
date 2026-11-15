-- Phase 0: core schema for Odyssey.
-- Four tables, constraints, and baseline RLS.
--
-- Write paths (none are open to the client directly):
--   odysseys, stages  -> generate-odyssey Edge Function (service role)
--   members           -> join_odyssey RPC
--   cleared_at, points_ledger, status/current_stage_order -> clear_stage RPC
-- Read paths:
--   odysseys, members, points_ledger -> direct select, crew only (RLS below)
--   stages                           -> get_visible_stages RPC only (no select policy)

-- ---------------------------------------------------------------------------
-- Join codes: 6 chars, uppercase, no ambiguous characters (0/O, 1/I/L).
-- ---------------------------------------------------------------------------
create or replace function public.generate_join_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1),
    ''
  )
  from generate_series(1, 6);
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.odysseys (
  id                  uuid primary key default gen_random_uuid(),
  join_code           text not null unique default public.generate_join_code(),
  captain_id          uuid not null references auth.users (id) on delete cascade,
  title               text not null,
  start_name          text not null,
  destination_name    text not null,
  visibility_mode     text not null default 'open'
                        check (visibility_mode in ('open', 'fog')),
  status              text not null default 'forging'
                        check (status in ('forging', 'lobby', 'voyage', 'complete')),
  -- "order" of the stage the crew is currently sailing toward. Starts at 1.
  current_stage_order int  not null default 1 check (current_stage_order >= 1),
  created_at          timestamptz not null default now()
);

create table public.members (
  id          uuid primary key default gen_random_uuid(),
  odyssey_id  uuid not null references public.odysseys (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  nickname    text not null check (char_length(nickname) between 1 and 24),
  avatar_id   text not null,
  joined_at   timestamptz not null default now(),
  unique (odyssey_id, user_id)
);

create table public.stages (
  id          uuid primary key default gen_random_uuid(),
  odyssey_id  uuid not null references public.odysseys (id) on delete cascade,
  -- 1-based and contiguous within an odyssey. The highest order is Ithaca.
  "order"     int  not null check ("order" >= 1),
  name        text not null,              -- real place name
  title       text not null,              -- themed name
  lore        text not null default '',
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  radius_m    int  not null default 250 check (radius_m > 0),
  points      int  not null default 100 check (points >= 0),
  cleared_at  timestamptz,
  cleared_by  uuid references public.members (id) on delete set null,
  unique (odyssey_id, "order")
);

create table public.points_ledger (
  id          uuid primary key default gen_random_uuid(),
  odyssey_id  uuid not null references public.odysseys (id) on delete cascade,
  member_id   uuid not null references public.members (id) on delete cascade,
  stage_id    uuid not null references public.stages (id) on delete cascade,
  points      int  not null,
  reason      text not null,
  created_at  timestamptz not null default now(),
  -- A stage can never pay the same member twice.
  unique (member_id, stage_id)
);

create index members_user_id_idx on public.members (user_id);
create index points_ledger_odyssey_id_idx on public.points_ledger (odyssey_id);

-- ---------------------------------------------------------------------------
-- Membership helper. SECURITY DEFINER so RLS policies on `members` can call it
-- without recursing into themselves.
-- ---------------------------------------------------------------------------
create or replace function public.is_crew(p_odyssey_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    where m.odyssey_id = p_odyssey_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_crew(uuid) from public, anon;
grant execute on function public.is_crew(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.odysseys      enable row level security;
alter table public.members       enable row level security;
alter table public.stages        enable row level security;
alter table public.points_ledger enable row level security;

-- Read-only for signed-in users; all writes go through RPCs / the Edge Function.
revoke all on public.odysseys, public.members, public.stages, public.points_ledger
  from anon, authenticated;
grant select on public.odysseys, public.members, public.points_ledger
  to authenticated;

-- The Captain can see the Odyssey before joining their own crew.
create policy "crew can read their odyssey"
  on public.odysseys for select to authenticated
  using (captain_id = (select auth.uid()) or public.is_crew(id));

create policy "crew can read crew"
  on public.members for select to authenticated
  using (public.is_crew(odyssey_id));

create policy "crew can read ledger"
  on public.points_ledger for select to authenticated
  using (public.is_crew(odyssey_id));

-- stages: RLS on, no policies, no grants. Fog mode depends on the only read
-- path being get_visible_stages.
