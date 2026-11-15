// Scratch script: talk to Odysseus from the terminal, without Supabase.
// Runs the exact conversation module the odysseus-chat Edge Function uses.
//
//   nvm use 24
//   node --use-system-ca --env-file=supabase/functions/.env supabase/scratch/try-chat.ts
//   node --use-system-ca --env-file=supabase/functions/.env supabase/scratch/try-chat.ts \
//     --script "Big Bend" "Arlington TX" "4 of us" "2 days" "food and views" "fog"
//
// Interactive mode reads lines from stdin (Ctrl-D to quit). --script plays the
// given traveler lines in order and prints each reply, the trip draft, ready
// and on_topic. Needs LLM_API_KEY (and optionally LLM_CHAT_MODEL / LLM_MODEL) in
// supabase/functions/.env.

import { createInterface } from 'node:readline';
import { chatWithOdysseus, type ChatMessage, ChatError } from '../functions/odysseus-chat/chat.ts';
import { modelFor } from '../functions/_shared/gemini.ts';

const llmApiKey = process.env.LLM_API_KEY;
if (!llmApiKey) {
  console.error('Set LLM_API_KEY in supabase/functions/.env (see the header of this file).');
  process.exit(1);
}
const keys = { llmApiKey, model: modelFor('chat', (n) => process.env[n]) };

const args = process.argv.slice(2);
const scriptAt = args.indexOf('--script');
const scripted = scriptAt >= 0 ? args.slice(scriptAt + 1) : null;

const history: ChatMessage[] = [];

async function turn(line: string): Promise<boolean> {
  history.push({ role: 'traveler', text: line });
  try {
    const r = await chatWithOdysseus(history, keys);
    history.push({ role: 'odysseus', text: r.reply });
    console.log(`Odysseus: ${r.reply}`);
    console.log(`  trip: ${JSON.stringify(r.trip)}`);
    console.log(`  ready=${r.ready} on_topic=${r.on_topic}\n`);
    return r.ready;
  } catch (e) {
    history.pop();
    console.error(e instanceof ChatError ? `FAILED [${e.code}] ${e.message}` : e);
    return false;
  }
}

console.log(`Odysseus (${keys.model})\n`);
if (scripted) {
  let first = true;
  for (const line of scripted) {
    // The Gemini free tier allows 15 requests per minute.
    if (!first) await new Promise((r) => setTimeout(r, 4500));
    first = false;
    console.log(`Traveler: ${line}`);
    await turn(line);
  }
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: 'Traveler: ' });
  rl.prompt();
  for await (const line of rl) {
    if (line.trim()) await turn(line.trim().slice(0, 500));
    rl.prompt();
  }
}
