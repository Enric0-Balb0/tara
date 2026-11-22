/**
 * Valori di una ricetta (RF-20, RF-21): somma degli ingredienti a crudo, riportata al peso
 * finale. Un nutriente entra solo se ce l'hanno tutti gli ingredienti: un dato mancante non
 * vale zero (principio 2).
 */

import { formatAmount } from './format';

export interface RecipeItemValues {
  /** Grammi a crudo nella ricetta. */
  grams: number;
  /** Valori per 100 g dell'ingrediente, per codice; un nutriente ignoto è assente. */
  per100: Readonly<Record<string, number | undefined>>;
}

export type RecipeYield =
  { mode: 'portions'; portions: number } | { mode: 'weight'; cookedWeightG: number };

export interface RecipeResult {
  /** Peso finale: quello cotto in modalità peso, la somma dei crudi in modalità porzioni. */
  totalWeightG: number;
  /** Grammi di una porzione; null in modalità peso. */
  servingG: number | null;
  per100: Record<string, number>;
  /** Per una porzione; null in modalità peso. */
  perServing: Record<string, number> | null;
}

export function recipeValues(
  items: readonly RecipeItemValues[],
  recipeYield: RecipeYield,
): RecipeResult {
  const portions = recipeYield.mode === 'portions' ? recipeYield.portions : null;
  if (items.length === 0) {
    return {
      totalWeightG: 0,
      servingG: portions === null ? null : 0,
      per100: {},
      perServing: portions === null ? null : {},
    };
  }
  const rawWeight = items.reduce((sum, item) => sum + item.grams, 0);
  const totalWeightG = recipeYield.mode === 'weight' ? recipeYield.cookedWeightG : rawWeight;

  const codes = new Set(items.flatMap((item) => Object.keys(item.per100)));
  const per100: Record<string, number> = {};
  for (const code of codes) {
    let total = 0;
    let complete = true;
    for (const item of items) {
      const amount = item.per100[code];
      if (amount === undefined) {
        complete = false;
        break;
      }
      total += (amount * item.grams) / 100;
    }
    if (complete) per100[code] = (total * 100) / totalWeightG;
  }

  if (portions === null) return { totalWeightG, servingG: null, per100, perServing: null };
  const servingG = totalWeightG / portions;
  const perServing = Object.fromEntries(
    Object.entries(per100).map(([code, amount]) => [code, (amount * servingG) / 100]),
  );
  return { totalWeightG, servingG, per100, perServing };
}

/**
 * Con un ingrediente sparito dal catalogo i valori della ricetta restano quelli di prima:
 * scheda ed editor lo dicono, e resa e copia aspettano la sostituzione.
 */
export const MISSING_INGREDIENT_TEXT =
  'Un ingrediente non è più nel catalogo: sostituiscilo per aggiornare i valori.';

/** Le scorciatoie del foglio dei grammi per una ricetta a porzioni: una e due porzioni. */
export function portionShortcuts(servingG: number): { label: string; grams: number }[] {
  if (!(servingG > 0)) return [];
  return [1, 2].map((count) => ({
    label: `${count} ${count === 1 ? 'porzione' : 'porzioni'} · ${formatAmount(servingG * count, 'grams')} g`,
    grams: servingG * count,
  }));
}
