/**
 * Allinea il catalogo del telefono a `GET /v1/catalog`. Con l'ETag il server risponde 304
 * se non è cambiato nulla; se il server è spento o non risponde, l'app continua con la
 * copia che ha (uso offline, RNF-03).
 */

import { catalogInfo, markChecked, replaceCatalog } from './catalogStore';
import type { SqlDatabase } from './sql';

export type SyncResult =
  | { kind: 'updated'; version: string; foodCount: number }
  | { kind: 'unchanged' }
  | { kind: 'failed'; reason: 'offline' | 'server' | 'invalid' };

export interface SyncOptions {
  apiUrl: string;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  /** Oltre questo tempo, risposta compresa, il server conta come non raggiungibile. */
  timeoutMs?: number;
}

export async function syncCatalog(
  db: SqlDatabase,
  { apiUrl, fetch = globalThis.fetch, now = () => new Date(), timeoutMs = 30_000 }: SyncOptions,
): Promise<SyncResult> {
  const info = await catalogInfo(db);
  // Senza alimenti sul telefono un 304 non servirebbe a niente: si chiede tutto.
  const knownEtag = info.foodCount > 0 ? info.etag : null;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (knownEtag !== null) headers['If-None-Match'] = knownEtag;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let status: number;
  let etag: string | null;
  let body = '';
  try {
    const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/v1/catalog`, {
      headers,
      signal: controller.signal,
    });
    status = response.status;
    etag = response.headers.get('ETag');
    if (status === 200) body = await response.text();
  } catch {
    return { kind: 'failed', reason: 'offline' };
  } finally {
    clearTimeout(timer);
  }

  // Un 200 con lo stesso ETag (cache di iOS, proxy che ignora If-None-Match) vale un 304:
  // l'ETag del backend è la versione del catalogo.
  if (status === 304 || (status === 200 && knownEtag !== null && etag === knownEtag)) {
    await markChecked(db, now().toISOString());
    return { kind: 'unchanged' };
  }
  if (status !== 200) return { kind: 'failed', reason: 'server' };
  try {
    const { version, foodCount } = await replaceCatalog(db, body, {
      etag,
      syncedAt: now().toISOString(),
    });
    return { kind: 'updated', version, foodCount };
  } catch {
    return { kind: 'failed', reason: 'invalid' };
  }
}
