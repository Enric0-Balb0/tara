/**
 * Numeri all'italiana (docs/design.md, "Carattere"): virgola decimale, nessun separatore
 * delle migliaia fino a 9999. Un dato mancante non vale zero: si mostra come trattino.
 * Niente Intl: Hermes non garantisce i dati della lingua italiana.
 */

export const MISSING = '–';

const THOUSANDS = ' ';

export type AmountKind = 'grams' | 'kcal' | 'kj' | 'macro' | 'salt';

const DECIMALS: Record<AmountKind, number> = { grams: 0, kcal: 0, kj: 0, macro: 1, salt: 2 };

export function formatNumber(value: number | null, decimals: number): string {
  if (value === null) return MISSING;
  const factor = 10 ** decimals;
  // toPrecision toglie l'errore binario (54.55 * 10 = 545.4999…) prima di arrotondare.
  const rounded = Math.round(Number((value * factor).toPrecision(12))) / factor;
  const [integer = '0', fraction] = rounded.toFixed(decimals).split('.');
  const grouped =
    integer.replace('-', '').length > 4 ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS) : integer;
  return fraction === undefined ? grouped : `${grouped},${fraction}`;
}

export function formatAmount(value: number | null, kind: AmountKind): string {
  return formatNumber(value, DECIMALS[kind]);
}
