import { describe, expect, it } from 'vitest';

import {
  emptyFoodTexts,
  type FoodTexts,
  foodTextsOf,
  kcalCheckText,
  LABEL_FIELDS,
  parseLabelValue,
  readFoodForm,
} from './foodForm';

// Skyr bianco, per 100 g: 63 kcal, 0,2 g di grassi, 4 g di carboidrati, 11 g di proteine.
function skyr(overrides: Partial<FoodTexts> = {}): FoodTexts {
  return {
    ...emptyFoodTexts(),
    energy_kj: '267',
    energy_kcal: '63',
    fat_g: '0,2',
    sat_fat_g: '0,1',
    carbs_g: '4',
    sugars_g: '4',
    protein_g: '11',
    salt_g: '0,13',
    ...overrides,
  };
}

describe('parseLabelValue', () => {
  it('legge virgola e punto, vuoto è null, il resto non vale', () => {
    expect(parseLabelValue('0,13')).toBe(0.13);
    expect(parseLabelValue(' 4.5 ')).toBe(4.5);
    expect(parseLabelValue('')).toBeNull();
    expect(parseLabelValue('abc')).toBeUndefined();
    expect(parseLabelValue('-1')).toBeUndefined();
    expect(parseLabelValue('1,234')).toBeUndefined();
  });
});

describe('readFoodForm', () => {
  it('con nome e valori validi dà i valori per 100 e il sodio dal sale (RF-16)', () => {
    const form = readFoodForm('Skyr', skyr());
    expect(form.ok).toBe(true);
    expect(form.values).toEqual({
      energy_kj: 267,
      energy_kcal: 63,
      fat_g: 0.2,
      sat_fat_g: 0.1,
      carbs_g: 4,
      sugars_g: 4,
      protein_g: 11,
      salt_g: 0.13,
      sodium_mg: 52,
    });
    expect(form.derived).toEqual(['sodium_mg']);
  });

  it('un valore lasciato vuoto manca, non vale zero (principio 2)', () => {
    const form = readFoodForm('Skyr', skyr({ fiber_g: '', sat_fat_g: '' }));
    expect(form.ok).toBe(true);
    expect(form.values).not.toHaveProperty('fiber_g');
    expect(form.values).not.toHaveProperty('sat_fat_g');
  });

  it('servono il nome, le kcal e i tre macro', () => {
    const form = readFoodForm('  ', skyr({ protein_g: '', energy_kcal: '', energy_kj: '' }));
    expect(form.ok).toBe(false);
    expect(form.errors).toMatchObject({
      name: 'Scrivi il nome',
      energy_kcal: 'Servono le kcal',
      protein_g: 'Servono le proteine',
    });
  });

  it('con i soli kJ le kcal si calcolano, e viceversa, segnate come ricavate', () => {
    const fromKj = readFoodForm('Skyr', skyr({ energy_kcal: '' }));
    expect(fromKj.values.energy_kcal).toBe(64);
    expect(fromKj.derived).toEqual(['energy_kcal', 'sodium_mg']);
    const fromKcal = readFoodForm('Skyr', skyr({ energy_kj: '' }));
    expect(fromKcal.values.energy_kj).toBe(264);
    expect(fromKcal.derived).toEqual(['energy_kj', 'sodium_mg']);
  });

  it('rifiuta un "di cui" più grande del totale', () => {
    const form = readFoodForm('Skyr', skyr({ sugars_g: '5' }));
    expect(form.ok).toBe(false);
    expect(form.errors.sugars_g).toBe('Più dei carboidrati');
  });

  it('rifiuta più di 100 g di nutrienti in 100 g', () => {
    const form = readFoodForm('Olio', skyr({ fat_g: '99', carbs_g: '4', sugars_g: '' }));
    expect(form.ok).toBe(false);
    expect(form.errors.total).toBe('Più di 100 g di nutrienti in 100 g: ricontrolla i valori');
  });

  it('rifiuta un numero non valido', () => {
    expect(readFoodForm('Skyr', skyr({ carbs_g: '4..' })).errors.carbs_g).toBe('Numero non valido');
  });
});

describe('kcalCheckText (RF-15)', () => {
  it('dice se le calorie tornano con i macro', () => {
    expect(kcalCheckText(readFoodForm('Skyr', skyr()).values)).toEqual({
      ok: true,
      text: 'Le calorie tornano con i macro: 63 dichiarate, 62 calcolate.',
    });
  });

  it('avvisa oltre il 10%, senza bloccare', () => {
    const values = readFoodForm('Skyr', skyr({ energy_kcal: '90', energy_kj: '' })).values;
    expect(kcalCheckText(values)).toEqual({
      ok: false,
      text: "Le calorie non tornano con i macro: 90 dichiarate, 62 calcolate. Ricontrolla l'etichetta.",
    });
  });

  it('senza tutti i macro non dice niente', () => {
    expect(kcalCheckText({ energy_kcal: 63 })).toBeNull();
  });
});

describe('foodTextsOf', () => {
  it('riporta nel form i valori salvati, con la virgola', () => {
    const texts = foodTextsOf({ energy_kcal: 63, fat_g: 0.2, salt_g: 0.13 }, []);
    expect(texts.energy_kcal).toBe('63');
    expect(texts.fat_g).toBe('0,2');
    expect(texts.salt_g).toBe('0,13');
    expect(texts.protein_g).toBe('');
  });

  it("un valore ricavato torna vuoto, così si ricalcola se cambia l'altro", () => {
    // 1000 kJ scritti, 239 kcal ricavate: anche 239 × 4,184 fa 1000, ma conta chi è scritto.
    expect(foodTextsOf({ energy_kcal: 239, energy_kj: 1000 }, ['energy_kcal'])).toMatchObject({
      energy_kcal: '',
      energy_kj: '1000',
    });
    expect(foodTextsOf({ energy_kcal: 63, energy_kj: 264 }, ['energy_kj']).energy_kj).toBe('');
    expect(foodTextsOf({ energy_kcal: 63, energy_kj: 264 }, [])).toMatchObject({
      energy_kcal: '63',
      energy_kj: '264',
    });
  });

  it("ha un campo per ogni riga dell'etichetta", () => {
    expect(Object.keys(emptyFoodTexts())).toEqual(LABEL_FIELDS.map((field) => field.code));
  });
});
