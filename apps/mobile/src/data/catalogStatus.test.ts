import { describe, expect, it } from 'vitest';

import type { CatalogInfo } from './catalogStore';
import { describeCatalog } from './catalogStatus';

const SYNCED = new Date(2026, 9, 27, 15, 42).toISOString();
const CHECKED = new Date(2026, 9, 28, 8, 5).toISOString();

const downloaded: CatalogInfo = {
  foodCount: 3484,
  version: 'v1',
  etag: '"v1"',
  syncedAt: SYNCED,
  checkedAt: CHECKED,
};
const empty: CatalogInfo = {
  foodCount: 0,
  version: null,
  etag: null,
  syncedAt: null,
  checkedAt: null,
};

describe('describeCatalog', () => {
  it('conta gli alimenti', () => {
    expect(describeCatalog(downloaded, null, false).title).toBe('3484 alimenti');
    expect(describeCatalog({ ...downloaded, foodCount: 1 }, null, false).title).toBe('1 alimento');
    expect(describeCatalog(empty, null, false).title).toBe('Catalogo vuoto');
    expect(describeCatalog(null, null, true).title).toBe('Catalogo');
  });

  it('mentre controlla lo dice', () => {
    expect(describeCatalog(downloaded, { kind: 'unchanged' }, true).detail).toBe(
      'Controllo aggiornamenti…',
    );
  });

  it('senza server usa la copia sul telefono', () => {
    const offline = { kind: 'failed', reason: 'offline' } as const;
    expect(describeCatalog(downloaded, offline, false).detail).toBe(
      'Server non raggiungibile: uso la copia sul telefono',
    );
    expect(describeCatalog(empty, offline, false).detail).toBe(
      'Server non raggiungibile: avvia il backend e riprova',
    );
  });

  it('distingue errore del server e catalogo non valido', () => {
    expect(describeCatalog(downloaded, { kind: 'failed', reason: 'server' }, false).detail).toBe(
      'Il server ha risposto con un errore',
    );
    expect(describeCatalog(downloaded, { kind: 'failed', reason: 'invalid' }, false).detail).toBe(
      'Catalogo ricevuto non valido: tengo quello di prima',
    );
  });

  it("già aggiornato dice quando l'ha controllato", () => {
    expect(describeCatalog(downloaded, { kind: 'unchanged' }, false).detail).toBe(
      'Già aggiornato, controllato il 28/10/2026 alle 08:05',
    );
  });

  it('dopo un download dice quando', () => {
    const updated = { kind: 'updated', version: 'v1', foodCount: 3484 } as const;
    expect(describeCatalog(downloaded, updated, false).detail).toBe(
      'Scaricato il 27/10/2026 alle 15:42',
    );
    expect(describeCatalog(downloaded, null, false).detail).toBe(
      'Scaricato il 27/10/2026 alle 15:42',
    );
  });

  it('senza download non ha date', () => {
    expect(describeCatalog(empty, null, false).detail).toBe('Mai scaricato');
    expect(describeCatalog(null, null, false).detail).toBe('Mai scaricato');
  });
});
