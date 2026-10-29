/** Stato di un alimento quando si pesa: gli stessi valori di `food.state` nel backend. */
export type FoodState = 'raw' | 'cooked' | 'not_applicable';

/** Unità a cui si riferiscono i valori per 100: gli stessi valori di `food.base_unit`. */
export type BaseUnit = 'g' | 'ml';

/** Da dove arriva un alimento: gli stessi valori di `food.source` nel backend. */
export type FoodSource = 'ciqual' | 'usda' | 'open_food_facts' | 'label' | 'manual' | 'recipe';

/**
 * Stato e cottura come li dice il lettore dello schermo: "cotto, al vapore". Crudo (il
 * predefinito) e n.a. non hanno etichetta, come nell'interfaccia.
 */
export function stateLabel(state: FoodState, cooking: string | null): string {
  if (state !== 'cooked') return '';
  return cooking === null ? 'cotto' : `cotto, ${cooking}`;
}
