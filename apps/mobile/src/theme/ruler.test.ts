import { describe, expect, it } from 'vitest';

import { contrastRatio } from '@/domain/contrast';

import { colors, MACRO_TOKENS, type Scheme } from './colors';
import { goalBar, ruler } from './ruler';

const SCHEMES: Scheme[] = ['dark', 'light'];

// La barra si disegna sulla superficie: tacche e tratteggio sono grafica che informa (≥ 3:1).
describe('ruler', () => {
  it.each(SCHEMES)('nel tema %s le tacche si vedono sulla superficie', (scheme) => {
    const palette = colors[scheme];
    expect(contrastRatio(palette[ruler.tickColor], palette.surface)).toBeGreaterThanOrEqual(3);
  });

  it.each(SCHEMES.flatMap((scheme) => MACRO_TOKENS.map((macro) => [scheme, macro] as const)))(
    'nel tema %s il tratteggio del previsto di %s si vede sulla superficie',
    (scheme, macro) => {
      const palette = colors[scheme];
      // Tratteggio a colore pieno: niente trasparenza che abbassi il contrasto.
      expect(ruler.hatchOpacity).toBe(1);
      expect(contrastRatio(palette[macro], palette.surface)).toBeGreaterThanOrEqual(3);
    },
  );
});

describe('goalBar', () => {
  it.each(SCHEMES)('nel tema %s il segno del traguardo si vede sulla superficie', (scheme) => {
    const palette = colors[scheme];
    expect(contrastRatio(palette[goalBar.markColor], palette.surface)).toBeGreaterThanOrEqual(3);
  });

  it('sta sulla griglia: 8 dp di altezza, il segno sporge di 2 per parte', () => {
    expect(goalBar.height % 4).toBe(0);
    expect(goalBar.height + 2 * goalBar.markOverhang).toBe(12);
  });
});
