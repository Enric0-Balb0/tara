/**
 * `GET /v1/me` dopo l'accesso: il backend verifica il token di Supabase e crea la riga
 * `app_user` se manca. Si chiama una volta, senza attendere: un fallimento non blocca
 * l'utente, la riga si crea alla prossima richiesta autenticata.
 */

export interface Me {
  id: string;
  email: string;
}

export type MeResult =
  | { kind: 'ok'; user: Me }
  | { kind: 'failed'; reason: 'offline' | 'unauthorized' | 'server' | 'invalid' };

export interface MeOptions {
  apiUrl: string;
  fetch?: typeof globalThis.fetch;
}

function isMe(value: unknown): value is Me {
  if (typeof value !== 'object' || value === null) return false;
  const { id, email } = value as Record<string, unknown>;
  return typeof id === 'string' && typeof email === 'string';
}

export async function registerMe(
  accessToken: string,
  { apiUrl, fetch = globalThis.fetch }: MeOptions,
): Promise<MeResult> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl.replace(/\/+$/, '')}/v1/me`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { kind: 'failed', reason: 'offline' };
  }
  if (response.status === 401) return { kind: 'failed', reason: 'unauthorized' };
  if (!response.ok) return { kind: 'failed', reason: 'server' };
  try {
    const body: unknown = await response.json();
    return isMe(body) ? { kind: 'ok', user: body } : { kind: 'failed', reason: 'invalid' };
  } catch {
    return { kind: 'failed', reason: 'invalid' };
  }
}
