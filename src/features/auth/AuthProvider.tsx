// Who is playing. Wraps the whole app; screens read it with useAuth().

import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { supabase } from '../../lib/supabase';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionState {
  status: AuthStatus;
  /** The Supabase user id (UUID). Null unless signed in. */
  userId: string | null;
  /** The unique username. Null unless signed in. */
  username: string | null;
}

export interface AuthState extends SessionState {
  /** The player's chosen avatar index (0 to 4). 0 until loaded or when signed out. */
  avatar: number;
  /** Saves the choice. Updates `avatar` at once and puts it back, rejecting, if saving fails. */
  chooseAvatar: (index: number) => Promise<void>;
}

const AVATAR_COUNT = 5;
const AVATAR_PATTERN = /^avatar_([0-4])$/;

const signedOut: SessionState = { status: 'signedOut', userId: null, username: null };

function fromSession(session: Session | null): SessionState {
  const username: unknown = session?.user.user_metadata.username;
  // An anonymous session (test scripts, older installs) has no username and does not count.
  if (!session || typeof username !== 'string' || username === '') return signedOut;
  return { status: 'signedIn', userId: session.user.id, username };
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading', userId: null, username: null });
  // The choice is kept with the user it belongs to, so signing out or switching user reads as 0 with no reset.
  const [chosen, setChosen] = useState<{ userId: string; index: number } | null>(null);
  const userId = state.userId;
  const avatar = chosen !== null && chosen.userId === userId ? chosen.index : 0;
  // Counts the player's choices, so a late profile load or a late failure can tell it is out of date.
  const choiceCount = useRef(0);
  // The last avatar known to be saved on the server for this user; null until known.
  const savedAvatar = useRef<number | null>(null);
  const avatarRef = useRef(avatar);
  useEffect(() => {
    avatarRef.current = avatar;
  }, [avatar]);

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

  // Load the saved avatar whenever someone signs in; reset it when they leave.
  useEffect(() => {
    savedAvatar.current = null;
    if (userId === null) return;
    let active = true;
    const choicesAtStart = choiceCount.current;
    supabase
      .from('profiles')
      .select('avatar_id')
      .eq('id', userId)
      .maybeSingle()
      .then(
        ({ data }) => {
          const match = typeof data?.avatar_id === 'string' ? AVATAR_PATTERN.exec(data.avatar_id) : null;
          if (!active || !match) return;
          savedAvatar.current = Number(match[1]);
          // Do not overwrite an avatar the player picked while this was loading.
          if (choiceCount.current === choicesAtStart) setChosen({ userId, index: Number(match[1]) });
        },
        () => {
          // Keep the default; the profile screen shows it and saving still works.
        },
      );
    return () => {
      active = false;
    };
  }, [userId]);

  const chooseAvatar = useCallback(
    async (index: number) => {
      if (!Number.isInteger(index) || index < 0 || index >= AVATAR_COUNT) throw new Error('invalid_avatar');
      if (userId === null) throw new Error('not_authenticated');
      const previous = avatarRef.current;
      if (savedAvatar.current === null) savedAvatar.current = previous;
      const mine = ++choiceCount.current;
      setChosen({ userId, index });
      try {
        const { error } = await supabase.rpc('set_my_avatar', { p_avatar_id: `avatar_${index}` });
        if (error) throw new Error(error.message);
        savedAvatar.current = index;
      } catch (e) {
        // Only undo our own choice, and go back to what the server last confirmed.
        if (choiceCount.current === mine) setChosen({ userId, index: savedAvatar.current ?? previous });
        throw e instanceof Error ? e : new Error('unknown');
      }
    },
    [userId],
  );

  const value = useMemo<AuthState>(() => ({ ...state, avatar, chooseAvatar }), [state, avatar, chooseAvatar]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
