import { describe, expect, it } from 'vitest';

import { formatAmount, formatNumber, MISSING } from './format';

describe('formatNumber', () => {
  it('usa la virgola decimale', () => {
    expect(formatNumber(10.9, 1)).toBe('10,9');
  });

  it('non separa le migliaia fino a 9999', () => {
    expect(formatNumber(4800, 0)).toBe('4800');
  });

  it('sopra 9999 separa le migliaia con uno spazio stretto', () => {
    expect(formatNumber(12500, 0)).toBe('12 500');
    expect(formatNumber(1234567.25, 1)).toBe('1 234 567,3');
  });

  it('arrotonda al numero di decimali', () => {
    expect(formatNumber(0.45, 1)).toBe('0,5');
  });

  it('mostra un dato mancante come trattino, mai come zero', () => {
    expect(formatNumber(null, 1)).toBe('–');
    expect(MISSING).toBe('–');
  });
});

describe('formatAmount', () => {
  it('lascia lo zero vero come zero', () => {
    expect(formatAmount(0, 'macro')).toBe('0,0');
  });

  it('usa i decimali del tipo di valore', () => {
    expect(formatAmount(500.4, 'grams')).toBe('500');
    expect(formatAmount(368.6, 'kcal')).toBe('369');
    expect(formatAmount(1550, 'kj')).toBe('1550');
    expect(formatAmount(54.55, 'macro')).toBe('54,6');
    expect(formatAmount(0.011, 'salt')).toBe('0,01');
  });

  it('mostra un dato mancante come trattino', () => {
    expect(formatAmount(null, 'kcal')).toBe('–');
  });
});
