# Build plan

Team of 3. Phases are ordered so that the app is demoable at the end of every phase from Phase 2 onward. Hours are not assigned because the hackathon length is not confirmed; scale each phase to fit.

## Roles

| Role | Owns | Folders |
|---|---|---|
| Dev A: Frontend and art | Screens, navigation, pixel UI kit, sprites, avatars, animations, copy | `app/`, `src/components`, `src/theme`, `assets/` |
| Dev B: Backend and AI | Supabase schema, RLS, RPCs, Edge Function, LLM prompt, geocoding | `supabase/`, `src/lib/supabase.ts`, `src/lib/types.ts` |
| Dev C: Game logic | Location module, simulate mode, geofence check, realtime sync, points flow, data hooks | `src/features/`, `src/lib/geo.ts` |

Separate folders keep merge conflicts low. Dev C is the glue between A's screens and B's backend, so C should be whoever is most comfortable across the stack.

## Agree on these before anyone writes code

These are the contracts between the three workstreams. Lock them in the first 30 minutes.

1. **Types** in `src/lib/types.ts`: `Odyssey`, `Stage`, `Member`, `LedgerEntry`.
2. **Backend calls** and their shapes: `generate-odyssey`, `join_odyssey`, `get_visible_stages`, `clear_stage`.
3. **Hooks** that screens consume: `useOdyssey(id)`, `useVisibleStages(id)`, `useCrew(id)`, `useLocation()`, `usePoints(id)`.
4. **Mock data**: one hardcoded Odyssey with 6 stages. Dev A builds screens against it, Dev C builds simulate mode against it, nobody waits on the backend.

## Phase 0: Setup

Goal: everyone can run the app on their own phone and reach Supabase.

| Dev A | Dev B | Dev C |
|---|---|---|
| Create Expo project with TypeScript and Expo Router | Create Supabase project, enable anonymous auth | Write shared types and the mock Odyssey |
| Set up theme: palette, pixel font, base button | Write the schema migration (4 tables) | Set up Supabase client in the app |
| Generate the avatar set and core sprites in one batch | Get LLM and geocoding API keys working in a scratch script | Stub all hooks returning mock data |

Exit: app opens in Expo Go on all three phones, shows a themed home screen, mock data loads.

## Phase 1: The Oracle

Goal: a prompt becomes a saved, geocoded route. This is the riskiest piece, so it comes first.

| Dev A | Dev B | Dev C |
|---|---|---|
| Home screen (create or join) | `generate-odyssey` Edge Function: LLM call with JSON schema | `geo.ts`: haversine, interpolation along a route |
| Create screen: prompt form, mode toggle, loading state ("The Oracle is consulting the gods") | Geocode each stage, drop failures, sanity check order | `SimProvider`: move a position along the mock route |
| Lobby screen layout with join code | Insert odyssey and stages, return id and join code | `useOdyssey` wired to real data |

Exit: enter a real prompt on a phone, see a real generated route land in the database.

## Phase 2: The Voyage (first demoable build)

Goal: one phone can sail through an Odyssey in simulate mode.

| Dev A | Dev B | Dev C |
|---|---|---|
| Voyage screen: pixel background, islands, ship sprite | `get_visible_stages` RPC | `useVisibleStages` wired to the RPC |
| Ship movement animation between islands | `clear_stage` RPC: validate, mark cleared, advance, idempotent | Geofence check: distance to current stage, call `clear_stage` |
| Stage card: title, lore, real place name | RLS: block direct selects on `stages` | Simulate controls: slider or "sail" button, dev toggle |

Exit: create an Odyssey, hit "sail" in simulate mode, watch stages clear one by one to the end.

## Phase 3: The Crew

Goal: multiple phones on one Odyssey stay in sync.

| Dev A | Dev B | Dev C |
|---|---|---|
| Join screen: code entry, nickname, avatar picker | `join_odyssey` RPC with code validation | Realtime subscription for odyssey, stages, members |
| Lobby: live crew list with avatars, Set Sail button for Captain | Enable Realtime on the tables, membership checks in RPCs | `useCrew` live updates, refetch on app focus |
| Crew strip on the voyage screen | Status transitions: lobby to voyage to complete | Handle a stage clearing from another phone |

Exit: three phones join by code, Captain sets sail, one phone clears a stage and all three update.

## Phase 4: Fog, Drachma, and real location

Goal: the features that make it a game.

| Dev A | Dev B | Dev C |
|---|---|---|
| Fog rendering over hidden islands | Fog logic verified in `get_visible_stages`, full reveal on complete | `GpsProvider` with `expo-location`, permission flow |
| Reveal animation when a stage clears | Ledger inserts for all members inside `clear_stage`, bonus for Ithaca | Manual "We have arrived" fallback |
| Drachma counter and award animation | Points summary query | `usePoints`, test a real check-in by walking or driving to a nearby spot |

Exit: fog mode hides the future route, points appear on clear, and a real GPS check-in works outdoors.

## Phase 5: Ithaca and polish

Goal: a demo that lands.

| Dev A | Dev B | Dev C |
|---|---|---|
| Ithaca end screen: full route revealed, crew totals | Pre-seed a demo Odyssey with a good route | End to end test on 3 phones, fix sync bugs |
| Sound, haptics, Greek copy pass, app icon | Error handling and retry on generation failure | Loading, empty, and offline states |
| Record a backup demo video | Deploy Edge Function and confirm secrets in production | Build an Android APK for the demo device |

Exit: the demo script below runs twice in a row without a hitch.

## Stretch (only if Phase 5 is done)

1. Background geofencing with a development build, Android first.
2. Photo check-in per stage, shown as a scroll on the end screen.
3. A "trial" (small challenge) per stage for bonus Drachma.
4. Captain can regenerate a single stage.

## Cut order if time runs short

Cut from the top.

1. Sound and haptics
2. Real GPS check-in (keep manual button and simulate mode)
3. Drachma animations (keep the number)
4. Avatar picker (assign randomly)
5. Lore text per stage

Never cut: prompt to route, the voyage screen, crew sync, fog mode. Those four are the product.

## Demo script

1. State the pitch in one line: "Road trips are a checklist. We made them an odyssey."
2. Captain enters a real prompt live. Show the Oracle generating the route.
3. Two teammates join by code on their own phones. Show the lobby filling in.
4. Captain sets sail in fog mode. Show the hidden route.
5. Use simulate mode to arrive at stage 1. All three phones reveal the next island and award Drachma.
6. Fast forward to Ithaca. Show the full route reveal and crew totals.
7. Close with what comes next: voting, leaderboards, spending Drachma.

Have the pre-seeded Odyssey and the backup video ready in case the venue network fails.

## Working agreements

- One branch per task, small pull requests, merge often.
- Nobody edits another owner's folder without a heads up.
- Sync for 5 minutes at the end of every phase: what works, what is blocked, what gets cut.
- If something takes twice as long as expected, raise it immediately and cut scope.

## Open questions

- Hackathon length and judging criteria
- Which LLM provider and which geocoding API
- Who has shipped React Native before (decides whether background geofencing is realistic)
- Final app name
