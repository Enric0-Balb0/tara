import { describe, expect, it } from 'vitest';

import { registerMe } from './me';

type Reply = () => Promise<Response>;

/** Server finto: una risposta, e la richiesta registrata per i controlli. */
function server(reply: Reply) {
  const requests: { url: string; headers: Headers; method: string }[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      method: init?.method ?? 'GET',
    });
    return reply();
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

const json =
  (status: number, body: unknown): Reply =>
  async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

describe('registerMe', () => {
  it('chiama GET /v1/me con il token e restituisce l’utente', async () => {
    const { fetch, requests } = server(json(200, { id: 'u-1', email: 'enrico@example.com' }));

    const result = await registerMe('token-abc', { apiUrl: 'http://api.test/', fetch });

    expect(result).toEqual({ kind: 'ok', user: { id: 'u-1', email: 'enrico@example.com' } });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('http://api.test/v1/me');
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer token-abc');
  });

  it('con 401 dice che il token non è stato accettato', async () => {
    const { fetch } = server(json(401, { detail: 'Not authenticated' }));

    const result = await registerMe('scaduto', { apiUrl: 'http://api.test', fetch });

    expect(result).toEqual({ kind: 'failed', reason: 'unauthorized' });
  });

  it('senza rete non lancia: restituisce offline', async () => {
    const { fetch } = server(async () => {
      throw new TypeError('Network request failed');
    });

    const result = await registerMe('token', { apiUrl: 'http://api.test', fetch });

    expect(result).toEqual({ kind: 'failed', reason: 'offline' });
  });

  it('con un errore del server restituisce server', async () => {
    const { fetch } = server(json(503, { detail: 'waking up' }));

    const result = await registerMe('token', { apiUrl: 'http://api.test', fetch });

    expect(result).toEqual({ kind: 'failed', reason: 'server' });
  });

  it('con una risposta senza id o email restituisce invalid', async () => {
    const { fetch } = server(json(200, { id: 42 }));

    const result = await registerMe('token', { apiUrl: 'http://api.test', fetch });

    expect(result).toEqual({ kind: 'failed', reason: 'invalid' });
  });

  it('con un corpo JSON che non è un oggetto restituisce invalid', async () => {
    const { fetch } = server(json(200, null));

    const result = await registerMe('token', { apiUrl: 'http://api.test', fetch });

    expect(result).toEqual({ kind: 'failed', reason: 'invalid' });
  });

  it('con un corpo che non è JSON restituisce invalid', async () => {
    const { fetch } = server(async () => new Response('<html>', { status: 200 }));

    const result = await registerMe('token', { apiUrl: 'http://api.test', fetch });

    expect(result).toEqual({ kind: 'failed', reason: 'invalid' });
  });
});
