import { describe, expect, it } from 'vitest';

import { rulerGeometry } from './ruler';

describe('rulerGeometry', () => {
  it('riempie la metà del binario a metà obiettivo', () => {
    expect(rulerGeometry(120, 0, 240)).toEqual({ logged: 0.5, planned: 0, target: 1 });
  });

  it('aggiunge il tratteggio del previsto dopo il registrato', () => {
    const geometry = rulerGeometry(49, 191, 240);
    expect(geometry.logged).toBeCloseTo(0.204, 3);
    expect(geometry.planned).toBeCloseTo(0.796, 3);
    expect(geometry.target).toBe(1);
  });

  it("oltre l'obiettivo mostra l'eccesso e sposta il segno del traguardo", () => {
    expect(rulerGeometry(300, 0, 240)).toEqual({ logged: 1, planned: 0, target: 0.8 });
  });

  it('senza obiettivo non disegna il segno', () => {
    expect(rulerGeometry(50, 0, null)).toEqual({ logged: 1, planned: 0, target: null });
  });

  it('a binario vuoto restituisce zeri', () => {
    expect(rulerGeometry(0, 0, null)).toEqual({ logged: 0, planned: 0, target: null });
  });

  it("con l'obiettivo ma niente registrato il segno resta in fondo", () => {
    expect(rulerGeometry(0, 0, 240)).toEqual({ logged: 0, planned: 0, target: 1 });
  });
});
