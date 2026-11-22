import { describe, expect, it } from 'vitest';

import {
  addDays,
  DEFAULT_MEAL_SLOTS,
  dayLabel,
  dayTitle,
  defaultSavedMealName,
  foodCountLabel,
  entryAmount,
  formatTotal,
  mealPlanStatus,
  minutesOfDay,
  slotForTime,
  snapshotFrom,
  toLocalDate,
  totals,
} from './diary';

const SLOTS = DEFAULT_MEAL_SLOTS.map((slot, position) => ({
  id: `s${position}`,
  name: slot.name,
  position,
  expectedTime: slot.time,
}));

describe('DEFAULT_MEAL_SLOTS', () => {
  it('sono i cinque pasti scelti da Enrico, in ordine di orario', () => {
    expect(DEFAULT_MEAL_SLOTS.map((slot) => slot.name)).toEqual([
      'Colazione',
      'Spuntino',
      'Pranzo',
      'Merenda',
      'Cena',
    ]);
    const times = DEFAULT_MEAL_SLOTS.map((slot) => minutesOfDay(slot.time));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('slotForTime', () => {
  it("sceglie il pasto con l'orario più vicino", () => {
    expect(slotForTime(SLOTS, minutesOfDay('07:00'))?.name).toBe('Colazione');
    expect(slotForTime(SLOTS, minutesOfDay('12:00'))?.name).toBe('Pranzo');
    expect(slotForTime(SLOTS, minutesOfDay('17:00'))?.name).toBe('Merenda');
    expect(slotForTime(SLOTS, minutesOfDay('23:30'))?.name).toBe('Cena');
  });

  it('a metà strada sceglie il pasto successivo', () => {
    // Spuntino 10:30 e Pranzo 13:00: a metà, 11:45, si sta andando a pranzo.
    expect(slotForTime(SLOTS, minutesOfDay('11:45'))?.name).toBe('Pranzo');
  });

  it("senza orari prende il primo pasto; senza pasti non c'è risposta", () => {
    const noTimes = SLOTS.map((slot) => ({ ...slot, expectedTime: null }));
    expect(slotForTime(noTimes, 600)?.name).toBe('Colazione');
    expect(slotForTime([], 600)).toBeUndefined();
  });
});

describe('date', () => {
  it('toLocalDate usa il giorno locale, non quello UTC', () => {
    expect(toLocalDate(new Date(2026, 10, 19, 23, 59))).toBe('2026-11-19');
    expect(toLocalDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });

  it('addDays attraversa mesi, anni e il cambio dell’ora legale', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('dayTitle dice Oggi, Ieri e Domani, altrimenti la data', () => {
    expect(dayTitle('2026-11-19', '2026-11-19')).toBe('Oggi');
    expect(dayTitle('2026-11-18', '2026-11-19')).toBe('Ieri');
    expect(dayTitle('2026-11-20', '2026-11-19')).toBe('Domani');
    expect(dayTitle('2026-11-16', '2026-11-19')).toBe('Lunedì 16 novembre');
    expect(dayTitle('2025-11-16', '2026-11-19')).toBe('Domenica 16 novembre 2025');
  });

  it('dayLabel è la data per esteso, in minuscolo come nel testo', () => {
    expect(dayLabel('2026-11-19')).toBe('giovedì 19 novembre');
    expect(dayLabel('2026-01-01')).toBe('giovedì 1 gennaio');
  });

  it('defaultSavedMealName propone «Pranzo del 21 novembre», senza giorno della settimana', () => {
    expect(defaultSavedMealName('Pranzo', '2026-11-21')).toBe('Pranzo del 21 novembre');
    expect(defaultSavedMealName('Cena', '2026-02-28')).toBe('Cena del 28 febbraio');
  });

  it('foodCountLabel accorda il numero degli alimenti', () => {
    expect(foodCountLabel(1)).toBe('1 alimento');
    expect(foodCountLabel(0)).toBe('0 alimenti');
    expect(foodCountLabel(3)).toBe('3 alimenti');
  });

  it('defaultSavedMealName elide davanti a 8 e 11 e scrive il primo del mese come 1°', () => {
    expect(defaultSavedMealName('Spuntino', '2026-01-01')).toBe('Spuntino del 1° gennaio');
    expect(defaultSavedMealName('Pranzo', '2026-03-08')).toBe("Pranzo dell'8 marzo");
    expect(defaultSavedMealName('Cena', '2026-04-11')).toBe("Cena dell'11 aprile");
    expect(defaultSavedMealName('Colazione', '2026-05-18')).toBe('Colazione del 18 maggio');
  });
});

describe('quantità e totali', () => {
  const albume = {
    energy_kcal: { amount: 48, provenance: 'reference', confidence: 1 },
    protein_g: { amount: 10.9, provenance: 'reference', confidence: 1 },
    carbs_g: { amount: 0.7, provenance: 'reference', confidence: 1 },
    fat_g: { amount: 0.2, provenance: 'reference', confidence: 0.5 },
  } as const;
  // Nessun valore per i grassi: un dato mancante non vale zero.
  const senzaGrassi = {
    energy_kcal: { amount: 100, provenance: 'reference', confidence: 1 },
    protein_g: { amount: 20, provenance: 'reference', confidence: 1 },
    carbs_g: { amount: 0, provenance: 'reference', confidence: 1 },
  } as const;

  it('entryAmount scala il valore per 100 sulla quantità', () => {
    expect(entryAmount(albume, 'protein_g', 300)).toBeCloseTo(32.7);
    expect(entryAmount(albume, 'energy_kcal', 50)).toBe(24);
  });

  it('entryAmount di un nutriente senza valore è null, non zero', () => {
    expect(entryAmount(senzaGrassi, 'fat_g', 100)).toBeNull();
  });

  it('i totali sommano i valori noti e segnano quelli incompleti', () => {
    const result = totals([
      { quantity: 300, snapshot: albume },
      { quantity: 100, snapshot: senzaGrassi },
    ]);
    expect(result.energy_kcal).toEqual({ amount: 244, incomplete: false });
    expect(result.protein_g.amount).toBeCloseTo(52.7);
    expect(result.fat_g.amount).toBeCloseTo(0.6);
    expect(result.fat_g.incomplete).toBe(true);
  });

  it('formatTotal mette "≥" davanti a un totale incompleto', () => {
    expect(formatTotal({ amount: 52.73, incomplete: false }, 'macro')).toBe('52,7');
    expect(formatTotal({ amount: 0.6, incomplete: true }, 'macro')).toBe('≥ 0,6');
    expect(formatTotal({ amount: 1243.6, incomplete: false }, 'kcal')).toBe('1244');
  });

  it('una giornata vuota ha totali a zero e completi', () => {
    expect(totals([]).protein_g).toEqual({ amount: 0, incomplete: false });
  });

  it('snapshotFrom tiene valore, provenienza e confidenza dei soli nutrienti noti', () => {
    expect(
      snapshotFrom([
        { code: 'protein_g', amountPer100: 10.9, provenance: 'reference', confidence: 1 },
        { code: 'fat_g', amountPer100: 0, provenance: 'reference', confidence: 0.5 },
      ]),
    ).toEqual({
      protein_g: { amount: 10.9, provenance: 'reference', confidence: 1 },
      fat_g: { amount: 0, provenance: 'reference', confidence: 0.5 },
    });
  });
});

describe('mealPlanStatus', () => {
  it('senza piano per il pasto non dice niente', () => {
    expect(mealPlanStatus([], [null])).toEqual({ progress: null, complete: false });
  });

  it('conta le voci del piano confermate su quelle del piano', () => {
    expect(mealPlanStatus(['a', 'b', 'c'], ['a', 'b'])).toEqual({
      progress: '2 di 3',
      complete: false,
    });
  });

  it('un pasto è completo se ogni voce del piano è confermata una volta e non c è altro', () => {
    expect(mealPlanStatus(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual({
      progress: '3 di 3, come da piano',
      complete: true,
    });
    // Una voce in più fuori dal piano: il pasto resta aperto.
    expect(mealPlanStatus(['a', 'b', 'c'], ['a', 'b', 'c', null])).toEqual({
      progress: '3 di 3',
      complete: false,
    });
  });

  it('le conferme di un altro piano non contano (tipo di giornata cambiato)', () => {
    // A e B confermate quando il giorno era Allenamento; ora è Riposo, con il piano C.
    expect(mealPlanStatus(['c'], ['a', 'b'])).toEqual({ progress: '0 di 1', complete: false });
    expect(mealPlanStatus(['c'], ['a', 'b', 'c'])).toEqual({ progress: '1 di 1', complete: false });
  });
});
