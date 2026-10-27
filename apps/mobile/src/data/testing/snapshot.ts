/** Snapshot del catalogo per i test, nella forma di `CatalogSnapshot` del backend. */

export interface TestValue {
  amount: number;
  provenance: string;
  confidence: number;
}

export interface TestFood {
  id: string;
  name: string;
  state: string;
  base_unit: string;
  /** Nomi italiani per la ricerca, il canonico per primo. */
  names: string[];
  values: Record<string, TestValue>;
}

export const TEST_NUTRIENTS = [
  { code: 'energy_kcal', name: 'Energia', unit: 'kcal' },
  { code: 'fat_g', name: 'Grassi', unit: 'g' },
  { code: 'carbs_g', name: 'Carboidrati', unit: 'g' },
  { code: 'sugars_g', name: 'Zuccheri', unit: 'g' },
  { code: 'protein_g', name: 'Proteine', unit: 'g' },
];

function reference(amount: number, confidence = 1): TestValue {
  return { amount, provenance: 'reference', confidence };
}

// Albume d'uovo di CIQUAL 2025, per 100 g: gli zuccheri non ci sono, quindi mancano.
export const TEST_FOODS: TestFood[] = [
  {
    id: 'albume-crudo',
    name: "Albume d'uovo",
    state: 'raw',
    base_unit: 'g',
    names: ["Albume d'uovo"],
    values: {
      energy_kcal: reference(48.1),
      protein_g: reference(10.9, 0.9),
      carbs_g: reference(0.73),
      fat_g: reference(0.17),
    },
  },
  {
    id: 'albume-cotto',
    name: "Albume d'uovo",
    state: 'cooked',
    base_unit: 'g',
    names: ["Albume d'uovo"],
    values: {
      energy_kcal: reference(47.3),
      protein_g: reference(10.3),
      carbs_g: reference(1.12),
      fat_g: reference(0.17),
    },
  },
  {
    id: 'caffe-espresso',
    name: 'Caffè espresso',
    state: 'not_applicable',
    base_unit: 'ml',
    names: ['Caffè espresso', 'Espresso'],
    values: { energy_kcal: reference(2), protein_g: reference(0.1) },
  },
];

export function snapshotText(foods: TestFood[] = TEST_FOODS, version = 'v1'): string {
  return JSON.stringify({ version, nutrients: TEST_NUTRIENTS, foods });
}
