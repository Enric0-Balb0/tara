import { describe, expect, it } from 'vitest';

import {
  columns,
  entryColumns,
  fitColumn,
  goalColumns,
  goals,
  goalsCard,
  radius,
  space,
  touch,
  verticalSlop,
} from './layout';
import { curves, durations, INDETERMINATE_STEP_MS, PRESS_SCALE } from './motion';

// Valori di docs/design.md: cambiano solo insieme al documento.
describe('layout', () => {
  it('usa la griglia da 4', () => {
    for (const value of Object.values(space)) expect(value % 4).toBe(0);
  });

  it('rispetta le dimensioni minime dei tocchi', () => {
    expect(touch).toEqual({ min: 44, key: 54, primary: 52 });
  });

  it('ha colonne e raggi del documento', () => {
    expect(columns).toEqual({ weight: 56, kcal: 44, protein: 44, gap: 8 });
    expect(radius).toEqual({ label: 4, field: 10, key: 12, button: 14, panel: 16, sheet: 24 });
  });

  it('ha le colonne degli obiettivi sulla griglia da 4', () => {
    expect(goals).toEqual({ label: 92, value: 84, gap: 8 });
    for (const value of Object.values(goals)) expect(value % 4).toBe(0);
  });

  it('ha la densità della tavola nella scheda degli obiettivi', () => {
    expect(goalsCard).toEqual({ rowGap: 10, paddingTop: 12, paddingBottom: 14 });
  });
});

describe('motion', () => {
  it('ha durate brevi, tra 100 e 240 ms', () => {
    expect(durations).toEqual({ press: 100, quick: 160, sheetIn: 240, sheetOut: 200, entry: 200 });
  });

  it('usa le curve standard e di uscita', () => {
    expect(curves.standard).toEqual([0.2, 0, 0, 1]);
    expect(curves.exit).toEqual([0.4, 0, 1, 1]);
    expect(PRESS_SCALE).toBe(0.97);
  });

  it("l'attesa senza durata nota avanza piano, un passo ogni 320 ms", () => {
    expect(INDETERMINATE_STEP_MS).toBe(320);
  });
});

describe('goalColumns', () => {
  it('alla dimensione normale sono le colonne del documento', () => {
    expect(goalColumns(1)).toEqual({ label: 92, value: 84 });
    expect(goalColumns(0.85)).toEqual({ label: 92, value: 84 });
  });

  it('crescono con il testo fino al 130%, sulla griglia da 4', () => {
    expect(goalColumns(1.15)).toEqual({ label: 108, value: 100 });
    expect(goalColumns(2)).toEqual({ label: 120, value: 112 });
  });
});

describe('fitColumn', () => {
  it('resta quella di base se i valori ci stanno', () => {
    expect(fitColumn(84, [])).toBe(84);
    expect(fitColumn(84, [52.5, 84])).toBe(84);
  });

  it('si allarga al valore più largo, sulla griglia da 4', () => {
    expect(fitColumn(84, [60, 97.3])).toBe(100);
    expect(fitColumn(112, [113])).toBe(116);
  });
});

describe('verticalSlop', () => {
  it('porta a 44 solo in verticale', () => {
    expect(verticalSlop(36)).toEqual({ top: 4, bottom: 4 });
    expect(verticalSlop(18)).toEqual({ top: 13, bottom: 13 });
  });

  it('niente tocco esteso per chi è già alto 44', () => {
    expect(verticalSlop(52)).toEqual({ top: 0, bottom: 0 });
  });
});

describe('entryColumns', () => {
  it('alla dimensione normale sono le colonne del documento', () => {
    expect(entryColumns(1)).toEqual({ weight: 56, kcal: 44, protein: 44, gap: 8 });
    expect(entryColumns(0.85)).toEqual({ weight: 56, kcal: 44, protein: 44, gap: 8 });
  });

  // Misurati sui font: "1250 g" in Archivo SemiExpanded SemiBold 15 è largo 53,5 (69,5 al
  // 130%), "1250" e "125,5" in Archivo Regular 15 sono larghi 34,1 e 38,2 (44,3 e 49,7).
  it('a 1,3 contengono "1250 g", "1250" e "125,5" senza tagliarli', () => {
    const grown = entryColumns(1.3);
    expect(grown).toEqual({ weight: 76, kcal: 60, protein: 60, gap: 8 });
    expect(grown.weight).toBeGreaterThanOrEqual(69.5);
    expect(grown.kcal).toBeGreaterThanOrEqual(44.3);
    expect(grown.protein).toBeGreaterThanOrEqual(49.7);
  });

  it('oltre il 130% non crescono più, come il testo', () => {
    expect(entryColumns(2)).toEqual(entryColumns(1.3));
  });
});
