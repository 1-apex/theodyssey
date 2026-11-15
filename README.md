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

## Build an Android APK

A release APK can be built locally, with no Expo account, and installed on a phone by hand.

Needs JDK 17 and the Android command-line tools (`JAVA_HOME` and `ANDROID_HOME` set, SDK licences accepted).

```
npx expo prebuild -p android --no-install
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

The APK lands in `android/app/build/outputs/apk/release/app-release.apk`. It is signed with the debug key, which is fine for sideloading and not for the Play Store.

- The Supabase URL and key from `.env` are baked in at build time. Change the backend, then rebuild.
- `android/` is generated and git-ignored. Prebuild rewrites the `android` and `ios` scripts in `package.json`; put them back before committing.
- Android release builds refuse plain HTTP, so the backend must be served over HTTPS.
- App icons come from one pixel grid in `scripts/make-icon.mjs`, which writes the SVG masters and the PNGs in `assets/images/`. Run `node scripts/make-icon.mjs` after editing the grid, then prebuild again.

## Backend on Vultr (self-hosted Supabase)

The demo backend runs on a Vultr cloud server (Supabase marketplace image, 1 CPU, 2 GB RAM) at `https://66-42-91-137.sslip.io`. The app talks to it exactly as it would to a hosted Supabase project.

How it was set up, in `/home/supabase/supabase/docker` on the server:

1. **HTTPS:** the image's Caddy overlay with `PROXY_DOMAIN` set to an `sslip.io` name for the server's IP, which gets a Let's Encrypt certificate with no domain purchase. `SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL` and `SITE_URL` point at that address.
2. **Keys:** the image ships with Supabase's public demo keys, which PostgREST rejects. Re-sign `ANON_KEY` and `SERVICE_ROLE_KEY` with the server's own `JWT_SECRET`, then run `utils/add-new-auth-keys.sh --update-env`.
3. **Auth:** `ENABLE_EMAIL_AUTOCONFIRM=true` (there is no mail server) and `ENABLE_ANONYMOUS_USERS=true`.
4. **Database:** apply every file in `supabase/migrations/` in order with `psql -v ON_ERROR_STOP=1` inside the `supabase-db` container, then reload PostgREST's schema cache.
5. **Functions:** copy `supabase/functions/{_shared,generate-odyssey,odysseus-chat,odysseus-voice}` into `volumes/functions/` and restart the `functions` container. Their secrets (`LLM_API_KEY`, `GEOCODING_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`) are passed in through a small compose override file added to `COMPOSE_FILE`.
6. **Lock down Postgres:** the image publishes ports 5432 and 6543 to the internet, and Docker bypasses `ufw`. The same override binds them to `127.0.0.1`.

Then put the server's URL and anon key in `.env` as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## The Oracle

- **How many stages:** the Oracle picks a target between 3 and 12 from the trip's duration and the route length, and the traveller's own words in the chat win ("lots of stops", "just a couple", "6 stops"). It asks the model for two spare places, so stages dropped by geocoding or the route checks do not shrink the result, and trims the extras afterwards. Ithaca always stays last.
- **Speed:** places are geocoded in parallel, and both the chat and the planner default to `gemini-3.1-flash-lite` with `gemini-3.5-flash-lite` as the retry model. On the Vultr server a chat turn takes about 1 to 1.4 s and a route about 3 to 4 s. The `LLM_CHAT_MODEL`, `LLM_PLANNER_MODEL` and `LLM_MODEL` secrets still override the models.
- **Known gap:** for flight trips to some cities (Tokyo, for one) the geocoder returns only the city centre for many places, so few stages survive.

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
