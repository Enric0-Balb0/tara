import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INCREMENTS,
  formatLitres,
  parseIncrements,
  parseWaterTarget,
  validIncrements,
  waterFraction,
  waterText,
} from './water';

describe('formatLitres', () => {
  it('scrive i litri con la virgola e al massimo due decimali', () => {
    expect(formatLitres(1250)).toBe('1,25');
    expect(formatLitres(500)).toBe('0,5');
    expect(formatLitres(3000)).toBe('3');
    expect(formatLitres(0)).toBe('0');
    expect(formatLitres(1000)).toBe('1');
    expect(formatLitres(2750)).toBe('2,75');
  });

  it('arrotonda ai centilitri', () => {
    expect(formatLitres(1254)).toBe('1,25');
    expect(formatLitres(1256)).toBe('1,26');
  });
});

describe('waterText', () => {
  it('con il target dice "1,25 di 3 l", anche a zero', () => {
    expect(waterText(1250, 3000)).toBe('1,25 di 3 l');
    expect(waterText(0, 3000)).toBe('0 di 3 l');
  });

  it('senza target dice solo i litri', () => {
    expect(waterText(1250, null)).toBe('1,25 l');
    expect(waterText(0, null)).toBe('0 l');
  });
});

describe('waterFraction', () => {
  it('è la frazione del target, al massimo 1', () => {
    expect(waterFraction(1500, 3000)).toBe(0.5);
    expect(waterFraction(4000, 3000)).toBe(1);
  });

  it("senza target non c'è frazione", () => {
    expect(waterFraction(1500, null)).toBe(0);
  });
});

describe('validIncrements', () => {
  it('accetta da uno a tre interi tra 50 e 2000 ml', () => {
    expect(validIncrements([250])).toBe(true);
    expect(validIncrements([50, 2000, 500])).toBe(true);
    expect(DEFAULT_INCREMENTS).toEqual([250, 500]);
  });

  it('rifiuta vuoto, più di tre, fuori intervallo e non interi', () => {
    expect(validIncrements([])).toBe(false);
    expect(validIncrements([100, 200, 300, 400])).toBe(false);
    expect(validIncrements([49])).toBe(false);
    expect(validIncrements([2001])).toBe(false);
    expect(validIncrements([250.5])).toBe(false);
    expect(validIncrements([Number.NaN])).toBe(false);
  });
});

describe('parseIncrements', () => {
  it('legge i campi scritti a mano, salta i vuoti, ordina e toglie i doppioni', () => {
    expect(parseIncrements(['500', '', '250'])).toEqual([250, 500]);
    expect(parseIncrements(['250', '250', ''])).toEqual([250]);
  });

  it("è undefined se un campo non è valido o non ce n'è nessuno", () => {
    expect(parseIncrements(['abc', '250', ''])).toBeUndefined();
    expect(parseIncrements(['10', '', ''])).toBeUndefined();
    expect(parseIncrements(['', '', ''])).toBeUndefined();
    expect(parseIncrements(['250,5', '', ''])).toBeUndefined();
  });
});

describe('parseWaterTarget', () => {
  it('vuoto è non impostato, un intero positivo è il target', () => {
    expect(parseWaterTarget('')).toBeNull();
    expect(parseWaterTarget(' 3000 ')).toBe(3000);
  });

  it('rifiuta zero, decimali, testo e valori enormi', () => {
    expect(parseWaterTarget('0')).toBeUndefined();
    expect(parseWaterTarget('2500,5')).toBeUndefined();
    expect(parseWaterTarget('2500.5')).toBeUndefined();
    expect(parseWaterTarget('abc')).toBeUndefined();
    expect(parseWaterTarget('100000')).toBeUndefined();
  });
});
