/**
 * Sessione di Supabase Auth che decide se l'app è aperta (RNF-04). Conta la sessione
 * salvata sul telefono, non la sua validità in questo momento: offline, con il token
 * scaduto, supabase-js tiene la sessione ma `getSession()` e `INITIAL_SESSION` danno null.
 * Si esce solo con l'evento SIGNED_OUT, cioè con "Esci" o un rinnovo rifiutato dal server.
 */
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

/** Sessione salvata da supabase-js (JSON nel localStorage), o null se manca o è rovinata. */
export function readStoredSession(raw: string | null): Session | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { access_token, refresh_token, user } = value as Record<string, unknown>;
  if (typeof access_token !== 'string' || typeof refresh_token !== 'string') return null;
  if (typeof user !== 'object' || user === null) return null;
  return value as Session;
}

/** Sessione dopo un evento di `onAuthStateChange`. */
export function nextSession(
  current: Session | null,
  event: AuthChangeEvent,
  session: Session | null,
): Session | null {
  if (event === 'SIGNED_OUT') return null;
  return session ?? current;
}
