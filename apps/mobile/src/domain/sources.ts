/** Fonti dei valori nutrizionali, come si nominano nella scheda e nel profilo (RNF-10). */

import type { FoodSource } from './food';

const LABELS: Record<FoodSource, string> = {
  ciqual: 'CIQUAL 2025 (Anses)',
  usda: 'USDA FoodData Central',
  open_food_facts: 'Open Food Facts',
  label: 'Etichetta',
  manual: 'Inserito a mano',
  recipe: 'Ricetta',
};

export function sourceLabel(source: FoodSource | null): string | null {
  return source === null ? null : LABELS[source];
}

/** Citazione richiesta dalla Licence Ouverte / Etalab 2.0 (docs/requisiti.md, Fonti dati). */
export const CIQUAL_ATTRIBUTION =
  'Anses. 2025. Table de composition nutritionnelle des aliments Ciqual. Licence Ouverte / Etalab 2.0. Nomi tradotti in italiano da Tara.';
