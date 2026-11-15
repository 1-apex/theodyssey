# Backend test plan (Dev B)

How to check that the Supabase schema, RPCs and the `generate-odyssey` Edge Function work, first on your machine and then on the hosted project.

Work through the parts in order. Each step says what you should see. If a step fails, stop there; later steps depend on it.

## What is already verified, and what is not

| Area | Status |
|---|---|
| Schema, RLS, all RPCs | Passing locally: 86 database tests |
| Full flow over HTTP (auth, join, fog, clears, Drachma, Realtime) | Passing locally in fog and open mode |
| Edge Function (auth, validation, persistence, retry, cleanup on failure) | Passing locally against a **mock** LLM and geocoder |
| Real Gemini and Mapbox calls (Part 2) | Passing from this machine: two routes, about 3 seconds each |
| Edge Function with the real APIs | **Not tested.** It needs the hosted deploy in Part 3. |
| Dev C's app code (merged from PR #1) | `npm test` (108), typecheck and lint pass. Not run on a phone. |
| Anything on the hosted project | **Not tested.** Parts 3 and 4 cover it. |

The remaining risk is the hosted project: migrations, secrets and the deployed function have not been exercised.

## Before you start

- Node 24: `nvm use 24`
- On a network that inspects TLS (this one does), Node rejects outbound HTTPS with `self-signed certificate in certificate chain`. Add `--use-system-ca` after `node` in every command below that talks to the internet (Parts 2 and 4). It makes Node trust the macOS certificate store.
- Docker Desktop running (only for Part 1)
- `supabase/functions/.env` (gitignored) containing:

```
LLM_API_KEY=<Gemini API key from https://aistudio.google.com/apikey>
GEOCODING_API_KEY=<Mapbox access token>
NEXT_PUBLIC_SUPABASE_URL=<already there>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<already there>
```

The test scripts accept the `NEXT_PUBLIC_` names. The Expo app will need the same two values as `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the root `.env`.

## Part 1: Local (about 3 minutes)

This repeats what has already passed, so you know your machine is set up.

```
npx supabase start        # skip if it is already running
npx supabase db reset     # applies all 6 migrations
npx supabase test db
```

Expect `Files=6, Tests=86` and `Result: PASS`.

The app side has its own checks: `npm ci`, then `npm test` (108 pass), `npm run typecheck` and `npm run lint`.

```
node supabase/scratch/e2e.ts --local
node supabase/scratch/e2e.ts --local --mode=open
```

Expect `ALL CHECKS PASSED` both times. These use the demo route, so no API keys are involved.

Do not test the Edge Function with real keys locally on this network. The local function container cannot make outbound HTTPS calls here (it does not trust the network's TLS certificate). Use Part 2 and Part 4 for that.

## Part 2: The Oracle with real keys (about 2 minutes)

This runs the exact pipeline the Edge Function uses, from Node, without Supabase.

```
node --use-system-ca --env-file=supabase/functions/.env supabase/scratch/try-oracle.ts
```

Expect a themed title, then 3 to 7 stages, ending with `OK in Ns`. This passed on 2026-11-14 for Arlington to Big Bend and Mumbai to Panaji.

Check these by eye:

1. Every stage is a real place, and the coordinates are in the right part of Texas. Paste one or two into a maps app.
2. The last stage is the destination and shows `[250 dr]`; the others show `[100 dr]`.
3. The `+N km` legs look like a sensible drive, with no jump backwards.
4. At most one or two `dropped:` lines. Several drops on every run means the model is inventing places.
5. It finishes in under about 15 seconds.

Then try two routes of your own, including the one you plan to demo:

```
node --use-system-ca --env-file=supabase/functions/.env supabase/scratch/try-oracle.ts "Austin, TX" "Marfa, TX"
```

If it fails:

| Output | Meaning | What to do |
|---|---|---|
| `[llm_failed] LLM returned 400` | Gemini rejected the request body | Send me the full message; the request shape needs adjusting |
| `[llm_failed] LLM returned 401/403` | Bad Gemini key | Check `LLM_API_KEY` |
| `fetch failed` / `self-signed certificate` | Node does not trust the network's TLS certificate | Add `--use-system-ca` |
| `[llm_failed] LLM returned 404` | Model id not available to your key | Set `LLM_CHAT_MODEL` / `LLM_PLANNER_MODEL` (or `LLM_MODEL`) in the env file to a model your key can use |
| `[llm_failed] LLM returned 429` | Free-tier rate limit | Wait a minute |
| `[llm_bad_output]` | The response layout differs from what the code reads | Send me the full message |
| `Geocoding auth failed` | Bad Mapbox token | Check `GEOCODING_API_KEY` |
| `[endpoint_not_found]` | Mapbox could not find the start or destination | Try a more specific name |
| `[too_few_stages]` | Too many stages failed to geocode | Run again; if it repeats, try a stronger model with `LLM_PLANNER_MODEL` |

Two models, two jobs. Chat (many small turns) uses `gemini-3.1-flash-lite`; route planning (one big structured answer) uses `gemma-4-31b-it` (Gemma 4 31B). Gemma is often overloaded (503), so each function's single retry goes to the other model: chat falls back to Gemma, the planner to `gemini-3.1-flash-lite`. Override with `LLM_CHAT_MODEL` and `LLM_PLANNER_MODEL`; the older `LLM_MODEL` still overrides both. If routes are dull or often contain fake places, set `LLM_PLANNER_MODEL=gemini-3.8-flash` and compare. `try-oracle.ts` takes a third argument, `road` (default) or `flight`.

## Part 3: Set up the hosted project (about 5 minutes, once)

```
npx supabase login
npx supabase link --project-ref <your project ref>
npx supabase db push
```

`db push` lists the 6 migrations and asks for confirmation. Expect all 6 applied with no errors.

Then:

1. In the dashboard, open Authentication, then Sign In / Providers, and turn on **Allow anonymous sign-ins**.
2. Set the function secrets and deploy:

```
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy generate-odyssey
```

The secrets command also uploads the two `NEXT_PUBLIC_` values. They are public values, so this is harmless.

## Part 4: Hosted end to end (about 3 minutes)

First without the Oracle, to prove the database side:

```
node --use-system-ca --env-file=supabase/functions/.env supabase/scratch/e2e.ts
```

Expect `ALL CHECKS PASSED`. If the first check fails with "Anonymous sign-in failed", step 1 of Part 3 was missed.

Then with the real Oracle, in both modes:

```
node --use-system-ca --env-file=supabase/functions/.env supabase/scratch/e2e.ts --oracle
node --use-system-ca --env-file=supabase/functions/.env supabase/scratch/e2e.ts --oracle --mode=open
```

Expect `ALL CHECKS PASSED`, with the create step taking a few seconds.

If the create step fails:

| Response | Meaning |
|---|---|
| `not_configured` | Secrets are missing, or the function cannot find its service key. Run `npx supabase functions logs generate-odyssey` and send me the output. |
| `not_authenticated` | The function could not verify the user token. Send me the logs. |
| `llm_failed`, `llm_bad_output`, `too_few_stages` | Same causes as Part 2; the detail is in the function logs. |

Each run leaves three anonymous users and one Odyssey behind. To clear test data from the hosted project, run this in the SQL editor. It deletes **every** Odyssey, so do not run it once real ones exist:

```sql
delete from public.odysseys;
```

## Part 5: Manual checks in the dashboard (about 5 minutes)

Run `e2e.ts --oracle` once more, then look in the Table Editor.

1. `odysseys`: the newest row has status `complete`, a real title from the Oracle, and a 6 character join code with no `0`, `O`, `1`, `I` or `L`.
2. `stages`: orders run 1 to N with no gaps, every row has `cleared_at` and `cleared_by`, and the last one has 250 points.
3. `points_ledger`: two rows per stage (one per member), and the last stage's rows have reason `ithaca_reached`.
4. No `odysseys` row is stuck in status `forging`.
5. Database, then Publications, then `supabase_realtime`: `odysseys`, `members` and `points_ledger` are on; `stages` is off.

## Testing by hand in the browser

`supabase/scratch/tester.html` is a single page for clicking through every part of the backend and seeing each request and response.

```
open supabase/scratch/tester.html
```

1. **Connection:** paste the project URL and publishable key (local values come from `npx supabase status`), then Save and test. It should say anonymous sign-ins are enabled.
2. **Full walkthrough (section 11):** press Run walkthrough. Expect `WALKTHROUGH PASSED`. Tick the Oracle box to create the route through the Edge Function instead of the demo route (hosted project only; see the note in Part 1).
3. **By hand:** sign in two or three users in section 2 and click a user to act as it. Create an Odyssey as one, join as another, set sail, and clear stages. Switch users to see what each is allowed to see; in fog mode the stage list should show hidden islands.
4. **Realtime:** open the page in a second browser window, select a different crew member there, and press Subscribe. Clearing a stage in the first window should log a `REALTIME` event in the second and refresh its panels.
5. **Security checks (section 8)** and **Tables (section 9)** show what a client is refused and which rows each user can read.

## Testing through the app itself

The app is now connected to this backend. `README.md` has the steps to run it on a phone or in the browser and to play a voyage on two devices.

`npm run test:app` (`node scripts/app-e2e.mjs`) does the same automatically against the local stack. It builds the web app, starts a mock Gemini/Mapbox server and `supabase functions serve` pointed at it (so it needs Docker and the local stack, but no API keys or internet), and opens headless Chrome as a Captain and a Sailor (plus a third account for the failure paths). Each phone signs up with a random username. It plays the whole flow through the screens: profile and avatar, the chat with Odysseus (including one failed call and Try again), summon, preview, lobby, join, Realtime sync, fog, every stage, Drachma, Ithaca, sign out and back in. Failure paths on the third phone: two chat failures in a row lead to the scripted fallback, then a failed summon leads to "Sail the demo route instead". Run the default (fog, whole crew), `--mode=open` and `--points=arriver`; each prints `ALL <n> CHECKS PASSED`. The mock and the functions are stopped when the script ends, also on failure or Ctrl-C. `npm run test:functions` runs the Edge Function unit tests.

## Part 6: Demo readiness

Do this on the day, on the venue network.

1. Run Part 2 with your demo prompt three times. All three should give a route you would be happy to show.
2. Run `e2e.ts --oracle` against hosted once.
3. Confirm the fallback: `e2e.ts` without `--oracle` passes. That is the path the app takes through `create_demo_odyssey` if the Oracle fails on stage.

## What to tell Dev A and Dev C

- All call shapes are in `src/lib/types.ts`.
- Read stages only through `get_visible_stages`. A direct select on `stages` is denied.
- `stages` sends no Realtime events. Subscribe to `odysseys`; it changes on every clear and on set sail. Refetch visible stages when it does.
- The Captain must be in the crew to clear stages. Either send `nickname` and `avatar_id` to `generate-odyssey`, or call `join_odyssey` with the Captain's own code.
- `clear_stage` returns a `result` field for normal outcomes (`too_far`, `already_cleared`, and so on). It only raises an error for bugs such as not being in the crew.
- `create_demo_odyssey` works without any API keys once the migrations are pushed.
- `points_mode` (`crew` or `arriver`) is stored on the Odyssey and applied by `clear_stage`. Send it to `generate-odyssey`; it defaults to `crew`.
- Not in the schema yet: start coordinates for simulate mode. The Odyssey stores `start_name` only.
- The server's default stage radius is 250 m; the mock uses 500 m.

## Odysseus speaks (odysseus-voice, ElevenLabs)

Set two secrets (and optionally a third) for the voice, then deploy the function. Without them the function answers 503 `voice_not_configured` and the app stays silent.

```
npx supabase secrets set ELEVENLABS_API_KEY=<key> ELEVENLABS_VOICE_ID=<voice id>
# optional: ELEVENLABS_MODEL (default eleven_flash_v2_5)
npx supabase functions deploy odysseus-voice
```

For `supabase functions serve` add the same names to `supabase/functions/.env`. Only signed-in, non-anonymous users may call it (anonymous: 403 `account_required`). Test locally against a mock with `ELEVENLABS_BASE_URL`.
