/**
 * Tipi di giornata e target (RF-50, RF-51, RF-53): ogni tipo ha una storia di target, ognuno
 * valido da una data; un giorno si confronta con il target in vigore quel giorno, così
 * cambiare un target non riscrive le giornate passate.
 */

import { type AmountKind, formatAmount, formatNumber } from './format';
import { checkDeclaredKcal } from './nutrition';

/** I tipi creati la prima volta; nomi, numero e target li sceglie l'utente nel Piano. */
export const DEFAULT_DAY_TYPES: readonly string[] = ['Allenamento', 'Riposo'];

/** Il target in vigore in una data "AAAA-MM-GG": quello con la data di inizio più recente. */
export function targetFor<T extends { validFrom: string }>(
  history: readonly T[],
  date: string,
): T | undefined {
  let best: T | undefined;
  for (const target of history) {
    if (target.validFrom <= date && (best === undefined || target.validFrom > best.validFrom)) {
      best = target;
    }
  }
  return best;
}

/** I valori di un target; null = non impostato (mai zero per "non so"). */
export interface MacroTargets {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

const MAX_TARGET = 99_999;

/**
 * Un campo del target scritto a mano: null se vuoto, undefined se non è un numero valido.
 * Accetta la virgola decimale, come si scrive in italiano.
 */
export function parseTargetInput(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+([.,]\d+)?$/.test(trimmed)) return undefined;
  // Un decimale, come lo mostra il campo: un valore più preciso tornerebbe diverso.
  const value = Math.round(Number(trimmed.replace(',', '.')) * 10) / 10;
  return value > MAX_TARGET ? undefined : value;
}

export function formatTargetInput(value: number | null): string {
  if (value === null) return '';
  return Number.isInteger(value) ? String(value) : formatNumber(value, 1);
}

/**
 * Un valore contro il suo target come si scrive negli obiettivi di Oggi: il registrato in
 * evidenza e il resto accanto, "**49** / 240", "**1478** / 4800 kcal", "**1,25** / 3 l".
 * Senza target "/ –" (un target mancante non vale zero); con `unit` e target null solo l'unità.
 */
export function goalFigures(
  logged: string,
  target: string | null,
  unit = '',
  missing: 'dash' | 'omit' = 'dash',
): { value: string; rest: string } {
  const suffix = unit === '' ? '' : ` ${unit}`;
  if (target === null) return { value: logged, rest: missing === 'dash' ? ' / –' : suffix };
  return { value: logged, rest: ` / ${target}${suffix}` };
}

/** Quanto manca al target; negativo se superato, null senza target. */
export function remaining(target: number | null, logged: number): number | null {
  return target === null ? null : target - logged;
}

/** "mancano 1350" o "oltre di 20"; null senza target. */
export function remainingText(left: number | null, kind: AmountKind): string | null {
  if (left === null) return null;
  return left >= 0
    ? `mancano ${formatAmount(left, kind)}`
    : `oltre di ${formatAmount(-left, kind)}`;
}

/**
 * Le kcal che fanno i macro del target, se si discostano oltre il 10% dalle kcal scritte:
 * un aiuto per accorgersi di un numero sbagliato. Null se tornano o se manca un valore.
 */
export function macroKcalCheck(target: MacroTargets): number | null {
  const { kcal, protein_g, carbs_g, fat_g } = target;
  if (kcal === null || protein_g === null || carbs_g === null || fat_g === null) return null;
  const check = checkDeclaredKcal(kcal, { proteinG: protein_g, carbsG: carbs_g, fatG: fat_g });
  return check.ok ? null : Math.round(check.expectedKcal);
}
