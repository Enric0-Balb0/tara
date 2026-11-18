import { describe, expect, it } from 'vitest';

import { catalogReadyNotice, downloadProgress, searchStatus } from './searchStatus';

const base = { catalogSize: 3484, syncing: false };

describe('searchStatus', () => {
  it('mentre scarica il catalogo lo dice', () => {
    expect(
      searchStatus({ query: 'albume', results: null, catalogSize: 0, syncing: true }),
    ).toEqual({
      kind: 'downloading',
      message: 'Gli alimenti si stanno scaricando.',
    });
  });

  it('senza catalogo e senza connessione chiede di riprovare, anche con una ricerca valida', () => {
    expect(
      searchStatus({
        query: 'albume',
        results: { query: 'albume', count: 0 },
        catalogSize: 0,
        syncing: false,
      }),
    ).toEqual({
      kind: 'offline',
      message: 'Gli alimenti si scaricano con la connessione: collegati e riprova.',
    });
  });

  it('chiede almeno due lettere', () => {
    const hint = { kind: 'hint', message: 'Scrivi almeno due lettere, per esempio «albume».' };
    expect(searchStatus({ ...base, query: '', results: null })).toEqual(hint);
    expect(searchStatus({ ...base, query: ' a ', results: { query: ' a ', count: 0 } })).toEqual(
      hint,
    );
  });

  it("non dice niente finché non arrivano i risultati di questa ricerca", () => {
    expect(searchStatus({ ...base, query: 'al', results: { query: 'a', count: 0 } })).toEqual({
      kind: 'pending',
      message: null,
    });
    expect(searchStatus({ ...base, query: 'al', results: null })).toEqual({
      kind: 'pending',
      message: null,
    });
  });

  it('dice quando non trova niente, con la ricerca ripulita', () => {
    const query = '  zzz   qq ';
    expect(searchStatus({ ...base, query, results: { query, count: 0 } })).toEqual({
      kind: 'no-results',
      message: 'Nessun alimento per «zzz qq».',
    });
  });

  it('con dei risultati non dice niente', () => {
    expect(searchStatus({ ...base, query: 'albume', results: { query: 'albume', count: 2 } })).toEqual(
      { kind: 'results', message: null },
    );
  });
});

describe('downloadProgress', () => {
  it('prima di sapere qualcosa avvisa che il server può dormire', () => {
    const expected = {
      detail: 'Mi collego al server: se era fermo, si sveglia in circa un minuto.',
      fraction: null,
    };
    expect(downloadProgress(null)).toEqual(expected);
    expect(downloadProgress({ phase: 'connecting', attempt: 1, attempts: 6 })).toEqual(expected);
  });

  it('dai tentativi successivi dice quale tentativo è, senza inventare una percentuale', () => {
    expect(downloadProgress({ phase: 'connecting', attempt: 3, attempts: 6 })).toEqual({
      detail: 'Il server si sta svegliando: tentativo 3 di 6.',
      fraction: null,
    });
  });

  it('con la dimensione nota mostra i megabyte ricevuti e la frazione', () => {
    expect(
      downloadProgress({ phase: 'downloading', receivedBytes: 1_250_000, totalBytes: 5_000_000 }),
    ).toEqual({ detail: 'Ricevuti 1,3 di 5,0 MB.', fraction: 0.25 });
  });

  it('senza dimensione nota mostra solo i megabyte ricevuti', () => {
    expect(
      downloadProgress({ phase: 'downloading', receivedBytes: 2_340_000, totalBytes: null }),
    ).toEqual({ detail: 'Ricevuti 2,3 MB.', fraction: null });
  });

  it('una dimensione incoerente (compressa, più piccola del ricevuto) non dà una frazione', () => {
    expect(
      downloadProgress({ phase: 'downloading', receivedBytes: 900_000, totalBytes: 432_508 }),
    ).toEqual({ detail: 'Ricevuti 0,9 MB.', fraction: null });
    expect(
      downloadProgress({ phase: 'downloading', receivedBytes: 900_000, totalBytes: 0 }),
    ).toEqual({ detail: 'Ricevuti 0,9 MB.', fraction: null });
  });

  it('appena il server risponde, prima dei primi dati', () => {
    expect(
      downloadProgress({ phase: 'downloading', receivedBytes: 20_000, totalBytes: 5_000_000 }),
    ).toEqual({ detail: 'Il server risponde: ricevo gli alimenti.', fraction: 0.004 });
    expect(
      downloadProgress({ phase: 'downloading', receivedBytes: 0, totalBytes: null }),
    ).toEqual({ detail: 'Il server risponde: ricevo gli alimenti.', fraction: null });
  });

  it('mentre salva sul telefono', () => {
    expect(downloadProgress({ phase: 'saving' })).toEqual({
      detail: 'Salvo gli alimenti sul telefono.',
      fraction: null,
    });
  });
});

describe('catalogReadyNotice', () => {
  it('dice quanti alimenti sono pronti, senza separatore delle migliaia', () => {
    expect(catalogReadyNotice(3484)).toBe('Alimenti pronti: 3484.');
  });
});
