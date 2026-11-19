import type { Session } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { nextSession, readStoredSession } from './session';

/** Sessione minima come la salva supabase-js nel localStorage. */
function session(email = 'enrico@example.com', accessToken = 'access-1'): Session {
  return {
    access_token: accessToken,
    refresh_token: 'refresh-1',
    expires_in: 3600,
    expires_at: 1_800_000_000,
    token_type: 'bearer',
    user: {
      id: 'u-1',
      email,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-11-01T10:00:00Z',
    },
  };
}

describe('readStoredSession', () => {
  it('senza niente salvato non c’è sessione', () => {
    expect(readStoredSession(null)).toBeNull();
  });

  it('legge la sessione salvata da supabase-js', () => {
    const stored = session();
    expect(readStoredSession(JSON.stringify(stored))).toEqual(stored);
  });

  it('un valore rovinato non è una sessione', () => {
    expect(readStoredSession('{non json')).toBeNull();
    expect(readStoredSession('"testo"')).toBeNull();
    expect(readStoredSession('null')).toBeNull();
  });

  it('senza token o senza utente non è una sessione', () => {
    const { access_token: _access, ...noAccess } = session();
    const { refresh_token: _refresh, ...noRefresh } = session();
    const { user: _user, ...noUser } = session();
    expect(readStoredSession(JSON.stringify(noAccess))).toBeNull();
    expect(readStoredSession(JSON.stringify(noRefresh))).toBeNull();
    expect(readStoredSession(JSON.stringify(noUser))).toBeNull();
  });
});

describe('nextSession', () => {
  it('l’accesso salva la nuova sessione', () => {
    const signedIn = session();
    expect(nextSession(null, 'SIGNED_IN', signedIn)).toBe(signedIn);
  });

  it('il rinnovo del token sostituisce la sessione', () => {
    const refreshed = session('enrico@example.com', 'access-2');
    expect(nextSession(session(), 'TOKEN_REFRESHED', refreshed)).toBe(refreshed);
  });

  it('l’uscita toglie la sessione', () => {
    expect(nextSession(session(), 'SIGNED_OUT', null)).toBeNull();
  });

  it('una sessione iniziale vuota non fa uscire chi ha una sessione salvata', () => {
    // Offline, con il token scaduto, supabase-js emette INITIAL_SESSION con null ma tiene
    // la sessione: resta dentro finché non arriva SIGNED_OUT.
    const stored = session();
    expect(nextSession(stored, 'INITIAL_SESSION', null)).toBe(stored);
  });

  it('nessun altro evento senza sessione fa uscire', () => {
    const stored = session();
    expect(nextSession(stored, 'USER_UPDATED', null)).toBe(stored);
    expect(nextSession(stored, 'TOKEN_REFRESHED', null)).toBe(stored);
  });

  it('senza sessione salvata una sessione iniziale vuota lascia fuori', () => {
    expect(nextSession(null, 'INITIAL_SESSION', null)).toBeNull();
  });
});
