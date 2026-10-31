import { beforeEach, describe, expect, it } from 'vitest';

import { getFood, getVariant, replaceCatalog, searchFoods } from './catalogStore';
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
        cooking: null,
        baseUnit: 'g',
        per100: { energy_kcal: 48.1, protein_g: 10.9, carbs_g: 0.73, fat_g: 0.17 },
      },
      {
        id: 'albume-cotto',
        name: "Albume d'uovo",
        state: 'cooked',
        cooking: null,
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

  it("l'apostrofo tipografico trova l'albume", async () => {
    expect(names(await searchFoods(db, 'albume d’uovo'))).toEqual(["Albume d'uovo", "Albume d'uovo"]);
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
      cooking: null,
      baseUnit: 'g',
      source: 'ciqual',
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

describe('getVariant', () => {
  const food = (id: string, name: string, state: string): TestFood => ({
    id,
    name,
    state,
    base_unit: 'g',
    source: 'ciqual',
    names: [name],
    values: {},
  });

  it('trova la variante cotta e quella cruda', async () => {
    expect(await getVariant(db, "Albume d'uovo", 'cooked')).toBe('albume-cotto');
    expect(await getVariant(db, "Albume d'uovo", 'raw')).toBe('albume-crudo');
  });

  it("senza variante non c'è niente da cambiare", async () => {
    expect(await getVariant(db, 'Caffè espresso', 'cooked')).toBeNull();
    expect(await getVariant(db, 'Uovo intero', 'cooked')).toBeNull();
  });

  it('con più varianti cotte non sceglie a caso', async () => {
    await replaceCatalog(
      db,
      snapshotText([
        ...TEST_FOODS,
        food('broccoli-crudi', 'Broccoli', 'raw'),
        food('broccoli-vapore', 'Broccoli', 'cooked'),
        food('broccoli-bolliti', 'Broccoli', 'cooked'),
      ]),
      { etag: null, syncedAt: '2026-10-29T10:00:00.000Z' },
    );
    expect(await getVariant(db, 'Broccoli', 'cooked')).toBeNull();
  });

  it('con due crude e una cotta non cambia, così il ritorno porta sempre al punto di partenza', async () => {
    await replaceCatalog(
      db,
      snapshotText([
        ...TEST_FOODS,
        food('agnello-a', 'Agnello, costoletta', 'raw'),
        food('agnello-b', 'Agnello, costoletta', 'raw'),
        food('agnello-cotto', 'Agnello, costoletta', 'cooked'),
      ]),
      { etag: null, syncedAt: '2026-10-29T10:00:00.000Z' },
    );
    expect(await getVariant(db, 'Agnello, costoletta', 'cooked')).toBeNull();
    expect(await getVariant(db, 'Agnello, costoletta', 'raw')).toBeNull();
  });
});

describe('cottura', () => {
  const broccoli = (id: string, state: string, cooking: string | null): TestFood => ({
    id,
    name: 'Broccoli',
    state,
    base_unit: 'g',
    source: 'ciqual',
    cooking,
    names: ['Broccoli'],
    values: {},
  });

  beforeEach(async () => {
    await replaceCatalog(
      db,
      snapshotText([
        ...TEST_FOODS,
        broccoli('broccoli-lessati', 'cooked', 'lessato'),
        broccoli('broccoli-vapore', 'cooked', 'al vapore'),
        broccoli('broccoli-cotti', 'cooked', null),
        broccoli('broccoli-crudi', 'raw', null),
      ]),
      { etag: null, syncedAt: '2026-10-29T10:00:00.000Z' },
    );
  });

  it('a parità di nome il cotto senza cottura precisata viene prima', async () => {
    const hits = await searchFoods(db, 'broccoli');
    expect(hits.map((hit) => [hit.id, hit.cooking])).toEqual([
      ['broccoli-crudi', null],
      ['broccoli-cotti', null],
      ['broccoli-vapore', 'al vapore'],
      ['broccoli-lessati', 'lessato'],
    ]);
  });

  it('si cerca anche per cottura', async () => {
    expect((await searchFoods(db, 'broccoli vapore')).map((hit) => hit.id)).toEqual([
      'broccoli-vapore',
    ]);
  });

  it('una cottura non conta come un nome che inizia con la ricerca', async () => {
    const roast = (id: string, name: string, cooking: string | null): TestFood => ({
      ...broccoli(id, 'cooked', cooking),
      name,
      names: [name],
    });
    await replaceCatalog(
      db,
      snapshotText([
        roast('aglio-arrosto', 'Aglio', 'arrosto, al forno'),
        roast('arrosto-manzo', 'Arrosto di manzo', null),
      ]),
      { etag: null, syncedAt: '2026-10-31T10:00:00.000Z' },
    );
    expect((await searchFoods(db, 'arrosto')).map((hit) => hit.id)).toEqual([
      'arrosto-manzo',
      'aglio-arrosto',
    ]);
  });

  it('la scheda ha la cottura', async () => {
    expect((await getFood(db, 'broccoli-vapore'))?.cooking).toBe('al vapore');
  });
});
