import { describe, expect, it } from 'vitest';

import { columns, radius, space, touch } from './layout';
import { curves, durations, PRESS_SCALE } from './motion';

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
});
