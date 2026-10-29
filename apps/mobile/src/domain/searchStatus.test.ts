import { describe, expect, it } from 'vitest';

import { searchStatus } from './searchStatus';

describe('searchStatus', () => {
  it('senza catalogo lo dice, anche con una ricerca valida', () => {
    expect(searchStatus('albume', 0, 0)).toEqual({
      kind: 'empty-catalog',
      message: 'Gli alimenti si scaricano al primo avvio con la connessione: riprova tra poco.',
    });
  });

  it('chiede almeno due lettere', () => {
    const hint = {
      kind: 'hint',
      message: 'Scrivi almeno due lettere, per esempio «albume».',
    };
    expect(searchStatus('', 0, 3484)).toEqual(hint);
    expect(searchStatus(' a ', 0, 3484)).toEqual(hint);
  });

  it('dice quando non trova niente, con la ricerca ripulita', () => {
    expect(searchStatus('  zzz   qq ', 0, 3484)).toEqual({
      kind: 'no-results',
      message: 'Nessun alimento per «zzz qq».',
    });
  });

  it('con dei risultati non dice niente', () => {
    expect(searchStatus('albume', 2, 3484)).toEqual({ kind: 'results', message: null });
  });
});
