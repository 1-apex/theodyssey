// Who is playing. Wraps the whole app; screens read it with useAuth().

import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '../../lib/supabase';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthState {
  status: AuthStatus;
  /** The Supabase user id (UUID). Null unless signed in. */
  userId: string | null;
  /** The unique username. Null unless signed in. */
  username: string | null;
}

const signedOut: AuthState = { status: 'signedOut', userId: null, username: null };

function fromSession(session: Session | null): AuthState {
  const username: unknown = session?.user.user_metadata.username;
  // An anonymous session (test scripts, older installs) has no username and does not count.
  if (!session || typeof username !== 'string' || username === '') return signedOut;
  return { status: 'signedIn', userId: session.user.id, username };
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', userId: null, username: null });

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setState(fromSession(data.session));
      })
      .catch(() => {
        if (active) setState(signedOut);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState(fromSession(session));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
