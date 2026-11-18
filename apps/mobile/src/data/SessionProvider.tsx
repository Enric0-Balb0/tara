import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { API_URL } from '@/config';

import { registerMe } from './me';
import { nextSession, readStoredSession } from './session';
import { AUTH_STORAGE_KEY, supabase } from './supabase';

interface SessionState {
  /** Sessione salvata sul telefono: c'è finché non si esce (vedi `session.ts`). */
  session: Session | null;
  /** Esce da questo telefono; il catalogo resta. */
  signOut: () => Promise<void>;
}

/**
 * Dopo un accesso riuscito: chiede `GET /v1/me` perché il backend crei l'utente. Senza
 * attendere; un fallimento finisce nel log e basta.
 */
export function announceSignIn(accessToken: string): void {
  void registerMe(accessToken, { apiUrl: API_URL }).then((result) => {
    if (result.kind === 'failed') console.warn(`GET /v1/me non riuscita: ${result.reason}`);
  });
}

const SessionContext = createContext<SessionState | null>(null);

/**
 * Sessione di Supabase Auth per tutta l'app. Il localStorage di expo-sqlite è sincrono:
 * la sessione salvata si legge al primo render, quindi l'app non mostra mai la schermata
 * di accesso a chi è già dentro, nemmeno per un istante.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() =>
    readStoredSession(localStorage.getItem(AUTH_STORAGE_KEY)),
  );

  useEffect(() => {
    // Niente chiamate a supabase.auth dentro il listener: supabase-js le blocca finché
    // il listener non ha finito.
    const { data } = supabase.auth.onAuthStateChange((event, changed) => {
      setSession((current) => nextSession(current, event, changed));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    // scope local: la sessione sparisce subito da questo telefono, anche offline; la
    // revoca del token sul server è un tentativo in più.
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const value = useMemo(() => ({ session, signOut }), [session, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const state = useContext(SessionContext);
  if (state === null) throw new Error('useSession va usato dentro SessionProvider');
  return state;
}
