import { describe, expect, it } from 'vitest';

import {
  canAdd,
  type GramEntry,
  type KeypadKey,
  netGrams,
  pressKey,
  startEntry,
  tareExceedsWeight,
} from './gramEntry';

function press(entry: GramEntry, ...keys: KeypadKey[]): GramEntry {
  return keys.reduce(pressKey, entry);
}

describe('startEntry', () => {
  it('parte vuoto sul peso', () => {
    expect(startEntry()).toEqual({ gross: '', tare: '', editing: 'weight', replaceNext: false });
  });

  it("propone l'ultima quantità usata", () => {
    expect(startEntry(500)).toEqual({ gross: '500', tare: '', editing: 'weight', replaceNext: true });
  });
});

describe('pressKey', () => {
  it("la prima cifra sostituisce l'ultima quantità proposta", () => {
    expect(press(startEntry(500), '3').gross).toBe('3');
  });

  it('cancella toglie del tutto la quantità proposta', () => {
    expect(press(startEntry(500), 'delete').gross).toBe('');
  });

  it('accoda le cifre', () => {
    expect(press(startEntry(), '1', '5', '0').gross).toBe('150');
  });

  it('ignora lo zero iniziale', () => {
    expect(press(startEntry(), '0', '0', '7').gross).toBe('7');
  });

  it('ignora le cifre oltre la quinta', () => {
    expect(press(startEntry(), '9', '9', '9', '9', '9', '9').gross).toBe('99999');
  });

  it("cancella toglie l'ultima cifra", () => {
    expect(press(startEntry(), '1', '2', 'delete').gross).toBe('1');
  });

  it('tara sposta le cifre sul peso del contenitore e ritorna al peso', () => {
    const onTare = press(startEntry(), '5', '3', '8', 'tare', '3', '8');
    expect(onTare).toMatchObject({ gross: '538', tare: '38', editing: 'tare' });
    expect(press(onTare, 'tare', '6')).toMatchObject({ gross: '6', editing: 'weight' });
  });

  it('una tara già scritta viene sostituita dalla prima cifra', () => {
    const entry = press(startEntry(), '5', '0', '0', 'tare', '3', '8', 'tare', 'tare', '4');
    expect(entry.tare).toBe('4');
  });
});

describe('peso netto', () => {
  it('sottrae la tara dal lordo', () => {
    expect(netGrams(press(startEntry(), '5', '3', '8', 'tare', '3', '8'))).toBe(500);
  });

  it('con la tara oltre il peso il netto è zero e non si può aggiungere', () => {
    const entry = press(startEntry(), '3', '0', 'tare', '3', '8');
    expect(netGrams(entry)).toBe(0);
    expect(tareExceedsWeight(entry)).toBe(true);
    expect(canAdd(entry)).toBe(false);
  });

  it('senza peso non si può aggiungere', () => {
    expect(canAdd(startEntry())).toBe(false);
    expect(tareExceedsWeight(startEntry())).toBe(false);
  });

  it('con un peso valido si può aggiungere', () => {
    expect(canAdd(startEntry(500))).toBe(true);
  });
});
