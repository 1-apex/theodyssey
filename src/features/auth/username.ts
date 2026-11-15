// Username rules and the login address derived from a username.
// Pure functions: no Supabase client, so they can be unit tested.

/** Must match the check constraint on `profiles.username`. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const USERNAME_MAX = 20;
/** Supabase's own minimum (`minimum_password_length` in supabase/config.toml). */
export const PASSWORD_MIN = 6;

/**
 * The domain of the made-up login addresses. Hosted Supabase rejects domains
 * that do not resolve, so this is the project's own hostname; a local stack
 * (an IP address or localhost) accepts anything and gets a placeholder.
 * Accounts live in one project, so each project having its own domain is fine,
 * but changing a project's domain would orphan its existing logins.
 */
export function loginDomain(supabaseUrl: string): string {
  const host = /^https?:\/\/([^/:]+)/.exec(supabaseUrl)?.[1] ?? '';
  return /\.[a-z]{2,}$/i.test(host) ? host.toLowerCase() : 'players.odyssey.invalid';
}

/** Usernames are case-insensitive: "Odysseus" and "odysseus" are the same player. */
export const normalizeUsername = (raw: string): string => raw.trim().toLowerCase();
