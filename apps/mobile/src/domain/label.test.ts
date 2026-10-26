import { describe, expect, it } from 'vitest';

import { amountFor, labelRows } from './label';

// Fiocchi d'avena, CIQUAL 2025, per 100 g.
const OATS = {
  energy_kj: 1550,
  energy_kcal: 369,
  fat_g: 7.82,
  sat_fat_g: 1.37,
  carbs_g: 57.7,
  sugars_g: 1.04,
  fiber_g: 11.2,
  protein_g: 11.4,
  salt_g: 0.011,
};

function value(rows: ReturnType<typeof labelRows>, label: string): string | undefined {
  return rows.find((row) => row.label === label)?.value;
}

describe('amountFor', () => {
  it('riporta il valore per 100 g alla quantità', () => {
    expect(amountFor(10.9, 500)).toBeCloseTo(54.5);
  });

  it('lascia mancante un valore mancante', () => {
    expect(amountFor(null, 500)).toBeNull();
  });
});

describe('labelRows', () => {
  it("segue l'ordine dell'etichetta europea", () => {
    expect(labelRows(OATS).map((row) => row.label)).toEqual([
      'Energia',
      'Grassi',
      'di cui saturi',
      'Carboidrati',
      'di cui zuccheri',
      'Fibre',
      'Proteine',
      'Sale',
    ]);
  });

  it('rientra solo le voci "di cui"', () => {
    expect(
      labelRows(OATS)
        .filter((row) => row.sub)
        .map((row) => row.label),
    ).toEqual(['di cui saturi', 'di cui zuccheri']);
  });

  it('formatta i valori per 100 g', () => {
    const rows = labelRows(OATS);
    expect(value(rows, 'Energia')).toBe('1550 kJ / 369 kcal');
    expect(value(rows, 'Grassi')).toBe('7,8 g');
    expect(value(rows, 'Sale')).toBe('0,01 g');
  });

  it('riporta i valori alla quantità scelta', () => {
    expect(value(labelRows(OATS, 50), 'Proteine')).toBe('5,7 g');
  });

  it('mostra un valore mancante come trattino, mai come zero', () => {
    const { sugars_g: _ignored, ...withoutSugars } = OATS;
    expect(value(labelRows(withoutSugars), 'di cui zuccheri')).toBe('–');
    expect(value(labelRows({ ...OATS, energy_kj: null }), 'Energia')).toBe('– kJ / 369 kcal');
  });
});
