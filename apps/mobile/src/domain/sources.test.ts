import { describe, expect, it } from 'vitest';

import { CIQUAL_ATTRIBUTION, sourceLabel } from './sources';

describe('sourceLabel', () => {
  it('dà il nome di ogni fonte', () => {
    expect(sourceLabel('ciqual')).toBe('CIQUAL 2025 (Anses)');
    expect(sourceLabel('usda')).toBe('USDA FoodData Central');
    expect(sourceLabel('open_food_facts')).toBe('Open Food Facts');
    expect(sourceLabel('label')).toBe('Etichetta');
    expect(sourceLabel('manual')).toBe('Inserito a mano');
    expect(sourceLabel('recipe')).toBe('Ricetta');
  });

  it('una fonte non nota non ha nome', () => {
    expect(sourceLabel(null)).toBeNull();
  });
});

describe('CIQUAL_ATTRIBUTION', () => {
  it('cita CIQUAL come chiede la licenza', () => {
    expect(CIQUAL_ATTRIBUTION).toBe(
      'Anses. 2025. Table de composition nutritionnelle des aliments Ciqual. Licence Ouverte / Etalab 2.0. Nomi tradotti in italiano da Tara.',
    );
  });
});
