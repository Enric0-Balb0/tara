import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CatalogProgress } from '@/domain/searchStatus';

import { catalogInfo, getFood } from './catalogStore';
import { FIRST_DOWNLOAD_TIMEOUT_MS, syncCatalog, WAKE_DELAYS_MS } from './catalogSync';
import { createRecipe } from './recipesStore';
import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
import { fakeXhr, split } from './testing/fakeXhr';
import { openTestDatabase } from './testing/nodeDatabase';
import { snapshotText, TEST_FOODS } from './testing/snapshot';

const FIRST = new Date('2026-10-27T15:00:00.000Z');
const LATER = new Date('2026-10-28T08:30:00.000Z');

type Reply = (init?: RequestInit) => Promise<Response>;

/** Server finto: risponde con le risposte date, in ordine, e registra le richieste. */
function server(...replies: Reply[]) {
  const requests: { url: string; headers: Headers }[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers) });
    const reply = replies.shift();
    if (!reply) throw new Error('richiesta inattesa');
    return reply(init);
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

const ok =
  (body: string, etag?: string): Reply =>
  async () =>
    new Response(body, { status: 200, headers: etag ? { ETag: etag } : {} });
const notModified: Reply = async () => new Response(null, { status: 304 });
const serverError: Reply = async () => new Response('errore', { status: 500 });
const waking: Reply = async () => new Response('', { status: 503 });
const networkDown: Reply = async () => {
  throw new TypeError('Network request failed');
};
const neverAnswers: Reply = (init) =>
  new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('Aborted', 'AbortError')),
    );
  });

let db: SqlDatabase;

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
});

function sync(fetch: typeof globalThis.fetch, now = FIRST, timeoutMs?: number) {
  return syncCatalog(db, { apiUrl: 'http://api.test', fetch, now: () => now, timeoutMs });
}

async function downloadFirstCatalog() {
  const { fetch } = server(ok(snapshotText(), '"v1"'));
  await sync(fetch);
  return catalogInfo(db);
}

describe('syncCatalog', () => {
  it('al primo avvio scarica il catalogo', async () => {
    const { fetch, requests } = server(ok(snapshotText(), '"v1"'));
    const result = await syncCatalog(db, {
      apiUrl: 'http://api.test/',
      fetch,
      now: () => FIRST,
    });
    expect(result).toEqual({ kind: 'updated', version: 'v1', foodCount: 3 });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('http://api.test/v1/catalog');
    expect(requests[0]?.headers.get('accept')).toBe('application/json');
    expect(requests[0]?.headers.get('if-none-match')).toBeNull();
    expect(await catalogInfo(db)).toMatchObject({
      foodCount: 3,
      etag: '"v1"',
      syncedAt: FIRST.toISOString(),
    });
  });

  it('con il catalogo già scaricato chiede solo se è cambiato', async () => {
    await downloadFirstCatalog();
    const { fetch, requests } = server(notModified);
    expect(await sync(fetch, LATER)).toEqual({ kind: 'unchanged' });
    expect(requests[0]?.headers.get('if-none-match')).toBe('"v1"');
    expect(await catalogInfo(db)).toMatchObject({
      foodCount: 3,
      syncedAt: FIRST.toISOString(),
      checkedAt: LATER.toISOString(),
    });
  });

  it('stessa versione con 200 non riscrive', async () => {
    await downloadFirstCatalog();
    const { fetch } = server(ok(snapshotText(), '"v1"'));
    expect(await sync(fetch, LATER)).toEqual({ kind: 'unchanged' });
    expect(await catalogInfo(db)).toMatchObject({
      syncedAt: FIRST.toISOString(),
      checkedAt: LATER.toISOString(),
    });
  });

  it('una versione nuova sostituisce il catalogo', async () => {
    await downloadFirstCatalog();
    const withoutCoffee = TEST_FOODS.filter((food) => food.id !== 'caffe-espresso');
    const { fetch } = server(ok(snapshotText(withoutCoffee, 'v2'), '"v2"'));
    expect(await sync(fetch, LATER)).toEqual({ kind: 'updated', version: 'v2', foodCount: 2 });
    expect(await catalogInfo(db)).toMatchObject({ version: 'v2', syncedAt: LATER.toISOString() });
  });

  it('con un catalogo nuovo ricalcola i valori delle ricette', async () => {
    await downloadFirstCatalog();
    const recipe = await createRecipe(
      db,
      'utente',
      {
        name: 'Frittata',
        yield: { mode: 'portions', portions: 1 },
        items: [{ foodId: 'albume-crudo', gramsRaw: 100 }],
      },
      FIRST,
    );
    const richer = TEST_FOODS.map((food) =>
      food.id === 'albume-crudo'
        ? {
            ...food,
            values: { ...food.values, energy_kcal: { ...food.values.energy_kcal!, amount: 60 } },
          }
        : food,
    );
    const { fetch } = server(ok(snapshotText(richer, 'v2'), '"v2"'));
    expect(await sync(fetch, LATER)).toMatchObject({ kind: 'updated' });
    const kcal = (await getFood(db, recipe))?.nutrients.find((n) => n.code === 'energy_kcal');
    expect(kcal?.amountPer100).toBe(60);
  });

  it('se il ricalcolo delle ricette fallisce la sincronizzazione riesce lo stesso', async () => {
    await downloadFirstCatalog();
    await db.execAsync('DROP TABLE recipe_item; DROP TABLE recipe');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { fetch } = server(ok(snapshotText(TEST_FOODS, 'v2'), '"v2"'));
    expect(await sync(fetch, LATER)).toMatchObject({ kind: 'updated', version: 'v2' });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('se il catalogo nuovo non ha più un ingrediente la ricetta tiene i valori di prima', async () => {
    await downloadFirstCatalog();
    const recipe = await createRecipe(
      db,
      'utente',
      {
        name: 'Frittata',
        yield: { mode: 'portions', portions: 1 },
        items: [{ foodId: 'albume-crudo', gramsRaw: 100 }],
      },
      FIRST,
    );
    const before = (await getFood(db, recipe))?.nutrients;
    const withoutEggWhite = TEST_FOODS.filter((food) => food.id !== 'albume-crudo');
    const { fetch } = server(ok(snapshotText(withoutEggWhite, 'v2'), '"v2"'));
    expect(await sync(fetch, LATER)).toMatchObject({ kind: 'updated', version: 'v2' });
    expect((await getFood(db, recipe))?.nutrients).toEqual(before);
    expect(before?.length).toBeGreaterThan(0);
  });

  it('server spento: offline e catalogo intatto', async () => {
    const before = await downloadFirstCatalog();
    const { fetch } = server(networkDown);
    expect(await sync(fetch, LATER)).toEqual({ kind: 'failed', reason: 'offline' });
    expect(await catalogInfo(db)).toEqual(before);
  });

  it('server che non risponde: offline dopo il timeout', async () => {
    const before = await downloadFirstCatalog();
    const { fetch } = server(neverAnswers);
    expect(await sync(fetch, LATER, 10)).toEqual({ kind: 'failed', reason: 'offline' });
    expect(await catalogInfo(db)).toEqual(before);
  });

  it('errore del server', async () => {
    const before = await downloadFirstCatalog();
    const { fetch } = server(serverError);
    expect(await sync(fetch, LATER)).toEqual({ kind: 'failed', reason: 'server' });
    expect(await catalogInfo(db)).toEqual(before);
  });

  it('corpo non valido: tiene il catalogo di prima', async () => {
    const before = await downloadFirstCatalog();
    const { fetch } = server(ok('<html>', '"v9"'));
    expect(await sync(fetch, LATER)).toEqual({ kind: 'failed', reason: 'invalid' });
    expect(await catalogInfo(db)).toEqual(before);
  });

  it('con il catalogo sul telefono non insiste: un solo tentativo', async () => {
    await downloadFirstCatalog();
    const waits: number[] = [];
    const { fetch, requests } = server(waking);
    expect(
      await syncCatalog(db, {
        apiUrl: 'http://api.test',
        fetch,
        now: () => LATER,
        wait: async (ms) => void waits.push(ms),
      }),
    ).toEqual({ kind: 'failed', reason: 'server' });
    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });
});

/** Il backend gratuito si spegne dopo 15 minuti e impiega circa un minuto a ripartire. */
describe('syncCatalog, primo download mentre il server si sveglia', () => {
  function firstDownload(fetch: typeof globalThis.fetch, waits: number[] = []) {
    return syncCatalog(db, {
      apiUrl: 'http://api.test',
      fetch,
      now: () => FIRST,
      wait: async (ms) => void waits.push(ms),
    });
  }

  it('riprova con attese crescenti finché il server risponde', async () => {
    const waits: number[] = [];
    const { fetch, requests } = server(waking, networkDown, ok(snapshotText(), '"v1"'));
    expect(await firstDownload(fetch, waits)).toEqual({
      kind: 'updated',
      version: 'v1',
      foodCount: 3,
    });
    expect(requests).toHaveLength(3);
    expect(waits).toEqual(WAKE_DELAYS_MS.slice(0, 2));
  });

  it("dopo l'ultima attesa si arrende", async () => {
    const waits: number[] = [];
    const { fetch, requests } = server(
      ...Array.from({ length: WAKE_DELAYS_MS.length + 1 }, () => networkDown),
    );
    expect(await firstDownload(fetch, waits)).toEqual({ kind: 'failed', reason: 'offline' });
    expect(requests).toHaveLength(WAKE_DELAYS_MS.length + 1);
    expect(waits).toEqual(WAKE_DELAYS_MS);
  });

  it('la prima richiesta aspetta il risveglio oltre i 30 s', async () => {
    vi.useFakeTimers();
    try {
      const { fetch, requests } = server(neverAnswers, ok(snapshotText(), '"v1"'));
      const pending = firstDownload(fetch);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(FIRST_DOWNLOAD_TIMEOUT_MS);
      expect(await pending).toMatchObject({ kind: 'updated', foodCount: 3 });
      expect(requests).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

const ATTEMPTS = WAKE_DELAYS_MS.length + 1;

/** Avanzamento: ogni fase riportata, nell'ordine, insieme alle attese tra i tentativi. */
describe('syncCatalog, avanzamento', () => {
  function recorder() {
    const log: (CatalogProgress | { wait: number })[] = [];
    return {
      log,
      onProgress: (progress: CatalogProgress) => void log.push(progress),
      wait: async (ms: number) => void log.push({ wait: ms }),
    };
  }

  it('al primo download: collegamento, download, salvataggio', async () => {
    const { log, onProgress, wait } = recorder();
    const { fetch } = server(ok(snapshotText(), '"v1"'));
    await syncCatalog(db, { apiUrl: 'http://api.test', fetch, now: () => FIRST, wait, onProgress });
    expect(log).toEqual([
      { phase: 'connecting', attempt: 1, attempts: ATTEMPTS },
      { phase: 'downloading', receivedBytes: 0, totalBytes: null },
      { phase: 'saving' },
    ]);
  });

  it("con fetch usa la dimensione dichiarata, se c'è", async () => {
    const { log, onProgress, wait } = recorder();
    const body = snapshotText();
    const fetch = (async () =>
      new Response(body, {
        status: 200,
        headers: { ETag: '"v1"', 'Content-Length': String(body.length) },
      })) as typeof globalThis.fetch;
    await syncCatalog(db, { apiUrl: 'http://api.test', fetch, now: () => FIRST, wait, onProgress });
    expect(log[1]).toEqual({ phase: 'downloading', receivedBytes: 0, totalBytes: body.length });
  });

  it('mentre il server si sveglia dice il tentativo prima di ogni attesa', async () => {
    const { log, onProgress, wait } = recorder();
    const { fetch } = server(waking, networkDown, ok(snapshotText(), '"v1"'));
    await syncCatalog(db, { apiUrl: 'http://api.test', fetch, now: () => FIRST, wait, onProgress });
    expect(log).toEqual([
      { phase: 'connecting', attempt: 1, attempts: ATTEMPTS },
      { phase: 'connecting', attempt: 2, attempts: ATTEMPTS },
      { wait: WAKE_DELAYS_MS[0] },
      { phase: 'connecting', attempt: 3, attempts: ATTEMPTS },
      { wait: WAKE_DELAYS_MS[1] },
      { phase: 'downloading', receivedBytes: 0, totalBytes: null },
      { phase: 'saving' },
    ]);
  });

  it('con il catalogo sul telefono un solo tentativo e, se non cambia, niente salvataggio', async () => {
    await downloadFirstCatalog();
    const { log, onProgress, wait } = recorder();
    const { fetch } = server(notModified);
    await syncCatalog(db, { apiUrl: 'http://api.test', fetch, now: () => LATER, wait, onProgress });
    expect(log).toEqual([{ phase: 'connecting', attempt: 1, attempts: 1 }]);
  });
});

/** In React Native fetch non dice quanti byte sono arrivati: XMLHttpRequest sì. */
describe('syncCatalog con XMLHttpRequest', () => {
  function xhrSync(
    XMLHttpRequest: ReturnType<typeof fakeXhr>['XMLHttpRequest'],
    timeoutMs?: number,
  ) {
    const log: CatalogProgress[] = [];
    const result = syncCatalog(db, {
      apiUrl: 'http://api.test/',
      XMLHttpRequest,
      now: () => FIRST,
      timeoutMs,
      wait: async () => undefined,
      onProgress: (progress) => void log.push(progress),
    });
    return { result, log };
  }

  it('riporta i byte ricevuti e il totale dichiarato', async () => {
    const body = snapshotText();
    const bytes = new TextEncoder().encode(body).length;
    const { XMLHttpRequest, requests } = fakeXhr({
      status: 200,
      headers: { ETag: '"v1"', 'Content-Length': String(bytes) },
      chunks: split(body, 3),
      total: bytes,
    });
    const { result, log } = xhrSync(XMLHttpRequest);
    expect(await result).toEqual({ kind: 'updated', version: 'v1', foodCount: 3 });
    expect(requests).toEqual([
      { method: 'GET', url: 'http://api.test/v1/catalog', headers: { accept: 'application/json' } },
    ]);
    const downloads = log.flatMap((p) => (p.phase === 'downloading' ? [p] : []));
    expect(downloads[0]).toEqual({ phase: 'downloading', receivedBytes: 0, totalBytes: bytes });
    expect(downloads.map((p) => p.totalBytes)).toEqual([bytes, bytes, bytes, bytes]);
    const received = downloads.map((p) => p.receivedBytes);
    expect(received.at(-1)).toBe(bytes);
    expect([...received].sort((a, b) => a - b)).toEqual(received);
    expect(log.at(-1)).toEqual({ phase: 'saving' });
    expect(await catalogInfo(db)).toMatchObject({ foodCount: 3, etag: '"v1"' });
  });

  it('senza totale dichiarato lo lascia ignoto', async () => {
    const { XMLHttpRequest } = fakeXhr({
      status: 200,
      headers: { ETag: '"v1"' },
      chunks: split(snapshotText(), 2),
      total: null,
    });
    const { result, log } = xhrSync(XMLHttpRequest);
    expect(await result).toMatchObject({ kind: 'updated' });
    const downloads = log.flatMap((p) => (p.phase === 'downloading' ? [p] : []));
    expect(downloads).toHaveLength(3);
    expect(downloads.every((p) => p.totalBytes === null)).toBe(true);
  });

  it('chiede solo se è cambiato e accetta il 304', async () => {
    await downloadFirstCatalog();
    const { XMLHttpRequest, requests } = fakeXhr({ status: 304 });
    const { result, log } = xhrSync(XMLHttpRequest);
    expect(await result).toEqual({ kind: 'unchanged' });
    expect(requests[0]?.headers['if-none-match']).toBe('"v1"');
    expect(log).toEqual([{ phase: 'connecting', attempt: 1, attempts: 1 }]);
  });

  it('errore di rete: offline', async () => {
    await downloadFirstCatalog();
    const { XMLHttpRequest } = fakeXhr('network-error');
    expect(await xhrSync(XMLHttpRequest).result).toEqual({ kind: 'failed', reason: 'offline' });
  });

  it('server che non risponde: offline dopo il timeout', async () => {
    await downloadFirstCatalog();
    const { XMLHttpRequest } = fakeXhr('hang');
    expect(await xhrSync(XMLHttpRequest, 10).result).toEqual({
      kind: 'failed',
      reason: 'offline',
    });
  });

  it('errore del server: nessun download riportato', async () => {
    await downloadFirstCatalog();
    const { XMLHttpRequest } = fakeXhr({ status: 503, chunks: ['sveglia'] });
    const { result, log } = xhrSync(XMLHttpRequest);
    expect(await result).toEqual({ kind: 'failed', reason: 'server' });
    expect(log.some((p) => p.phase === 'downloading')).toBe(false);
  });
});
