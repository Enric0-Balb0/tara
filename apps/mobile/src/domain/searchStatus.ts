/** Cosa dire sotto la ricerca, quando non bastano i risultati. */

import { MIN_QUERY_LENGTH, searchKey } from './search';

export type SearchStatusKind =
  | 'downloading'
  | 'offline'
  | 'hint'
  | 'pending'
  | 'no-results'
  | 'results';

export interface SearchStatusInput {
  query: string;
  /** Ultimi risultati arrivati e la ricerca a cui rispondono; null prima della prima. */
  results: { query: string; count: number } | null;
  catalogSize: number;
  syncing: boolean;
}

export function searchStatus({
  query,
  results,
  catalogSize,
  syncing,
}: SearchStatusInput): { kind: SearchStatusKind; message: string | null } {
  // Prima di tutto: senza alimenti sul telefono "nessun risultato" sarebbe falso.
  if (catalogSize === 0) {
    return syncing
      ? {
          kind: 'downloading',
          message: 'Gli alimenti si stanno scaricando: la prima volta può volerci un minuto.',
        }
      : {
          kind: 'offline',
          message: 'Gli alimenti si scaricano con la connessione: collegati e riprova.',
        };
  }
  if (searchKey(query).length < MIN_QUERY_LENGTH) {
    return { kind: 'hint', message: 'Scrivi almeno due lettere, per esempio «albume».' };
  }
  // I risultati di una ricerca precedente non dicono niente su questa: niente messaggi
  // finché non arrivano, così "Nessun alimento" non lampeggia mentre si digita.
  if (results === null || results.query !== query) return { kind: 'pending', message: null };
  if (results.count === 0) {
    return {
      kind: 'no-results',
      message: `Nessun alimento per «${query.replace(/\s+/g, ' ').trim()}».`,
    };
  }
  return { kind: 'results', message: null };
}
