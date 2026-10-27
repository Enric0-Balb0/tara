import { beforeEach, describe, expect, it } from 'vitest';

import { getFood, replaceCatalog, searchFoods } from './catalogStore';
import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
import { openTestDatabase } from './testing/nodeDatabase';
import { snapshotText, TEST_FOODS, type TestFood } from './testing/snapshot';

const WHOLE_EGG: TestFood = {
  id: 'uovo-intero',
  name: 'Uovo intero',
  state: 'raw',
  base_unit: 'g',
  names: ['Uovo intero'],
  values: { protein_g: { amount: 12.4, provenance: 'reference', confidence: 1 } },
};

let db: SqlDatabase;

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
  await replaceCatalog(db, snapshotText([...TEST_FOODS, WHOLE_EGG]), {
    etag: '"v1"',
    syncedAt: '2026-10-27T14:42:00.000Z',
  });
});

const names = (hits: { name: string }[]) => hits.map((hit) => hit.name);

describe('searchFoods', () => {
  it("trova l'albume e mette il crudo prima del cotto", async () => {
    const hits = await searchFoods(db, 'albume');
    expect(hits).toEqual([
      {
        id: 'albume-crudo',
        name: "Albume d'uovo",
        state: 'raw',
        baseUnit: 'g',
        per100: { energy_kcal: 48.1, protein_g: 10.9, carbs_g: 0.73, fat_g: 0.17 },
      },
      {
        id: 'albume-cotto',
        name: "Albume d'uovo",
        state: 'cooked',
        baseUnit: 'g',
        per100: { energy_kcal: 47.3, protein_g: 10.3, carbs_g: 1.12, fat_g: 0.17 },
      },
    ]);
  });

  it('ignora accenti e maiuscole', async () => {
    expect(names(await searchFoods(db, 'CAFFE'))).toEqual(['Caffè espresso']);
    expect(names(await searchFoods(db, 'caffè'))).toEqual(['Caffè espresso']);
  });

  it('cerca anche nei nomi aggiuntivi', async () => {
    expect(names(await searchFoods(db, 'espresso'))).toEqual(['Caffè espresso']);
  });

  it('un macro sconosciuto resta mancante', async () => {
    const [coffee] = await searchFoods(db, 'caffe');
    expect(coffee?.per100).toEqual({ energy_kcal: 2, protein_g: 0.1, carbs_g: null, fat_g: null });
  });

  it('ogni parola deve comparire', async () => {
    expect(await searchFoods(db, 'albume caffè')).toEqual([]);
    expect(names(await searchFoods(db, 'uovo albume'))).toEqual(["Albume d'uovo", "Albume d'uovo"]);
  });

  it('prima i nomi che iniziano con la ricerca', async () => {
    expect(names(await searchFoods(db, 'uovo'))).toEqual([
      'Uovo intero',
      "Albume d'uovo",
      "Albume d'uovo",
    ]);
  });

  it('i caratteri speciali valgono alla lettera', async () => {
    expect(names(await searchFoods(db, "d'uovo"))).toEqual(["Albume d'uovo", "Albume d'uovo"]);
    expect(await searchFoods(db, '%%')).toEqual([]);
    expect(await searchFoods(db, '_a')).toEqual([]);
    expect(await searchFoods(db, '\\\\')).toEqual([]);
  });

  it('una ricerca di un carattere non restituisce nulla', async () => {
    expect(await searchFoods(db, 'a')).toEqual([]);
    expect(await searchFoods(db, '  ')).toEqual([]);
  });

  it('rispetta il limite', async () => {
    expect(await searchFoods(db, 'albume', 1)).toHaveLength(1);
  });
});

describe('getFood', () => {
  it("la scheda ha i nutrienti presenti nell'ordine dell'etichetta", async () => {
    const food = await getFood(db, 'albume-crudo');
    expect(food).toEqual({
      id: 'albume-crudo',
      name: "Albume d'uovo",
      state: 'raw',
      baseUnit: 'g',
      nutrients: [
        { code: 'energy_kcal', name: 'Energia', unit: 'kcal', amountPer100: 48.1, provenance: 'reference', confidence: 1 },
        { code: 'fat_g', name: 'Grassi', unit: 'g', amountPer100: 0.17, provenance: 'reference', confidence: 1 },
        { code: 'carbs_g', name: 'Carboidrati', unit: 'g', amountPer100: 0.73, provenance: 'reference', confidence: 1 },
        { code: 'protein_g', name: 'Proteine', unit: 'g', amountPer100: 10.9, provenance: 'reference', confidence: 0.9 },
      ],
    });
  });

  it('un alimento inesistente non ha scheda', async () => {
    expect(await getFood(db, 'inesistente')).toBeNull();
  });
});
