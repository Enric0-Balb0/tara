import { describe, expect, it } from 'vitest';

import { contrastRatio } from '@/domain/contrast';

import { colors, MACRO_TOKENS, type Scheme } from './colors';
import { ruler } from './ruler';

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
