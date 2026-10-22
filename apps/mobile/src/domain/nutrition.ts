/**
 * Regole nutrizionali deterministiche usate dal form etichetta (RF-15, RF-16).
 * Tutti i valori sono riferiti a 100 g o 100 ml del prodotto.
 */

/** kcal per grammo secondo i fattori del Reg. UE 1169/2011, allegato XIV. */
export const KCAL_PER_GRAM = {
  protein: 4,
  carbs: 4,
  fat: 9,
  fiber: 2,
} as const;

export interface Macros {
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Le etichette UE possono ometterle: in quel caso valgono 0 nel calcolo. */
  fiberG?: number;
}

/** Energia attesa dai macronutrienti dichiarati. */
export function expectedKcal(macros: Macros): number {
  return (
    macros.proteinG * KCAL_PER_GRAM.protein +
    macros.carbsG * KCAL_PER_GRAM.carbs +
    macros.fatG * KCAL_PER_GRAM.fat +
    (macros.fiberG ?? 0) * KCAL_PER_GRAM.fiber
  );
}

export interface KcalCheck {
  expectedKcal: number;
  /** Scarto relativo tra kcal dichiarate e attese (0.1 = 10%). */
  relativeError: number;
  ok: boolean;
}

/**
 * Confronta le kcal dichiarate con quelle attese dai macro.
 * Uno scarto oltre la tolleranza indica di solito un errore di lettura dell'etichetta.
 */
export function checkDeclaredKcal(
  declaredKcal: number,
  macros: Macros,
  tolerance = 0.1,
): KcalCheck {
  const expected = expectedKcal(macros);
  const reference = Math.max(declaredKcal, expected);
  const relativeError = reference === 0 ? 0 : Math.abs(declaredKcal - expected) / reference;
  return { expectedKcal: expected, relativeError, ok: relativeError <= tolerance };
}

/** Le etichette UE riportano il sale: sodio (mg) = sale (g) / 2,5 × 1000. */
export function sodiumMgFromSaltG(saltG: number): number {
  return (saltG / 2.5) * 1000;
}
