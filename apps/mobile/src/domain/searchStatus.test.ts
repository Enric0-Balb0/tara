import { describe, expect, it } from 'vitest';

import { searchStatus } from './searchStatus';

const base = { catalogSize: 3484, syncing: false };

describe('searchStatus', () => {
  it('mentre scarica il catalogo lo dice', () => {
    expect(
      searchStatus({ query: 'albume', results: null, catalogSize: 0, syncing: true }),
    ).toEqual({
      kind: 'downloading',
      message: 'Gli alimenti si stanno scaricando: la prima volta può volerci un minuto.',
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
