import type { ColorToken } from './colors';

/** Barra graduata (docs/design.md, "Componenti"): misure e colori dei suoi segni. */
export const ruler = {
  /** Altezza del binario e della parte piena. */
  track: 12,
  fill: 5,
  fillRadius: 3,
  tickInset: 2,
  /** Tacche ogni 10% e segno del traguardo: grafica che informa, ≥ 3:1 sulla superficie. */
  tickColor: 'textSecondary' as ColorToken,
  baseColor: 'borderStrong' as ColorToken,
  markWidth: 2,
  hatchSpacing: 5,
  hatchWidth: 2,
  hatchOpacity: 1,
} as const;
