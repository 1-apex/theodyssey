// The caller's voyage history. Errors are ApiErrors keyed like the rest of
// the app (see src/features/odyssey/api.ts).

import { ensureSignedIn, supabase } from '../../lib/supabase';
import { ApiError, toApiError } from '../odyssey/api';
import type { Voyage } from './voyages';

export type { Voyage, VoyageStatus } from './voyages';

/** Every Odyssey you are crew of (except ones still being forged), newest first. */
export async function getMyVoyages(): Promise<Voyage[]> {
  try {
    await ensureSignedIn();
    const { data, error } = await supabase.rpc('get_my_voyages');
    if (error) throw new ApiError(/^[a-z_]+$/.test(error.message) ? error.message : toApiError(error).code);
    return Array.isArray(data) ? (data as Voyage[]) : [];
  } catch (e) {
    throw toApiError(e);
  }
}
