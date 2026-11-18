/**
 * Allinea il catalogo del telefono a `GET /v1/catalog`. Con l'ETag il server risponde 304
 * se non è cambiato nulla; se il server è spento o non risponde, l'app continua con la
 * copia che ha (uso offline, RNF-03).
 *
 * Il backend gratuito si spegne dopo 15 minuti senza richieste e impiega circa un minuto a
 * ripartire. Con il catalogo sul telefono basta un tentativo: si riprova al prossimo avvio.
 * Senza catalogo l'app non ha alimenti, quindi aspetta il risveglio e riprova.
 *
 * Intanto riporta a che punto è (tentativo, byte ricevuti, salvataggio): solo fatti
 * misurati, mai una percentuale stimata dal tempo.
 */

import type { CatalogProgress } from '@/domain/searchStatus';

import { catalogInfo, markChecked, replaceCatalog } from './catalogStore';
import type { SqlDatabase } from './sql';

export type SyncResult =
  | { kind: 'updated'; version: string; foodCount: number }
  | { kind: 'unchanged' }
  | { kind: 'failed'; reason: 'offline' | 'server' | 'invalid' };

/** Attese tra un tentativo e l'altro al primo download: in tutto circa un minuto. */
export const WAKE_DELAYS_MS = [3_000, 5_000, 10_000, 15_000, 30_000];
/** La prima richiesta al server addormentato dura quanto il suo risveglio. */
export const FIRST_DOWNLOAD_TIMEOUT_MS = 90_000;

export interface XhrProgressEvent {
  loaded: number;
  total: number;
  lengthComputable: boolean;
}

/** La parte di XMLHttpRequest che serve qui, uguale in React Native e nei browser. */
export interface XhrLike {
  readonly status: number;
  readonly readyState: number;
  readonly responseText: string;
  onreadystatechange: (() => void) | null;
  onprogress: ((event: XhrProgressEvent) => void) | null;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  getResponseHeader(name: string): string | null;
  send(): void;
  abort(): void;
}
export type XhrConstructor = new () => XhrLike;

export interface SyncOptions {
  apiUrl: string;
  /** Con fetch si sa quando arriva la risposta, non quanti byte: serve ai test e al web. */
  fetch?: typeof globalThis.fetch;
  /** Predefinito dove esiste e fetch non è dato (React Native): riporta i byte ricevuti. */
  XMLHttpRequest?: XhrConstructor;
  now?: () => Date;
  /** Oltre questo tempo, risposta compresa, il server conta come non raggiungibile. */
  timeoutMs?: number;
  wait?: (ms: number) => Promise<void>;
  /** A che punto è: tentativo, byte ricevuti, salvataggio. */
  onProgress?: (progress: CatalogProgress) => void;
}

type Report = (progress: CatalogProgress) => void;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function syncCatalog(
  db: SqlDatabase,
  { wait = sleep, onProgress = () => undefined, fetch, XMLHttpRequest, ...options }: SyncOptions,
): Promise<SyncResult> {
  const download = transport(fetch, XMLHttpRequest);
  const { foodCount } = await catalogInfo(db);
  if (foodCount > 0) {
    onProgress({ phase: 'connecting', attempt: 1, attempts: 1 });
    return attempt(db, download, onProgress, options);
  }

  const attempts = WAKE_DELAYS_MS.length + 1;
  onProgress({ phase: 'connecting', attempt: 1, attempts });
  let result = await attempt(db, download, onProgress, {
    ...options,
    timeoutMs: FIRST_DOWNLOAD_TIMEOUT_MS,
  });
  for (const [index, delay] of WAKE_DELAYS_MS.entries()) {
    if (result.kind !== 'failed') return result;
    // Il tentativo si dice prima dell'attesa, così anche l'attesa ha un nome.
    onProgress({ phase: 'connecting', attempt: index + 2, attempts });
    await wait(delay);
    result = await attempt(db, download, onProgress, options);
  }
  return result;
}

interface Reply {
  status: number;
  etag: string | null;
  body: string;
}

/** Scarica l'URL; onBytes solo per una risposta 200, da quando arrivano le intestazioni. */
type Download = (
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  onBytes: (receivedBytes: number, totalBytes: number | null) => void,
) => Promise<Reply>;

function declaredLength(value: string | null): number | null {
  const length = Number(value ?? NaN);
  return Number.isInteger(length) && length > 0 ? length : null;
}

function transport(
  fetch: typeof globalThis.fetch | undefined,
  Xhr: XhrConstructor | undefined = (globalThis as { XMLHttpRequest?: XhrConstructor })
    .XMLHttpRequest,
): Download {
  if (fetch === undefined && Xhr !== undefined) return xhrDownload(Xhr);
  return fetchDownload(fetch ?? globalThis.fetch);
}

function fetchDownload(fetch: typeof globalThis.fetch): Download {
  return async (url, headers, signal, onBytes) => {
    const response = await fetch(url, { headers, signal });
    const etag = response.headers.get('ETag');
    if (response.status !== 200) return { status: response.status, etag, body: '' };
    onBytes(0, declaredLength(response.headers.get('Content-Length')));
    return { status: 200, etag, body: await response.text() };
  };
}

/** HEADERS_RECEIVED: lo stato e le intestazioni ci sono, il corpo non ancora. */
const HEADERS_RECEIVED = 2;

function xhrDownload(Xhr: XhrConstructor): Download {
  return (url, headers, signal, onBytes) =>
    new Promise((resolve, reject) => {
      const xhr = new Xhr();
      let declared: number | null = null;
      xhr.open('GET', url);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      xhr.onreadystatechange = () => {
        if (xhr.readyState !== HEADERS_RECEIVED || xhr.status !== 200) return;
        declared = declaredLength(xhr.getResponseHeader('Content-Length'));
        onBytes(0, declared);
      };
      // Va assegnato prima di send: React Native manda i progressi solo a chi li ascolta.
      xhr.onprogress = (event) => {
        if (xhr.status !== 200) return;
        onBytes(event.loaded, event.lengthComputable && event.total > 0 ? event.total : declared);
      };
      xhr.onload = () =>
        resolve({
          status: xhr.status,
          etag: xhr.getResponseHeader('ETag'),
          body: xhr.status === 200 ? xhr.responseText : '',
        });
      xhr.onerror = () => reject(new Error('Rete non raggiungibile'));
      xhr.onabort = () => reject(new Error('Richiesta interrotta'));
      signal.addEventListener('abort', () => xhr.abort());
      xhr.send();
    });
}

async function attempt(
  db: SqlDatabase,
  download: Download,
  onProgress: Report,
  {
    apiUrl,
    now = () => new Date(),
    timeoutMs = 30_000,
  }: Pick<SyncOptions, 'apiUrl' | 'now' | 'timeoutMs'>,
): Promise<SyncResult> {
  const info = await catalogInfo(db);
  // Senza alimenti sul telefono un 304 non servirebbe a niente: si chiede tutto.
  const knownEtag = info.foodCount > 0 ? info.etag : null;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (knownEtag !== null) headers['If-None-Match'] = knownEtag;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reply: Reply;
  try {
    reply = await download(
      `${apiUrl.replace(/\/+$/, '')}/v1/catalog`,
      headers,
      controller.signal,
      (receivedBytes, totalBytes) =>
        onProgress({ phase: 'downloading', receivedBytes, totalBytes }),
    );
  } catch {
    return { kind: 'failed', reason: 'offline' };
  } finally {
    clearTimeout(timer);
  }
  const { status, etag, body } = reply;

  // Un 200 con lo stesso ETag (cache di iOS, proxy che ignora If-None-Match) vale un 304:
  // l'ETag del backend è la versione del catalogo.
  if (status === 304 || (status === 200 && knownEtag !== null && etag === knownEtag)) {
    await markChecked(db, now().toISOString());
    return { kind: 'unchanged' };
  }
  if (status !== 200) return { kind: 'failed', reason: 'server' };
  onProgress({ phase: 'saving' });
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
