// The app's one Supabase client. Anonymous auth: every phone gets a user id
// the first time it needs one, and keeps it across restarts.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False when the two EXPO_PUBLIC_ variables are missing. Screens show a hint instead of failing. */
export const isSupabaseConfigured = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

export const supabase = createClient(
  // createClient throws on an empty URL; a placeholder keeps the app bootable so it can say what is missing.
  isSupabaseConfigured ? SUPABASE_URL : 'http://localhost',
  isSupabaseConfigured ? SUPABASE_ANON_KEY : 'missing',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

let signingIn: Promise<string> | null = null;

/** Returns the signed-in user's id, signing in anonymously first if needed. */
export function ensureSignedIn(): Promise<string> {
  signingIn ??= (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session.user.id;
    const { data: created, error } = await supabase.auth.signInAnonymously();
    if (error || !created.user) throw new Error('not_authenticated');
    return created.user.id;
  })().finally(() => {
    signingIn = null;
  });
  return signingIn;
}

/** Access token for calls made with fetch (the Edge Function). */
export async function accessToken(): Promise<string> {
  await ensureSignedIn();
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('not_authenticated');
  return data.session.access_token;
}
