// Scratch script: proves the LLM and geocoding keys work, without Supabase.
// Runs the exact pipeline the generate-odyssey Edge Function uses.
//
//   nvm use 24
//   node --use-system-ca --env-file=supabase/functions/.env supabase/scratch/try-oracle.ts
//   node --use-system-ca --env-file=supabase/functions/.env supabase/scratch/try-oracle.ts "Austin, TX" "Marfa, TX"
//   node --use-system-ca --env-file=supabase/functions/.env supabase/scratch/try-oracle.ts "Dallas, TX" "Tokyo" flight
// The third argument is the travel mode (road, the default, or flight).
//
// supabase/functions/.env (gitignored) needs:
//   LLM_API_KEY=<Gemini API key, https://aistudio.google.com/apikey>
//   GEOCODING_API_KEY=<Mapbox access token>
//   LLM_PLANNER_MODEL=<optional model id override; LLM_MODEL overrides both chat and planner>
// The same file feeds `supabase functions serve` and `supabase secrets set --env-file`.

import { consultOracle, haversineKm, OracleError, type TravelMode } from '../functions/generate-odyssey/oracle.ts';
import { modelFor, retryKeys } from '../functions/_shared/gemini.ts';

const llmApiKey = process.env.LLM_API_KEY;
const geocodingApiKey = process.env.GEOCODING_API_KEY;
if (!llmApiKey || !geocodingApiKey) {
  console.error('Set LLM_API_KEY and GEOCODING_API_KEY in supabase/functions/.env (see the header of this file).');
  process.exit(1);
}

const [start = 'Arlington, TX', destination = 'Big Bend National Park, TX', mode = 'road'] = process.argv.slice(2);
if (mode !== 'road' && mode !== 'flight') {
  console.error('Travel mode must be "road" or "flight".');
  process.exit(1);
}
const travel_mode: TravelMode = mode;
const model = modelFor('planner', (n) => process.env[n]);

console.log(`Consulting the Oracle (${model}, ${travel_mode}): ${start} -> ${destination}\n`);
const t0 = Date.now();

try {
  const request = { start, destination, crew_size: 4, travel_style: 'scenic, food stops, no rush', duration: '2 days', travel_mode };
  const keys = { llmApiKey, geocodingApiKey, model };
  let result;
  try {
    result = await consultOracle(request, keys);
  } catch (e) {
    // The same single retry on the fallback model as the generate-odyssey function.
    if (!(e instanceof OracleError) || e.code === 'endpoint_not_found') throw e;
    const fallback = retryKeys(keys);
    console.log(`attempt 1 failed [${e.code}] ${e.message.slice(0, 160)}\nretrying on ${fallback.model}\n`);
    result = await consultOracle(request, fallback);
  }

  console.log(result.title);
  // A flight earns nothing for the flight itself: the first leg starts at the destination centre.
  let prev = travel_mode === 'flight' ? result.destination : result.start;
  let total = 0;
  for (const s of result.stages) {
    const leg = Math.round(haversineKm(prev, s));
    total += s.points;
    console.log(`  ${s.order}. ${s.title}  [${s.points} dr]`);
    console.log(`     ${s.name}  (${s.lat.toFixed(4)}, ${s.lng.toFixed(4)})  +${leg} km`);
    console.log(`     ${s.lore}`);
    prev = s;
  }
  for (const d of result.dropped) console.log(`  dropped: ${d.place} (${d.reason})`);
  console.log(`\nTotal ${total} dr. OK in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} catch (e) {
  if (e instanceof OracleError) console.error(`FAILED [${e.code}] ${e.message}`);
  else console.error('FAILED', e);
  process.exit(1);
}
