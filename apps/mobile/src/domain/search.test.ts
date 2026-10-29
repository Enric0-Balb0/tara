import { describe, expect, it } from 'vitest';

import { searchKey, searchWords } from './search';

describe('searchKey', () => {
  it('toglie gli accenti', () => {
    expect(searchKey('Caffè')).toBe('caffe');
  });

  it('toglie la dieresi e porta in minuscolo', () => {
    expect(searchKey('WÜRSTEL')).toBe('wurstel');
  });

  it('comprime gli spazi', () => {
    expect(searchKey('  Petto   di POLLO ')).toBe('petto di pollo');
  });

  it("tiene l'apostrofo", () => {
    expect(searchKey("Albume d'uovo")).toBe("albume d'uovo");
  });
});

describe('searchKey come unaccent del backend', () => {
  it("porta l'apostrofo tipografico a quello dritto", () => {
    expect(searchKey('d’uovo')).toBe("d'uovo");
    expect(searchKey('‘aʼ')).toBe("'a'");
  });

  it('scioglie le legature', () => {
    expect(searchKey('Œuf')).toBe('oeuf');
    expect(searchKey('Straße')).toBe('strasse');
    expect(searchKey('Æbleskiver')).toBe('aebleskiver');
    expect(searchKey('Smør')).toBe('smor');
  });
});

describe('searchWords', () => {
  it('divide la ricerca in parole normalizzate', () => {
    expect(searchWords(' albume  crudo ')).toEqual(['albume', 'crudo']);
  });

  it('una ricerca vuota non ha parole', () => {
    expect(searchWords('')).toEqual([]);
    expect(searchWords('   ')).toEqual([]);
  });
});
