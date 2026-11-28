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

/**
 * Barra sottile degli obiettivi di Oggi (docs/design.md, "Barra graduata"): 8 dp, il binario
 * è decorativo, le tacche ogni 10% sono tagli del colore della superficie solo sulla parte
 * piena e il segno del traguardo sporge sopra e sotto. La parte piena è larga almeno
 * `minFill` se c'è qualcosa di registrato, con i suoi angoli arrotondati. Il tratteggio del
 * previsto è quello della barra graduata.
 */
export const goalBar = {
  height: 8,
  radius: 4,
  trackColor: 'border' as ColorToken,
  cutColor: 'surface' as ColorToken,
  cutWidth: 1,
  markColor: 'text' as ColorToken,
  markWidth: 2,
  markOverhang: 2,
  minFill: 4,
} as const;
