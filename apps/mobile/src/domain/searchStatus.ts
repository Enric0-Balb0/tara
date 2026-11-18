/** Cosa dire sotto la ricerca, quando non bastano i risultati. */

import { formatNumber } from './format';
import { MIN_QUERY_LENGTH, searchKey } from './search';

/**
 * A che punto è il primo download degli alimenti, come lo riporta la sincronizzazione:
 * solo fatti misurati (tentativo, byte ricevuti), mai una stima basata sul tempo.
 */
export type CatalogProgress =
  | { phase: 'connecting'; attempt: number; attempts: number }
  /** totalBytes è null quando il server non lo dice (risposta compressa, a pezzi). */
  | { phase: 'downloading'; receivedBytes: number; totalBytes: number | null }
  | { phase: 'saving' };

const MEGABYTE = 1_000_000;
/** Sotto questa soglia i megabyte si leggerebbero "0,0": si dice solo che i dati arrivano. */
const FIRST_DATA_BYTES = 50_000;

const megabytes = (bytes: number) => formatNumber(bytes / MEGABYTE, 1);

/** La fase del download in parole e, solo se si conosce davvero, la frazione completata. */
export function downloadProgress(progress: CatalogProgress | null): {
  detail: string;
  fraction: number | null;
} {
  if (progress === null || (progress.phase === 'connecting' && progress.attempt <= 1)) {
    return {
      detail: 'Mi collego al server: se era fermo, si sveglia in circa un minuto.',
      fraction: null,
    };
  }
  if (progress.phase === 'connecting') {
    return {
      detail: `Il server si sta svegliando: tentativo ${progress.attempt} di ${progress.attempts}.`,
      fraction: null,
    };
  }
  if (progress.phase === 'saving') {
    return { detail: 'Salvo gli alimenti sul telefono.', fraction: null };
  }
  const { receivedBytes, totalBytes } = progress;
  // Con la compressione il totale dichiarato può essere più piccolo di quanto arriva:
  // in quel caso non vale come totale.
  const total =
    totalBytes !== null && totalBytes > 0 && receivedBytes <= totalBytes ? totalBytes : null;
  const fraction = total === null ? null : receivedBytes / total;
  if (receivedBytes < FIRST_DATA_BYTES) {
    return { detail: 'Il server risponde: ricevo gli alimenti.', fraction };
  }
  return {
    detail:
      total === null
        ? `Ricevuti ${megabytes(receivedBytes)} MB.`
        : `Ricevuti ${megabytes(receivedBytes)} di ${megabytes(total)} MB.`,
    fraction,
  };
}

/** L'avviso quando il primo download finisce. */
export function catalogReadyNotice(foodCount: number): string {
  return `Alimenti pronti: ${formatNumber(foodCount, 0)}.`;
}

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
          message: 'Gli alimenti si stanno scaricando.',
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
