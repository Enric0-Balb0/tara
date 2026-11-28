/** Spazi, raggi e dimensioni dei tocchi (docs/design.md, "Spazi, raggi, dimensioni"). */

/** Griglia da 4. */
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { label: 4, field: 10, key: 12, button: 14, panel: 16, sheet: 24 } as const;

/** Altezze minime: ogni elemento toccabile almeno 44 × 44. */
export const touch = { min: 44, key: 54, primary: 52 } as const;

/** Colonne delle righe, uguali in ogni lista: il nome prende lo spazio che resta. */
export const columns = { weight: 56, kcal: 44, protein: 44, gap: 8 } as const;

/**
 * Righe degli obiettivi di Oggi: etichetta del macro a larghezza fissa, barra sottile che prende
 * lo spazio che resta, valore "49 / 240" a destra. Le stesse in ogni riga, acqua compresa.
 */
export const goals = { label: 92, value: 84, gap: 8 } as const;

/**
 * Densità della scheda degli obiettivi, presa dalla tavola "Bilancia con i colori dei dischi":
 * 10 tra una riga e l'altra, 12 sopra e 14 sotto. Fuori dalla griglia da 4 per scelta: le righe
 * non si toccano (i tocchi, l'acqua e l'invito al Piano, restano da 44 con hitSlop).
 */
export const goalsCard = { rowGap: 10, paddingTop: 12, paddingBottom: 14 } as const;

/** Testo ingrandito oltre il quale TaraText non scala più (docs/design.md, "Carattere"). */
export const MAX_FONT_SCALE = 1.3;

/**
 * Le colonne degli obiettivi con il testo ingrandito dal telefono: crescono con il testo, fino
 * al 130%, sulla griglia da 4. Così nome e valore non si tagliano e le barre restano in colonna.
 */
export function goalColumns(fontScale: number): { label: number; value: number } {
  const scale = Math.min(Math.max(fontScale, 1), MAX_FONT_SCALE);
  const grow = (width: number) => Math.ceil((width * scale) / 4) * 4;
  return { label: grow(goals.label), value: grow(goals.value) };
}

/**
 * La colonna dei valori degli obiettivi: almeno quella del documento (cresciuta con il testo),
 * e se un valore è più largo, larga quanto il più largo, sulla griglia da 4. Tutte le righe
 * usano la stessa, così le barre finiscono alla stessa x anche con il testo ingrandito.
 */
export function fitColumn(base: number, widths: readonly number[]): number {
  return widths.reduce((widest, width) => Math.max(widest, Math.ceil(width / 4) * 4), base);
}

/**
 * Il tocco esteso a 44 solo in verticale, per un elemento basso a vista: in orizzontale gli
 * elementi vicini sono a 4 dp e il tocco di uno coprirebbe l'altro.
 */
export function verticalSlop(height: number): { top: number; bottom: number } {
  const slop = Math.max(0, (touch.min - height) / 2);
  return { top: slop, bottom: slop };
}
