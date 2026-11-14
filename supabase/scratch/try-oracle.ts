// Scratch script: proves the LLM and geocoding keys work, without Supabase.
// Runs the exact pipeline the generate-odyssey Edge Function uses.
//
//   nvm use 24
//   node --env-file=supabase/functions/.env supabase/scratch/try-oracle.ts
//   node --env-file=supabase/functions/.env supabase/scratch/try-oracle.ts "Austin, TX" "Marfa, TX"
//
// supabase/functions/.env (gitignored) needs:
//   LLM_API_KEY=<Gemini API key, https://aistudio.google.com/apikey>
//   GEOCODING_API_KEY=<Mapbox access token>
//   LLM_MODEL=<optional Gemini model id override>
// The same file feeds `supabase functions serve` and `supabase secrets set --env-file`.

import { consultOracle, DEFAULT_MODEL, haversineKm, OracleError } from '../functions/generate-odyssey/oracle.ts';

const llmApiKey = process.env.LLM_API_KEY;
const geocodingApiKey = process.env.GEOCODING_API_KEY;
if (!llmApiKey || !geocodingApiKey) {
  console.error('Set LLM_API_KEY and GEOCODING_API_KEY in supabase/functions/.env (see the header of this file).');
  process.exit(1);
}

const [start = 'Arlington, TX', destination = 'Big Bend National Park, TX'] = process.argv.slice(2);
const model = process.env.LLM_MODEL ?? DEFAULT_MODEL;

console.log(`Consulting the Oracle (${model}): ${start} -> ${destination}\n`);
const t0 = Date.now();

try {
  const result = await consultOracle(
    { start, destination, crew_size: 4, travel_style: 'scenic, food stops, no rush', duration: '2 days' },
    { llmApiKey, geocodingApiKey, model },
  );

  console.log(result.title);
  let prev = result.start;
  for (const s of result.stages) {
    const leg = Math.round(haversineKm(prev, s));
    console.log(`  ${s.order}. ${s.title}  [${s.points} dr]`);
    console.log(`     ${s.name}  (${s.lat.toFixed(4)}, ${s.lng.toFixed(4)})  +${leg} km`);
    console.log(`     ${s.lore}`);
    prev = s;
  }
  for (const d of result.dropped) console.log(`  dropped: ${d.place} (${d.reason})`);
  console.log(`\nOK in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} catch (e) {
  if (e instanceof OracleError) console.error(`FAILED [${e.code}] ${e.message}`);
  else console.error('FAILED', e);
  process.exit(1);
}
