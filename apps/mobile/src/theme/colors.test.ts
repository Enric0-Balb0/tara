import { describe, expect, it } from 'vitest';

import { contrastRatio, relativeLuminance } from '@/domain/contrast';

import { type ColorToken, colors, labelColors, MACRO_TOKENS, type Scheme } from './colors';

const SCHEMES: Scheme[] = ['dark', 'light'];

// Valori della tabella "Colori" di docs/design.md: cambiano solo insieme al documento.
const EXPECTED: Record<Scheme, Record<ColorToken, string>> = {
  dark: {
    background: '#15191C',
    surface: '#1E2328',
    raised: '#283037',
    border: '#2C343A',
    borderStrong: '#39424A',
    text: '#ECEFF1',
    textSecondary: '#A3ADB5',
    textDisabled: '#5E6A73',
    action: '#ECEFF1',
    protein: '#FF6B70',
    carbs: '#6CB0FF',
    fat: '#FFC93C',
    fiber: '#3DC47E',
    review: '#FFB224',
    error: '#FF9466',
  },
  light: {
    background: '#F3F5F7',
    surface: '#FFFFFF',
    raised: '#E8ECEF',
    border: '#D5DBE0',
    borderStrong: '#B8C1C8',
    text: '#14191D',
    textSecondary: '#4D5860',
    textDisabled: '#8A949C',
    action: '#14191D',
    protein: '#D7263D',
    carbs: '#1A5CC8',
    fat: '#8C6200',
    fiber: '#187A45',
    review: '#8F5E00',
    error: '#B5470F',
  },
};

const READABLE: ColorToken[] = [
  'text',
  'textSecondary',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'review',
  'error',
];

describe('colors', () => {
  it.each(SCHEMES)('il tema %s ha i valori del documento di design', (scheme) => {
    expect(colors[scheme]).toEqual(EXPECTED[scheme]);
  });

  it.each(SCHEMES.flatMap((scheme) => READABLE.map((token) => [scheme, token] as const)))(
    'nel tema %s il token %s si legge su superficie e fondo',
    (scheme, token) => {
      const palette = colors[scheme];
      expect(contrastRatio(palette[token], palette.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette[token], palette.background)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(SCHEMES.flatMap((scheme) => MACRO_TOKENS.map((token) => [scheme, token] as const)))(
    'nel tema %s il macro %s si distingue dal binario delle barre',
    (scheme, token) => {
      const palette = colors[scheme];
      expect(contrastRatio(palette[token], palette.raised)).toBeGreaterThanOrEqual(3);
    },
  );

  it('nel tema scuro proteine, carboidrati e grassi differiscono anche in luminosità', () => {
    const { protein, carbs, fat } = colors.dark;
    const luminances = [protein, carbs, fat].map(relativeLuminance);
    for (const [i, a] of luminances.entries()) {
      for (const b of luminances.slice(i + 1)) {
        expect(Math.abs(a - b)).toBeGreaterThanOrEqual(0.05);
      }
    }
  });

  it("l'etichetta è carta bianca con inchiostro nero e testo secondario leggibile", () => {
    expect(labelColors).toEqual({ paper: '#FFFFFF', ink: '#000000', secondary: '#4D545A' });
    expect(contrastRatio(labelColors.secondary, labelColors.paper)).toBeGreaterThanOrEqual(4.5);
  });
});
