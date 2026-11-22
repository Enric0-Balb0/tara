/**
 * Bozza della ricetta in modifica (RF-20): vive in memoria, a livello di modulo, perché la
 * scelta degli ingredienti attraversa altre schermate (ricerca, scheda) e deve ritrovarla.
 * Si salva solo con "Salva la ricetta"; `clearDraft` la butta.
 */

import { useSyncExternalStore } from 'react';

import type { BaseUnit, FoodState } from '@/domain/food';
import { parseLabelValue } from '@/domain/foodForm';
import type { RecipeYield } from '@/domain/recipe';

export interface DraftItem {
  key: string;
  foodId: string;
  foodName: string;
  foodState: FoodState;
  /** Un liquido si pesa in ml: nel totale della ricetta 1 ml vale 1 g. */
  baseUnit: BaseUnit;
  gramsRaw: number;
}

/** La resa come si scrive: il testo resta com'è finché non si salva. */
export interface DraftYield {
  mode: 'portions' | 'weight';
  text: string;
}

export interface RecipeDraft {
  /** null per una ricetta nuova. */
  recipeId: string | null;
  name: string;
  yield: DraftYield;
  items: DraftItem[];
}

function emptyDraft(): RecipeDraft {
  return { recipeId: null, name: '', yield: { mode: 'portions', text: '1' }, items: [] };
}

let draft: RecipeDraft = emptyDraft();
let counter = 0;
const listeners = new Set<() => void>();

function set(next: RecipeDraft) {
  draft = next;
  for (const listener of listeners) listener();
}

export function getDraft(): RecipeDraft {
  return draft;
}

export function subscribeDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Parte da una bozza nuova, o da quella di una ricetta esistente. */
export function startDraft(initial?: Partial<RecipeDraft>): void {
  set({ ...emptyDraft(), ...initial });
}

export function clearDraft(): void {
  set(emptyDraft());
}

export function setName(name: string): void {
  set({ ...draft, name });
}

/** Cambiare modo svuota il testo: porzioni e grammi non si confondono. */
export function setYieldMode(mode: DraftYield['mode']): void {
  if (mode === draft.yield.mode) return;
  set({ ...draft, yield: { mode, text: mode === 'portions' ? '1' : '' } });
}

export function setYieldText(text: string): void {
  set({ ...draft, yield: { ...draft.yield, text } });
}

export function addItem(
  food: { id: string; name: string; state: FoodState; baseUnit: BaseUnit },
  grams: number,
): void {
  const item: DraftItem = {
    key: `item-${++counter}`,
    foodId: food.id,
    foodName: food.name,
    foodState: food.state,
    baseUnit: food.baseUnit,
    gramsRaw: grams,
  };
  set({ ...draft, items: [...draft.items, item] });
}

export function setItemGrams(key: string, grams: number): void {
  set({
    ...draft,
    items: draft.items.map((item) => (item.key === key ? { ...item, gramsRaw: grams } : item)),
  });
}

export function removeItem(key: string): void {
  set({ ...draft, items: draft.items.filter((item) => item.key !== key) });
}

/** La resa valida (porzioni o peso cotto positivi), o null se il testo non lo è. */
export function readYield(value: DraftYield): RecipeYield | null {
  const number = parseLabelValue(value.text);
  if (number === null || number === undefined || number <= 0) return null;
  return value.mode === 'portions'
    ? { mode: 'portions', portions: number }
    : { mode: 'weight', cookedWeightG: number };
}

export function useRecipeDraft(): RecipeDraft {
  return useSyncExternalStore(subscribeDraft, getDraft, getDraft);
}
