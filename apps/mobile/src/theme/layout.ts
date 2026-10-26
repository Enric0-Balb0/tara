/** Spazi, raggi e dimensioni dei tocchi (docs/design.md, "Spazi, raggi, dimensioni"). */

/** Griglia da 4. */
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { label: 4, field: 10, key: 12, button: 14, panel: 16, sheet: 24 } as const;

/** Altezze minime: ogni elemento toccabile almeno 44 × 44. */
export const touch = { min: 44, key: 54, primary: 52 } as const;

/** Colonne delle righe, uguali in ogni lista: il nome prende lo spazio che resta. */
export const columns = { weight: 56, kcal: 44, protein: 44, gap: 8 } as const;
