import { describe, expect, it } from 'vitest';

import { pluralizeServing, servingShortcuts } from './serving';

describe('pluralizeServing', () => {
  it.each([
    ['vasetto', 'vasetti'],
    ['fetta', 'fette'],
    ['noce', 'noci'],
    ['cucchiaio', 'cucchiai'],
    ['uovo', 'uova'],
    ['paio', 'paia'],
    ['barca', 'barche'],
    ['yogurt', 'yogurt'],
    ['caffè', 'caffè'],
    ['fetta di pane', 'fette di pane'],
    ['  uovo  ', 'uova'],
  ])('%s → %s', (singular, plural) => {
    expect(pluralizeServing(singular)).toBe(plural);
  });
});

describe('servingShortcuts', () => {
  it('usa il nome, al plurale per due', () => {
    expect(servingShortcuts(150, 'vasetto')).toEqual([
      { label: '1 vasetto · 150 g', grams: 150 },
      { label: '2 vasetti · 300 g', grams: 300 },
    ]);
  });

  it('senza nome dice porzione', () => {
    expect(servingShortcuts(150, null).map((s) => s.label)).toEqual([
      '1 porzione · 150 g',
      '2 porzioni · 300 g',
    ]);
    expect(servingShortcuts(150, '  ')[0]?.label).toBe('1 porzione · 150 g');
  });

  it('per i liquidi scrive millilitri', () => {
    expect(servingShortcuts(250, 'bicchiere', 'ml')[1]?.label).toBe('2 bicchieri · 500 ml');
  });

  it('non propone nulla se non pesa', () => {
    expect(servingShortcuts(0, 'uovo')).toEqual([]);
  });
});
