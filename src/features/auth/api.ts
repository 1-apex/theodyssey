// Username and password sign-in.
//
// Supabase Auth owns the password (hashed, never stored by us) and the user id
// (a UUID). Supabase needs an email to attach a password to, so each username
// maps to one made-up address (see loginDomain in username.ts). No email is
// ever sent, and the unique email is what makes the username unique. The database also keeps
// a `profiles` row (id -> username), created by a trigger on sign-up.

import { isSupabaseConfigured, supabase, SUPABASE_URL } from '../../lib/supabase';
import { loginDomain, normalizeUsername, PASSWORD_MIN, USERNAME_PATTERN } from './username';

export type AuthErrorCode =
  | 'invalid_username'
  | 'weak_password'
  | 'wrong_password' // the name exists and the password does not match
  | 'signups_closed' // the project wants email confirmation, or sign-ups are off
  | 'not_configured'
  | 'network'
  | 'unknown';

export class AuthError extends Error {
  code: AuthErrorCode;
  constructor(code: AuthErrorCode) {
    super(code);
    this.code = code;
  }
}

const loginEmail = (username: string): string => `${username}@${loginDomain(SUPABASE_URL)}`;

interface SupabaseAuthFailure {
  code?: string;
  status?: number;
  message: string;
}

function toAuthError(e: SupabaseAuthFailure): AuthError {
  if (e.code === 'weak_password') return new AuthError('weak_password');
  if (e.code === 'signup_disabled' || e.code === 'email_provider_disabled' || e.code === 'email_address_invalid') {
    return new AuthError('signups_closed');
  }
  // Status 0 or no status at all is what a failed fetch looks like.
  if (!e.status || /network|fetch|timed? ?out/i.test(e.message)) return new AuthError('network');
  return new AuthError('unknown');
}

export interface Entered {
  username: string;
  /** True when this call created the account. */
  isNew: boolean;
}

/**
 * The one door into the app: signs in if the username exists, otherwise
 * creates it with this password. Throws an AuthError.
 */
export async function enter(rawUsername: string, password: string): Promise<Entered> {
  if (!isSupabaseConfigured) throw new AuthError('not_configured');
  const username = normalizeUsername(rawUsername);
  if (!USERNAME_PATTERN.test(username)) throw new AuthError('invalid_username');
  if (password.length < PASSWORD_MIN) throw new AuthError('weak_password');
  const email = loginEmail(username);

  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  if (!signedIn.error) return { username, isNew: false };
  // "Invalid credentials" covers both a wrong password and a name nobody has
  // taken yet, so try to create it; an existing name is then reported as such.
  if (signedIn.error.code !== 'invalid_credentials') throw toAuthError(signedIn.error);

  const signedUp = await supabase.auth.signUp({ email, password, options: { data: { username } } });
  if (signedUp.error) {
    if (signedUp.error.code === 'user_already_exists') throw new AuthError('wrong_password');
    throw toAuthError(signedUp.error);
  }
  // No session means the project is waiting for an email confirmation that can never arrive.
  if (!signedUp.data.session) throw new AuthError('signups_closed');
  return { username, isNew: true };
}

export async function leave(): Promise<void> {
  await supabase.auth.signOut();
}
