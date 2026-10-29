/** Cosa dire sotto la ricerca, quando non bastano i risultati. */

import { MIN_QUERY_LENGTH, searchKey } from './search';

export type SearchStatusKind = 'hint' | 'empty-catalog' | 'no-results' | 'results';

export function searchStatus(
  query: string,
  resultCount: number,
  catalogSize: number,
): { kind: SearchStatusKind; message: string | null } {
  // Prima di tutto: senza alimenti sul telefono "nessun risultato" sarebbe falso.
  if (catalogSize === 0) {
    return {
      kind: 'empty-catalog',
      message: 'Gli alimenti si scaricano al primo avvio con la connessione: riprova tra poco.',
    };
  }
  if (searchKey(query).length < MIN_QUERY_LENGTH) {
    return { kind: 'hint', message: 'Scrivi almeno due lettere, per esempio «albume».' };
  }
  if (resultCount === 0) {
    return {
      kind: 'no-results',
      message: `Nessun alimento per «${query.replace(/\s+/g, ' ').trim()}».`,
    };
  }
  return { kind: 'results', message: null };
}
