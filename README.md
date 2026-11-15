# Odyssey

A road trip turned into a game. A Captain describes the trip, an AI Oracle plans the route as a series of islands, and the crew clears them by arriving. See `CLAUDE.md` for the product rules and `docs/` for architecture and plans.

## Run the app

Needs Node 24 (`nvm use 24`).

1. Create `.env` in the repo root with your Supabase project's values:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
   ```

2. Install and start:

   ```
   npm install
   npx expo start
   ```

3. Open it in Expo Go on a phone (scan the QR code), or press `w` for the browser.

The Supabase project needs the migrations applied, anonymous sign-ins enabled, and the `generate-odyssey` function deployed with its secrets. `docs/BACKEND_TEST_PLAN.md` (Part 3) has the commands. Without the function, "Summon the Oracle" fails and the app offers a built-in demo route instead, which is enough to play a full voyage.

On a network that inspects TLS, prefix commands that download packages with `NODE_OPTIONS=--use-system-ca`.

## Play a voyage

1. Phone 1: **Create an Odyssey**. Enter a start, a destination, a nickname, and pick open or fog. **Summon the Oracle**.
2. Read the route, then **Gather Your Crew**. The lobby shows a 6 character join code.
3. Phone 2: **Join a Crew** with that code. Phone 1's crew list updates on its own.
4. Phone 1 (the Captain): **Begin the Voyage**. Every phone moves to the map.
5. Clear islands with **Simulate travel** (a simulated position sails to the island and the arrival is detected), **We have arrived** (manual), or switch to real GPS and go there.
6. After the last island, **Enter Ithaca** for the full route and crew totals.

## Checks

```
npm test                         # game logic unit tests
npm run test:functions           # Edge Function unit tests (Node's test runner, no Deno needed)
npm run typecheck
npm run lint
npx supabase start               # local backend in Docker
npx supabase test db             # database tests
node supabase/scratch/e2e.ts --local    # backend over HTTP
npm run test:app                 # the real UI in headless Chrome (node scripts/app-e2e.mjs)
```

`npm run test:app` builds the web app against the local stack and plays a whole Odyssey through the screens as separate accounts: sign-up, profile, the chat with Odysseus, summon, lobby, join, every stage, Ithaca, sign out. It starts its own mock LLM and geocoder and `supabase functions serve` pointed at them (needs Docker and `npx supabase start`; no API keys or internet), and stops them when done. Options (`--mode=open`, `--points=arriver`, `--skip-build`, `--out=`, `--no-extras`) are listed at the top of the file.

## Layout

| Path | What |
|---|---|
| `app/` | Screens (Expo Router). `app/odyssey/[id]/` holds preview, lobby, voyage and Ithaca. |
| `src/components/` | Pixel UI kit and sprites |
| `src/features/` | Game logic: location sources, arrival watcher, hooks, the Supabase backend adapter |
| `src/lib/` | Supabase client, shared types, geo helpers |
| `src/theme/copy.ts` | All user-facing strings |
| `supabase/` | Migrations, the Edge Function, database tests, test scripts |
