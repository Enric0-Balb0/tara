import { describe, expect, it } from 'vitest';

import { contrastRatio, ensureContrast } from './contrast';

describe('contrastRatio', () => {
  it('vale 21 tra nero e bianco', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21);
  });

  it('vale 1 tra due colori uguali', () => {
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
  });

  it("non dipende dall'ordine dei colori", () => {
    expect(contrastRatio('#FF6B70', '#1E2328')).toBeCloseTo(contrastRatio('#1E2328', '#FF6B70'));
  });

  it('accetta esadecimali minuscoli e con 3 cifre', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21);
  });
});

describe('ensureContrast', () => {
  it('lascia invariato un colore che passa già', () => {
    expect(ensureContrast('#FF6B70', '#1E2328')).toBe('#FF6B70');
  });

  it('scurisce un colore troppo chiaro su sfondo chiaro', () => {
    const fixed = ensureContrast('#FFC93C', '#FFFFFF');

    expect(fixed).toMatch(/^#[0-9A-F]{6}$/);
    expect(contrastRatio(fixed, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('schiarisce un colore troppo scuro su sfondo scuro', () => {
    const fixed = ensureContrast('#1A5CC8', '#1E2328');

    expect(contrastRatio(fixed, '#1E2328')).toBeGreaterThanOrEqual(4.5);
  });

  it('rispetta una soglia diversa', () => {
    expect(
      contrastRatio(ensureContrast('#777777', '#808080', 3), '#808080'),
    ).toBeGreaterThanOrEqual(3);
  });
});
