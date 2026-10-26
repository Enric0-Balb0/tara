/**
 * Colori di Tara (docs/design.md, "Colori"). Il tema scuro è il predefinito; i macro
 * usano i colori dei dischi olimpici. Nessun componente scrive un colore a mano.
 */

export type Scheme = 'dark' | 'light';

export type ColorToken =
  | 'background'
  | 'surface'
  | 'raised'
  | 'border'
  | 'borderStrong'
  | 'text'
  | 'textSecondary'
  | 'textDisabled'
  | 'action'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'fiber'
  | 'review'
  | 'error';

export const colors: Record<Scheme, Record<ColorToken, string>> = {
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

/** L'etichetta nutrizionale è un foglio: uguale in entrambi i temi. */
export const labelColors = { paper: '#FFFFFF', ink: '#000000', secondary: '#4D545A' } as const;

export const MACRO_TOKENS = ['protein', 'carbs', 'fat', 'fiber'] as const;
export type MacroToken = (typeof MACRO_TOKENS)[number];
