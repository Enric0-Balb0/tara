import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DAY_TYPES,
  formatTargetInput,
  macroKcalCheck,
  parseTargetInput,
  remaining,
  targetFor,
} from './targets';

describe('DEFAULT_DAY_TYPES', () => {
  it('sono Allenamento e Riposo, da personalizzare nel Piano', () => {
    expect(DEFAULT_DAY_TYPES).toEqual(['Allenamento', 'Riposo']);
  });
});

describe('targetFor', () => {
  const history = [
    { validFrom: '2026-11-01', kcal: 2600 },
    { validFrom: '2026-11-15', kcal: 2800 },
    { validFrom: '2026-12-01', kcal: 3000 },
  ];

  it('vale il target più recente già in vigore quel giorno (RF-53)', () => {
    expect(targetFor(history, '2026-11-14')?.kcal).toBe(2600);
    expect(targetFor(history, '2026-11-15')?.kcal).toBe(2800);
    expect(targetFor(history, '2026-11-30')?.kcal).toBe(2800);
    expect(targetFor(history, '2027-01-01')?.kcal).toBe(3000);
  });

  it('prima del primo target non ce n è nessuno', () => {
    expect(targetFor(history, '2026-10-31')).toBeUndefined();
    expect(targetFor([], '2026-11-21')).toBeUndefined();
  });

  it("non dipende dall'ordine della lista", () => {
    expect(targetFor([...history].reverse(), '2026-11-20')?.kcal).toBe(2800);
  });
});

describe('parseTargetInput', () => {
  it('legge interi e decimali con la virgola', () => {
    expect(parseTargetInput('2800')).toBe(2800);
    expect(parseTargetInput(' 240 ')).toBe(240);
    expect(parseTargetInput('82,5')).toBe(82.5);
    expect(parseTargetInput('82.5')).toBe(82.5);
  });

  it('un campo vuoto è un target non impostato, non zero', () => {
    expect(parseTargetInput('')).toBeNull();
    expect(parseTargetInput('   ')).toBeNull();
  });

  it('rifiuta testo, negativi e numeri assurdi', () => {
    expect(parseTargetInput('tanti')).toBeUndefined();
    expect(parseTargetInput('-5')).toBeUndefined();
    expect(parseTargetInput('100000')).toBeUndefined();
  });

  it('formatTargetInput è il contrario, per riempire il campo', () => {
    expect(formatTargetInput(82.5)).toBe('82,5');
    expect(formatTargetInput(2800)).toBe('2800');
    expect(formatTargetInput(null)).toBe('');
  });
});

describe('remaining', () => {
  it('è quanto manca al target, negativo se lo si supera', () => {
    expect(remaining(2800, 1450)).toBe(1350);
    expect(remaining(240, 260)).toBe(-20);
  });

  it('senza target non si calcola', () => {
    expect(remaining(null, 1450)).toBeNull();
  });
});

describe('macroKcalCheck', () => {
  it('dice quante kcal fanno i macro quando non tornano con le kcal del target', () => {
    // 240·4 + 300·4 + 70·9 = 2790: con 2800 kcal torna.
    expect(macroKcalCheck({ kcal: 2800, protein_g: 240, carbs_g: 300, fat_g: 70 })).toBeNull();
    // 240·4 + 400·4 + 70·9 = 3190 contro 2800: oltre il 10%.
    expect(macroKcalCheck({ kcal: 2800, protein_g: 240, carbs_g: 400, fat_g: 70 })).toBe(3190);
  });

  it('serve un target completo per confrontare', () => {
    expect(macroKcalCheck({ kcal: 2800, protein_g: 240, carbs_g: null, fat_g: 70 })).toBeNull();
  });
});
