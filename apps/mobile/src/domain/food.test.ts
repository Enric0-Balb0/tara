import { describe, expect, it } from 'vitest';

import { stateLabel } from './food';

describe('stateLabel', () => {
  it('il cotto con la sua cottura', () => {
    expect(stateLabel('cooked', 'al vapore')).toBe('cotto, al vapore');
  });

  it('il cotto senza cottura precisata', () => {
    expect(stateLabel('cooked', null)).toBe('cotto');
  });

  it('crudo e n.a. non hanno etichetta', () => {
    expect(stateLabel('raw', null)).toBe('');
    expect(stateLabel('not_applicable', null)).toBe('');
  });
});
