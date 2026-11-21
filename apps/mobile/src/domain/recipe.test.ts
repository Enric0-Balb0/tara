import { describe, expect, it } from 'vitest';

import { recipeValues } from './recipe';

const EGG_WHITE = { energy_kcal: 48.1, protein_g: 10.9, carbs_g: 0.73, fat_g: 0.17, fiber_g: 0 };
const OATS = { energy_kcal: 372, protein_g: 13.5, carbs_g: 60, fat_g: 7, fiber_g: 10 };
// La banana di questo catalogo non ha la fibra.
const BANANA = { energy_kcal: 90, protein_g: 1, carbs_g: 20, fat_g: 0.3 };

describe('recipeValues', () => {
  it('somma i valori degli ingredienti e li riporta per 100 g di ricetta', () => {
    const result = recipeValues(
      [
        { grams: 200, per100: EGG_WHITE },
        { grams: 50, per100: OATS },
      ],
      { mode: 'portions', portions: 2 },
    );
    expect(result.totalWeightG).toBe(250);
    expect(result.per100.protein_g).toBeCloseTo((10.9 * 2 + 13.5 * 0.5) / 2.5, 6);
    expect(result.per100.energy_kcal).toBeCloseTo((48.1 * 2 + 372 * 0.5) / 2.5, 6);
  });

  it('un nutriente manca se manca anche a un solo ingrediente (non vale zero)', () => {
    const result = recipeValues(
      [
        { grams: 200, per100: EGG_WHITE },
        { grams: 50, per100: OATS },
        { grams: 100, per100: BANANA },
      ],
      { mode: 'portions', portions: 1 },
    );
    expect(result.per100).not.toHaveProperty('fiber_g');
    expect(result.per100).toHaveProperty('protein_g');
    expect(result.perServing).not.toHaveProperty('fiber_g');
  });

  it('un valore a zero non è un valore mancante', () => {
    const result = recipeValues([{ grams: 100, per100: { fiber_g: 0 } }], {
      mode: 'portions',
      portions: 1,
    });
    expect(result.per100.fiber_g).toBe(0);
  });

  it('in modalità peso il peso cotto più basso alza i valori per 100 g', () => {
    const raw = [{ grams: 1000, per100: { protein_g: 10 } }];
    const cooked = recipeValues(raw, { mode: 'weight', cookedWeightG: 800 });
    expect(cooked.totalWeightG).toBe(800);
    expect(cooked.per100.protein_g).toBeCloseTo(12.5, 9);
    expect(cooked.servingG).toBeNull();
    expect(cooked.perServing).toBeNull();
  });

  it('in modalità porzioni la porzione è il peso diviso le porzioni', () => {
    const result = recipeValues(
      [
        { grams: 200, per100: { protein_g: 10 } },
        { grams: 200, per100: { protein_g: 20 } },
      ],
      { mode: 'portions', portions: 4 },
    );
    expect(result.totalWeightG).toBe(400);
    expect(result.servingG).toBe(100);
    expect(result.perServing?.protein_g).toBeCloseTo(15, 9);
  });

  it('senza ingredienti non ci sono valori', () => {
    expect(recipeValues([], { mode: 'portions', portions: 2 })).toEqual({
      totalWeightG: 0,
      servingG: 0,
      per100: {},
      perServing: {},
    });
    expect(recipeValues([], { mode: 'weight', cookedWeightG: 500 })).toEqual({
      totalWeightG: 0,
      servingG: null,
      per100: {},
      perServing: null,
    });
  });
});
