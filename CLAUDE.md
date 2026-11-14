# Odyssey (working title)

A cross-platform mobile app that turns a group road trip into a game. A user describes a trip in a prompt, an AI "Oracle" generates the route as a series of stages, and the crew clears stages by physically arriving at them. The route can be fully visible or hidden in fog. Visual style is 8-bit pixel art with an Odyssey and Greek mythology theme.

This is a hackathon project built by a team of 3. Optimize for a working demo over completeness.

Detailed docs:

- `docs/ARCHITECTURE.md`: system diagram, data model, sequence diagrams, contracts
- `docs/PLAN.md`: phases, task split for 3 people, cut order, demo script

## Glossary

Use these terms in UI copy, code names, and docs.

| Term | Meaning |
|---|---|
| Odyssey | One trip, from start to destination |
| Oracle | The AI that generates the route |
| Captain | The user who created the Odyssey |
| Crew | All members travelling on one Odyssey |
| Stage | One checkpoint on the route (also shown as an "Island" in UI) |
| Ithaca | The final destination stage |
| Fog | Visibility mode where future stages are hidden |
| Drachma | Points earned by clearing stages |

## Locked decisions

- The Oracle is the AI. The Captain enters a prompt and the AI plans everything.
- One crew, one start, one destination, travelling together. No multi-origin meetups.
- Captain picks the visibility mode at creation: `open` (full route visible) or `fog` (only cleared stages and the current target are visible).
- Stages clear automatically by geolocation. A stage clears for the whole crew when any member enters its radius.
- A manual "We have arrived" button exists as a fallback for denied permissions or bad GPS.
- Drachma are awarded per stage cleared and stored in a ledger. There is nothing to spend them on yet.
- Avatars are a fixed set of pre-generated AI pixel art images. No per-user generation at runtime.
- A simulate-travel mode exists for testing and for the demo.

## Not in scope (do not build unless asked)

- Group voting on destinations
- Friend leaderboards across Odysseys
- Spending or redeeming Drachma
- Chat, bookings, budgets, expense splitting
- Real accounts (email, OAuth). Anonymous auth plus a nickname only.
- Rendering a real map. The map is a pixel art screen with a ship moving between fixed points.

## Stack

| Layer | Choice |
|---|---|
| App | React Native with Expo, TypeScript, Expo Router |
| Location | `expo-location` (foreground), `expo-task-manager` geofencing (stretch, needs a dev build) |
| Backend | Supabase: Postgres, Realtime, anonymous auth, Edge Functions |
| AI | One LLM call with structured JSON output, made from an Edge Function |
| Geocoding | Maps geocoding API (Mapbox or Google Places), called from the Edge Function |
| Animation | React Native Animated or Reanimated. Skia only if needed. |

Library versions and Expo capabilities change often. Check current Expo and Supabase docs before relying on a specific API.

## Repo layout

```
app/                    Expo Router screens
  index.tsx             Home: create or join
  create.tsx            Summon the Oracle (prompt form)
  join.tsx              Enter join code, pick nickname and avatar
  odyssey/[id]/
    lobby.tsx           Crew assembling
    voyage.tsx          Pixel map, ship, current stage
    ithaca.tsx          End screen
src/
  components/           Shared UI (PixelButton, StageCard, CrewList)
  features/
    odyssey/            Create, fetch, subscribe
    crew/               Join, members
    location/           Watcher, geofence check, simulate mode
    points/             Ledger queries
  lib/
    supabase.ts         Client setup
    geo.ts              Haversine and helpers
    types.ts            Shared types (mirror of DB schema)
  theme/                Colors, pixel font, copy strings
assets/
  avatars/              Pre-generated pixel avatars
  sprites/              Ship, islands, fog, backgrounds
supabase/
  migrations/           SQL schema, RLS, RPC functions
  functions/
    generate-odyssey/   Prompt to route to geocode to insert
docs/
```

## Commands

```
npm install
npx expo start                      # run in Expo Go
npx supabase start                  # local Supabase
npx supabase db reset               # apply migrations
npx supabase functions serve        # run Edge Functions locally
npm run lint
npm run typecheck
```

## Environment

App (`.env`, prefixed so Expo exposes them):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Edge Function secrets (never in the app bundle):

- `LLM_API_KEY`
- `GEOCODING_API_KEY`

## Data model (summary)

- `odysseys`: id, join_code, captain_id, title, start_name, destination_name, visibility_mode (`open` | `fog`), status (`forging` | `lobby` | `voyage` | `complete`), current_stage_order
- `stages`: id, odyssey_id, order, name, title, lore, lat, lng, radius_m, points, cleared_at, cleared_by
- `members`: id, odyssey_id, user_id, nickname, avatar_id
- `points_ledger`: id, odyssey_id, member_id, stage_id, points, reason

Full schema and ER diagram are in `docs/ARCHITECTURE.md`.

## Rules for working in this repo

- TypeScript strict. No `any` unless there is a comment explaining why.
- The app never calls the LLM or geocoding API directly. Those go through the Edge Function.
- The app never writes `cleared_at` or `points_ledger` directly. Stage clears go through the `clear_stage` RPC, which is idempotent and validates distance on the server.
- In fog mode, hidden stages must not reach the client. Read stages through the `get_visible_stages` RPC, never with a direct table select.
- Never trust coordinates from the LLM. The LLM returns place names; coordinates come from geocoding.
- All location logic goes through `src/features/location`. Screens do not call `expo-location` directly. This keeps simulate mode a drop-in replacement.
- All user-facing strings live in `src/theme/copy.ts` so the Greek flavor stays consistent.
- Keep components small and feature folders self-contained. Three people are working in parallel, so avoid editing shared files without telling the team.
- Do not add a dependency for something achievable in under 30 lines.
- Prefer the simplest thing that demos well. If a task is growing, stop and propose a cut.

## Ownership

| Area | Owner |
|---|---|
| Screens, pixel UI, art assets, animations | Dev A (Frontend) |
| Supabase schema, RLS, RPCs, Edge Function, LLM and geocoding | Dev B (Backend and AI) |
| Location, geofence, simulate mode, realtime sync, points flow | Dev C (Game logic) |

Task-level breakdown is in `docs/PLAN.md`.
