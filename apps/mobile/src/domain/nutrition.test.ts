import { describe, expect, it } from 'vitest';

import { checkDeclaredKcal, expectedKcal, sodiumMgFromSaltG } from './nutrition';

describe('expectedKcal', () => {
  it('applica i fattori 4/4/9/2', () => {
    expect(expectedKcal({ proteinG: 10, carbsG: 20, fatG: 5, fiberG: 3 })).toBe(171);
  });

  it('tratta le fibre assenti come 0', () => {
    expect(expectedKcal({ proteinG: 11, carbsG: 0.7, fatG: 0.2 })).toBeCloseTo(48.6);
  });
});

describe('checkDeclaredKcal', () => {
  it("accetta un'etichetta coerente", () => {
    // Fiocchi d'avena: 372 kcal, P 13.5, C 58.7, G 7, fibre 10
    const result = checkDeclaredKcal(372, { proteinG: 13.5, carbsG: 58.7, fatG: 7, fiberG: 10 });
    expect(result.ok).toBe(true);
  });

  it('segnala una lettura sbagliata', () => {
    // 37 invece di 372: errore tipico dell'estrazione
    const result = checkDeclaredKcal(37, { proteinG: 13.5, carbsG: 58.7, fatG: 7, fiberG: 10 });
    expect(result.ok).toBe(false);
  });

  it('non divide per zero', () => {
    expect(checkDeclaredKcal(0, { proteinG: 0, carbsG: 0, fatG: 0 }).ok).toBe(true);
  });
});

describe('sodiumMgFromSaltG', () => {
  it('converte il sale in sodio', () => {
    expect(sodiumMgFromSaltG(1)).toBe(400);
    expect(sodiumMgFromSaltG(0.25)).toBe(100);
  });
});
