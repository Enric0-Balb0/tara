import { describe, expect, it } from 'vitest';

import { filledTicks, rulerGeometry, visibleFill } from './ruler';

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

describe('visibleFill', () => {
  it('segue la frazione del binario', () => {
    expect(visibleFill(0.5, 200, 4)).toBe(100);
  });

  it('pochi grammi restano visibili, niente registrato resta vuoto', () => {
    expect(visibleFill(0.001, 200, 4)).toBe(4);
    expect(visibleFill(0, 200, 4)).toBe(0);
    expect(visibleFill(0.5, 0, 4)).toBe(0);
  });

  it('non va oltre il binario', () => {
    expect(visibleFill(1, 3, 4)).toBe(3);
  });
});

describe('filledTicks', () => {
  it('tiene solo le tacche dentro la parte piena', () => {
    expect(filledTicks(0)).toEqual([]);
    expect(filledTicks(0.35)).toEqual([0.1, 0.2, 0.3]);
    expect(filledTicks(1)).toHaveLength(9);
  });

  it('una tacca sul bordo della parte piena non si disegna', () => {
    expect(filledTicks(0.2)).toEqual([0.1]);
  });
});
