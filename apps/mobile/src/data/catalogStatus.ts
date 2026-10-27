/** Stato del catalogo in parole, per il menu Sviluppo del profilo. */

import { formatDate, formatNumber, formatTime } from '@/domain/format';

import type { CatalogInfo } from './catalogStore';
import type { SyncResult } from './catalogSync';

function when(iso: string): string {
  const date = new Date(iso);
  return `${formatDate(date)} alle ${formatTime(date)}`;
}

function title(info: CatalogInfo | null): string {
  if (info === null) return 'Catalogo';
  if (info.foodCount === 0) return 'Catalogo vuoto';
  return `${formatNumber(info.foodCount, 0)} ${info.foodCount === 1 ? 'alimento' : 'alimenti'}`;
}

function detail(info: CatalogInfo | null, last: SyncResult | null, syncing: boolean): string {
  if (syncing) return 'Controllo aggiornamenti…';
  if (last?.kind === 'failed') {
    switch (last.reason) {
      case 'offline':
        return (info?.foodCount ?? 0) > 0
          ? 'Server non raggiungibile: uso la copia sul telefono'
          : 'Server non raggiungibile: avvia il backend e riprova';
      case 'server':
        return 'Il server ha risposto con un errore';
      case 'invalid':
        return 'Catalogo ricevuto non valido: tengo quello di prima';
    }
  }
  if (last?.kind === 'unchanged' && info?.checkedAt) {
    return `Già aggiornato, controllato il ${when(info.checkedAt)}`;
  }
  if (info?.syncedAt) return `Scaricato il ${when(info.syncedAt)}`;
  return 'Mai scaricato';
}

export function describeCatalog(
  info: CatalogInfo | null,
  last: SyncResult | null,
  syncing: boolean,
): { title: string; detail: string } {
  return { title: title(info), detail: detail(info, last, syncing) };
}
