import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addItem,
  clearDraft,
  getDraft,
  readYield,
  removeItem,
  setItemGrams,
  setName,
  setYieldMode,
  setYieldText,
  startDraft,
  subscribeDraft,
} from './recipeDraft';

const OATS = { id: 'avena', name: 'Avena', state: 'raw' as const, baseUnit: 'g' as const };
const EGG = { id: 'albume', name: "Albume d'uovo", state: 'raw' as const, baseUnit: 'g' as const };
const MILK = {
  id: 'latte',
  name: 'Latte',
  state: 'not_applicable' as const,
  baseUnit: 'ml' as const,
};

beforeEach(() => clearDraft());

describe('bozza della ricetta (RF-20)', () => {
  it('parte vuota: nessun id, una porzione, nessun ingrediente', () => {
    expect(getDraft()).toEqual({
      recipeId: null,
      name: '',
      yield: { mode: 'portions', text: '1' },
      items: [],
    });
  });

  it('aggiunge gli ingredienti in ordine, ognuno con la sua chiave', () => {
    addItem(OATS, 50);
    addItem(OATS, 30);
    const { items } = getDraft();
    expect(
      items.map((item) => [item.foodId, item.foodName, item.foodState, item.gramsRaw]),
    ).toEqual([
      ['avena', 'Avena', 'raw', 50],
      ['avena', 'Avena', 'raw', 30],
    ]);
    expect(items[0]?.key).not.toBe(items[1]?.key);
  });

  it("ricorda l'unità dell'ingrediente: un liquido resta in ml", () => {
    addItem(MILK, 200);
    addItem(OATS, 40);
    expect(getDraft().items.map((item) => [item.foodId, item.baseUnit])).toEqual([
      ['latte', 'ml'],
      ['avena', 'g'],
    ]);
  });

  it('cambia i grammi di un solo ingrediente e ne toglie uno', () => {
    addItem(OATS, 50);
    addItem(EGG, 200);
    const [first, second] = getDraft().items;
    setItemGrams(first?.key ?? '', 60);
    expect(getDraft().items.map((item) => item.gramsRaw)).toEqual([60, 200]);
    removeItem(second?.key ?? '');
    expect(getDraft().items.map((item) => item.foodId)).toEqual(['avena']);
  });

  it('cambiando modo di resa il testo riparte: porzioni a 1, peso cotto vuoto', () => {
    setYieldText('3');
    setYieldMode('weight');
    expect(getDraft().yield).toEqual({ mode: 'weight', text: '' });
    setYieldText('400');
    setYieldMode('weight');
    expect(getDraft().yield.text).toBe('400');
    setYieldMode('portions');
    expect(getDraft().yield).toEqual({ mode: 'portions', text: '1' });
  });

  it('parte da una ricetta esistente e clearDraft la butta', () => {
    startDraft({ recipeId: 'r1', name: 'Pancake', items: [] });
    expect(getDraft()).toMatchObject({ recipeId: 'r1', name: 'Pancake' });
    clearDraft();
    expect(getDraft().recipeId).toBeNull();
    expect(getDraft().name).toBe('');
  });

  it('avvisa chi è iscritto a ogni cambiamento, finché non si disiscrive', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDraft(listener);
    setName('Torta');
    addItem(OATS, 10);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setName('Altro');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('ogni modifica produce una bozza nuova, così React rilegge', () => {
    const before = getDraft();
    setName('Torta');
    expect(getDraft()).not.toBe(before);
    expect(before.name).toBe('');
  });
});

describe('readYield', () => {
  it('legge porzioni e peso cotto, anche con la virgola', () => {
    expect(readYield({ mode: 'portions', text: '2,5' })).toEqual({
      mode: 'portions',
      portions: 2.5,
    });
    expect(readYield({ mode: 'weight', text: '450' })).toEqual({
      mode: 'weight',
      cookedWeightG: 450,
    });
  });

  it('rifiuta vuoto, zero e testo non numerico', () => {
    for (const text of ['', '0', 'abc', '-1']) {
      expect(readYield({ mode: 'portions', text })).toBeNull();
    }
  });
});
