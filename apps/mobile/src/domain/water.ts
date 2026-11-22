/**
 * Acqua (RF-60, RF-61): quantità in ml, mostrate in litri; gli incrementi dei pulsanti sono
 * da uno a tre valori scelti dall'utente. Niente Intl: si usa formatNumber.
 */

import { formatNumber } from './format';
import { parseTargetInput } from './targets';

export const DEFAULT_INCREMENTS: readonly number[] = [250, 500];
export const MIN_INCREMENT = 50;
export const MAX_INCREMENT = 2000;
export const MAX_INCREMENTS = 3;

/** Litri come si dicono: "1,25", "0,5", "3"; al massimo due decimali, senza zeri in coda. */
export function formatLitres(ml: number): string {
  return formatNumber(ml / 1000, 2).replace(/,?0+$/, '');
}

/** "1,25 di 3 l" con il target del giorno, "1,25 l" senza. */
export function waterText(ml: number, target: number | null): string {
  return target === null
    ? `${formatLitres(ml)} l`
    : `${formatLitres(ml)} di ${formatLitres(target)} l`;
}

/** La frazione del target bevuta, tra 0 e 1; 0 senza target. */
export function waterFraction(ml: number, target: number | null): number {
  return target === null || target <= 0 ? 0 : Math.min(ml / target, 1);
}

/** Da uno a tre interi tra 50 e 2000 ml. */
export function validIncrements(values: readonly number[]): boolean {
  return (
    values.length >= 1 &&
    values.length <= MAX_INCREMENTS &&
    values.every(
      (value) => Number.isInteger(value) && value >= MIN_INCREMENT && value <= MAX_INCREMENT,
    )
  );
}

/**
 * I campi degli incrementi scritti a mano: i vuoti si saltano, il resto va ordinato e senza
 * doppioni. Undefined se un campo non è valido o non ne resta nessuno.
 */
export function parseIncrements(texts: readonly string[]): number[] | undefined {
  const values: number[] = [];
  for (const text of texts) {
    const parsed = parseTargetInput(text);
    if (parsed === undefined) return undefined;
    if (parsed !== null) values.push(parsed);
  }
  const unique = [...new Set(values)].sort((a, b) => a - b);
  return validIncrements(unique) ? unique : undefined;
}

/**
 * Il target dell'acqua scritto a mano: null se vuoto (non impostato), undefined se non è un
 * intero in ml maggiore di zero (i ml sono interi: niente decimali).
 */
export function parseWaterTarget(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value > 0 && value <= 99_999 ? value : undefined;
}
