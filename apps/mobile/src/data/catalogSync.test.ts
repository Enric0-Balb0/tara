import { beforeEach, describe, expect, it, vi } from 'vitest';

import { catalogInfo } from './catalogStore';
import { FIRST_DOWNLOAD_TIMEOUT_MS, syncCatalog, WAKE_DELAYS_MS } from './catalogSync';
import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
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
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
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
