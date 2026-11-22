import { beforeEach, describe, expect, it } from 'vitest';

import { getFood, replaceCatalog, searchFoods } from './catalogStore';
import { addEntry, ensureMealSlots, entriesForDay } from './diaryStore';
import { createFood, deleteFood, type PersonalFoodInput, updateFood } from './foodsStore';
import { favorites, setFavorite } from './quickStore';
import {
  createRecipe,
  deleteRecipe,
  duplicateRecipe,
  type RecipeInput,
  recipeDetail,
  recipes,
  recipesContaining,
  ingredientValues,
  refreshRecipeValues,
  setCookedWeight,
  updateRecipe,
} from './recipesStore';
import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
import { snapshotText, TEST_FOODS } from './testing/snapshot';
import { openTestDatabase } from './testing/nodeDatabase';

const USER = '0195f1a2-0000-7000-8000-000000000001';
const OTHER = '0195f1a2-0000-7000-8000-000000000002';
const NOW = new Date('2026-11-21T12:30:00.000Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const OATS: PersonalFoodInput = {
  name: 'Avena',
  brand: null,
  state: 'raw',
  baseUnit: 'g',
  values: { energy_kcal: 372, protein_g: 13.5, carbs_g: 60, fat_g: 7 },
};

const PANCAKE = (items: RecipeInput['items']): RecipeInput => ({
  name: 'Pancake proteici',
  yield: { mode: 'portions', portions: 2 },
  items,
});

let db: SqlDatabase;
let oats: string;

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
  await replaceCatalog(db, snapshotText(), { etag: null, syncedAt: NOW.toISOString() });
  oats = await createFood(db, USER, OATS, NOW);
});

async function pancake(): Promise<string> {
  return createRecipe(
    db,
    USER,
    PANCAKE([
      { foodId: 'albume-crudo', gramsRaw: 200 },
      { foodId: oats, gramsRaw: 50 },
    ]),
    NOW,
  );
}

async function valuesOf(id: string) {
  const food = await getFood(db, id);
  return Object.fromEntries((food?.nutrients ?? []).map((n) => [n.code, n]));
}

describe('createRecipe (RF-20)', () => {
  it('crea un alimento personale di tipo ricetta, con resa e ingredienti in ordine', async () => {
    const id = await pancake();
    expect(await getFood(db, id)).toMatchObject({
      name: 'Pancake proteici',
      state: 'not_applicable',
      baseUnit: 'g',
      source: 'recipe',
      personal: true,
    });
    expect(await recipeDetail(db, USER, id)).toEqual({
      id,
      name: 'Pancake proteici',
      yield: { mode: 'portions', portions: 2 },
      items: [
        expect.objectContaining({
          foodId: 'albume-crudo',
          foodName: "Albume d'uovo",
          foodState: 'raw',
          foodBaseUnit: 'g',
          gramsRaw: 200,
        }),
        expect.objectContaining({ foodId: oats, foodName: 'Avena', gramsRaw: 50 }),
      ],
      totalWeightG: 250,
      servingG: 125,
      missingIngredients: [],
    });
  });

  it('un ingrediente in ml porta la sua unità nella scheda della ricetta', async () => {
    const milk = await createFood(db, USER, { ...OATS, name: 'Latte', baseUnit: 'ml' }, NOW);
    const id = await createRecipe(db, USER, PANCAKE([{ foodId: milk, gramsRaw: 100 }]), NOW);
    expect((await recipeDetail(db, USER, id))?.items[0]).toMatchObject({
      foodName: 'Latte',
      foodBaseUnit: 'ml',
    });
  });

  it('materializza i valori per 100 g con provenienza estimated e la confidenza minima', async () => {
    const values = await valuesOf(await pancake());
    expect(values.energy_kcal?.amountPer100).toBeCloseTo((48.1 * 2 + 372 * 0.5) / 2.5, 6);
    expect(values.protein_g?.amountPer100).toBeCloseTo((10.9 * 2 + 13.5 * 0.5) / 2.5, 6);
    expect(values.protein_g).toMatchObject({ provenance: 'estimated', confidence: 0.9 });
    expect(values.fat_g).toMatchObject({ provenance: 'estimated', confidence: 1 });
    // L'albume non ha gli zuccheri: alla ricetta mancano, non valgono zero.
    expect(values).not.toHaveProperty('sugars_g');
  });

  it("la ricerca trova la ricetta e l'elenco della Dispensa la mostra", async () => {
    const id = await pancake();
    expect((await searchFoods(db, 'pancake', USER)).map((hit) => hit.id)).toEqual([id]);
    expect(await searchFoods(db, 'pancake', OTHER)).toEqual([]);
    const [row] = await recipes(db, USER);
    expect(row).toMatchObject({ id, name: 'Pancake proteici', servingG: 125 });
    expect(row?.kcalPer100).toBeCloseTo((48.1 * 2 + 372 * 0.5) / 2.5, 6);
  });

  it('una resa o una grammatura non valide annullano tutto', async () => {
    await expect(
      createRecipe(db, USER, { ...PANCAKE([]), yield: { mode: 'portions', portions: 0 } }, NOW),
    ).rejects.toThrow(/recipe_yield_complete/);
    await expect(
      createRecipe(db, USER, PANCAKE([{ foodId: oats, gramsRaw: 0 }]), NOW),
    ).rejects.toThrow(/recipe_item_grams_positive/);
    expect(await recipes(db, USER)).toEqual([]);
    expect(await searchFoods(db, 'pancake', USER)).toEqual([]);
  });

  it('una ricetta non è ingrediente di sé stessa', async () => {
    const id = await pancake();
    await expect(
      db.runAsync(
        `INSERT INTO recipe_item (id, user_id, recipe_id, ingredient_food_id, grams_raw, position,
           created_at, updated_at)
         VALUES ('x', ?, ?, ?, 10, 5, 'a', 'a')`,
        USER,
        id,
        id,
      ),
    ).rejects.toThrow(/recipe_item_not_itself/);
  });

  it('la resa è a porzioni o a peso cotto, nient’altro', async () => {
    const id = await createFood(db, USER, { ...OATS, name: 'Impasto' }, NOW);
    await expect(
      db.runAsync(
        `INSERT INTO recipe (food_id, user_id, yield_mode, portions, cooked_weight_g, created_at,
           updated_at)
         VALUES (?, ?, 'pezzi', 2, NULL, 'a', 'a')`,
        id,
        USER,
      ),
    ).rejects.toThrow(/recipe_yield_mode_valid/);
  });

  it('rifiuta come ingrediente un alimento di un altro utente o che non esiste', async () => {
    const theirs = await createFood(db, OTHER, { ...OATS, name: 'Avena altrui' }, NOW);
    await expect(
      createRecipe(db, USER, PANCAKE([{ foodId: theirs, gramsRaw: 50 }]), NOW),
    ).rejects.toThrow(/Ingrediente non nel catalogo dell'utente/);
    await expect(
      createRecipe(db, USER, PANCAKE([{ foodId: 'inesistente', gramsRaw: 50 }]), NOW),
    ).rejects.toThrow(/Ingrediente non nel catalogo dell'utente/);
    const id = await pancake();
    await expect(
      updateRecipe(db, USER, id, PANCAKE([{ foodId: theirs, gramsRaw: 50 }]), later(1)),
    ).rejects.toThrow(/Ingrediente non nel catalogo dell'utente/);
    expect((await recipeDetail(db, USER, id))?.items).toHaveLength(2);
    expect(await recipes(db, USER)).toHaveLength(1);
  });

  it('accetta come ingrediente un alimento proprio eliminato, già nella ricetta', async () => {
    const id = await pancake();
    await deleteFood(db, USER, oats, later(1));
    const detail = await recipeDetail(db, USER, id);
    if (detail === null) throw new Error('ricetta non salvata');
    expect(
      await updateRecipe(
        db,
        USER,
        id,
        {
          name: 'Pancake rinominati',
          yield: detail.yield,
          items: detail.items.map((item) => ({ foodId: item.foodId, gramsRaw: item.gramsRaw })),
        },
        later(2),
      ),
    ).toBe(true);
  });

  it('la resa deve avere porzioni oppure peso cotto, mai entrambi', async () => {
    const id = await createFood(db, USER, { ...OATS, name: 'Impasto' }, NOW);
    await expect(
      db.runAsync(
        `INSERT INTO recipe (food_id, user_id, yield_mode, portions, cooked_weight_g, created_at,
           updated_at)
         VALUES (?, ?, 'weight', 2, 500, 'a', 'a')`,
        id,
        USER,
      ),
    ).rejects.toThrow(/recipe_yield_complete/);
  });
});

describe('ricalcolo dei valori (RF-22)', () => {
  it('modificare un ingrediente personale aggiorna i valori della ricetta, non il diario', async () => {
    const id = await pancake();
    const food = await getFood(db, id);
    if (food === null) throw new Error('ricetta non salvata');
    const [slot] = await ensureMealSlots(db, USER, NOW);
    await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: slot?.id ?? '',
      food,
      quantity: 125,
      now: NOW,
    });
    const before = await entriesForDay(db, USER, '2026-11-21');

    await updateFood(
      db,
      USER,
      oats,
      { ...OATS, values: { energy_kcal: 400, protein_g: 20, carbs_g: 60, fat_g: 7 } },
      later(1),
    );

    const values = await valuesOf(id);
    expect(values.protein_g?.amountPer100).toBeCloseTo((10.9 * 2 + 20 * 0.5) / 2.5, 6);
    expect(await entriesForDay(db, USER, '2026-11-21')).toEqual(before);
  });

  it('un ingrediente eliminato resta nel calcolo e nella scheda', async () => {
    const id = await pancake();
    const before = await valuesOf(id);
    await deleteFood(db, USER, oats, later(1));
    await refreshRecipeValues(db, [id]);
    expect(await valuesOf(id)).toEqual(before);
    const detail = await recipeDetail(db, USER, id);
    expect(detail?.items.map((item) => item.foodName)).toEqual(["Albume d'uovo", 'Avena']);
  });

  it('dopo un catalogo nuovo i valori si ricalcolano sui generici aggiornati', async () => {
    const id = await pancake();
    const richer = TEST_FOODS.map((food) =>
      food.id === 'albume-crudo'
        ? {
            ...food,
            values: { ...food.values, protein_g: { ...food.values.protein_g!, amount: 12 } },
          }
        : food,
    );
    await replaceCatalog(db, snapshotText(richer, 'v2'), {
      etag: null,
      syncedAt: later(5).toISOString(),
    });
    expect((await valuesOf(id)).protein_g?.amountPer100).toBeCloseTo(
      (10.9 * 2 + 13.5 * 0.5) / 2.5,
      6,
    );
    await refreshRecipeValues(db);
    expect((await valuesOf(id)).protein_g?.amountPer100).toBeCloseTo(
      (12 * 2 + 13.5 * 0.5) / 2.5,
      6,
    );
  });

  it('una ricetta può essere ingrediente di un’altra e ne segue i cambiamenti', async () => {
    const inner = await createRecipe(
      db,
      USER,
      {
        name: 'Impasto',
        yield: { mode: 'weight', cookedWeightG: 100 },
        items: [{ foodId: oats, gramsRaw: 100 }],
      },
      NOW,
    );
    const outer = await createRecipe(
      db,
      USER,
      {
        name: 'Torta',
        yield: { mode: 'portions', portions: 1 },
        items: [{ foodId: inner, gramsRaw: 100 }],
      },
      NOW,
    );
    expect((await valuesOf(outer)).protein_g?.amountPer100).toBeCloseTo(13.5, 6);
    await updateFood(
      db,
      USER,
      oats,
      { ...OATS, values: { energy_kcal: 372, protein_g: 20 } },
      later(1),
    );
    expect((await valuesOf(inner)).protein_g?.amountPer100).toBeCloseTo(20, 6);
    expect((await valuesOf(outer)).protein_g?.amountPer100).toBeCloseTo(20, 6);
  });

  it('il ricalcolo di tutte le ricette non tocca i valori di quelle eliminate', async () => {
    const id = await pancake();
    const before = await valuesOf(id);
    await deleteRecipe(db, USER, id, later(1));
    await updateFood(
      db,
      USER,
      oats,
      { ...OATS, values: { energy_kcal: 400, protein_g: 20, carbs_g: 60, fat_g: 7 } },
      later(2),
    );
    await refreshRecipeValues(db);
    await refreshRecipeValues(db, [id]);
    const rows = await db.getAllAsync<{ nutrient_code: string; amount_per_100: number }>(
      'SELECT nutrient_code, amount_per_100 FROM nutrient_value WHERE food_id = ? ORDER BY 1',
      id,
    );
    expect(rows.map((row) => [row.nutrient_code, row.amount_per_100])).toEqual(
      Object.values(before)
        .map((n) => [n.code, n.amountPer100] as const)
        .sort((a, b) => a[0].localeCompare(b[0])),
    );
  });
});

describe('catalogo che perde un ingrediente', () => {
  const withoutEggWhite = TEST_FOODS.filter((food) => food.id !== 'albume-crudo');

  it('il catalogo nuovo si salva anche se manca un generico usato da una ricetta', async () => {
    await pancake();
    await expect(
      replaceCatalog(db, snapshotText(withoutEggWhite, 'v2'), {
        etag: null,
        syncedAt: later(5).toISOString(),
      }),
    ).resolves.toMatchObject({ version: 'v2' });
  });

  it('il ricalcolo lascia com’erano i valori di una ricetta con un ingrediente sparito', async () => {
    const id = await pancake();
    const before = await valuesOf(id);
    await replaceCatalog(db, snapshotText(withoutEggWhite, 'v2'), {
      etag: null,
      syncedAt: later(5).toISOString(),
    });
    await refreshRecipeValues(db);
    expect(await valuesOf(id)).toEqual(before);
    const detail = await recipeDetail(db, USER, id);
    expect(detail?.items.map((item) => item.foodId)).toEqual(['albume-crudo', oats]);
    expect(detail?.missingIngredients).toEqual(['albume-crudo']);
  });

  it('il peso da cotto non cambia finché l’ingrediente sparito non è sostituito', async () => {
    const id = await createRecipe(
      db,
      USER,
      {
        name: 'Teglia',
        yield: { mode: 'weight', cookedWeightG: 200 },
        items: [
          { foodId: 'albume-crudo', gramsRaw: 200 },
          { foodId: oats, gramsRaw: 50 },
        ],
      },
      NOW,
    );
    const before = await valuesOf(id);
    await replaceCatalog(db, snapshotText(withoutEggWhite, 'v2'), {
      etag: null,
      syncedAt: later(5).toISOString(),
    });
    expect(await setCookedWeight(db, USER, id, 100, later(6))).toBe('missing_ingredients');
    expect((await recipeDetail(db, USER, id))?.yield).toEqual({
      mode: 'weight',
      cookedWeightG: 200,
    });
    expect(await valuesOf(id)).toEqual(before);
  });
});

describe('ingredientValues (anteprima dell’editor)', () => {
  it('legge i valori anche di un ingrediente eliminato, come il calcolo salvato', async () => {
    await deleteFood(db, USER, oats, later(1));
    const { values, missing } = await ingredientValues(db, [oats, 'albume-crudo']);
    expect(values[oats]).toMatchObject({ energy_kcal: 372, protein_g: 13.5 });
    expect(values['albume-crudo']).toMatchObject({ protein_g: 10.9 });
    expect(missing).toEqual([]);
  });

  it('segnala gli ingredienti che non sono più nel catalogo', async () => {
    const { values, missing } = await ingredientValues(db, ['sparito', oats]);
    expect(missing).toEqual(['sparito']);
    expect(values).not.toHaveProperty('sparito');
    expect(values[oats]).toBeDefined();
  });
});

describe('updateFood e deleteFood non toccano le ricette', () => {
  it('updateFood su una ricetta dà false e i valori restano', async () => {
    const id = await pancake();
    const before = await valuesOf(id);
    expect(await updateFood(db, USER, id, { ...OATS, name: 'Rubata' }, later(1))).toBe(false);
    expect(await valuesOf(id)).toEqual(before);
    expect((await recipeDetail(db, USER, id))?.name).toBe('Pancake proteici');
  });

  it('deleteFood su una ricetta non la elimina', async () => {
    const id = await pancake();
    await deleteFood(db, USER, id, later(1));
    expect(await recipes(db, USER)).toHaveLength(1);
    expect(await getFood(db, id)).not.toBeNull();
  });
});

describe('updateRecipe', () => {
  it('sostituisce nome, resa e ingredienti, e ricalcola', async () => {
    const id = await pancake();
    const [slot] = await ensureMealSlots(db, USER, NOW);
    const food = await getFood(db, id);
    if (food === null) throw new Error('ricetta non salvata');
    await setFavorite(db, USER, food, true, NOW);
    expect(slot).toBeDefined();

    const done = await updateRecipe(
      db,
      USER,
      id,
      {
        name: 'Pancake light',
        yield: { mode: 'weight', cookedWeightG: 200 },
        items: [{ foodId: oats, gramsRaw: 100 }],
      },
      later(1),
    );
    expect(done).toBe(true);
    const detail = await recipeDetail(db, USER, id);
    expect(detail).toMatchObject({
      name: 'Pancake light',
      yield: { mode: 'weight', cookedWeightG: 200 },
      totalWeightG: 200,
      servingG: null,
    });
    expect(detail?.items.map((item) => item.foodId)).toEqual([oats]);
    expect((await valuesOf(id)).protein_g?.amountPer100).toBeCloseTo(6.75, 6);
    expect((await searchFoods(db, 'light', USER)).map((hit) => hit.id)).toEqual([id]);
    expect(await searchFoods(db, 'proteici', USER)).toEqual([]);
    expect((await favorites(db, USER)).map((f) => f.foodName)).toEqual(['Pancake light']);
    // I vecchi ingredienti restano nello storico, in cancellazione logica.
    const rows = await db.getAllAsync<{ n: number }>(
      'SELECT count(*) AS n FROM recipe_item WHERE recipe_id = ? AND deleted_at IS NOT NULL',
      id,
    );
    expect(rows[0]?.n).toBe(2);
  });

  it('non tocca la ricetta di un altro utente o eliminata', async () => {
    const id = await pancake();
    expect(await updateRecipe(db, OTHER, id, PANCAKE([]), later(1))).toBe(false);
    expect(await updateRecipe(db, USER, 'inesistente', PANCAKE([]), later(1))).toBe(false);
    expect((await recipeDetail(db, USER, id))?.items).toHaveLength(2);
    await deleteRecipe(db, USER, id, later(2));
    expect(await updateRecipe(db, USER, id, PANCAKE([]), later(3))).toBe(false);
  });

  it('una modifica rifiutata lascia la ricetta com’era', async () => {
    const id = await pancake();
    await expect(
      updateRecipe(db, USER, id, PANCAKE([{ foodId: oats, gramsRaw: -1 }]), later(1)),
    ).rejects.toThrow(/recipe_item_grams_positive/);
    expect((await recipeDetail(db, USER, id))?.items).toHaveLength(2);
  });
});

describe('setCookedWeight (RF-23)', () => {
  async function tray(): Promise<string> {
    return createRecipe(
      db,
      USER,
      {
        name: 'Teglia di pollo',
        yield: { mode: 'weight', cookedWeightG: 250 },
        items: [
          { foodId: 'albume-crudo', gramsRaw: 200 },
          { foodId: oats, gramsRaw: 50 },
        ],
      },
      NOW,
    );
  }

  async function itemRows(id: string) {
    return db.getAllAsync('SELECT * FROM recipe_item WHERE recipe_id = ? ORDER BY id', id);
  }

  it('cambia il peso cotto e i valori per 100 g, senza riscrivere gli ingredienti', async () => {
    const id = await tray();
    const items = await itemRows(id);
    const kcal = (await valuesOf(id)).energy_kcal?.amountPer100 ?? 0;
    expect(await setCookedWeight(db, USER, id, 200, later(1))).toBe('updated');
    expect((await recipeDetail(db, USER, id))?.yield).toEqual({
      mode: 'weight',
      cookedWeightG: 200,
    });
    expect((await valuesOf(id)).energy_kcal?.amountPer100).toBeCloseTo((kcal * 250) / 200, 6);
    expect(await itemRows(id)).toEqual(items);
    const [food] = await db.getAllAsync<{ updated_at: string }>(
      'SELECT updated_at FROM food WHERE id = ?',
      id,
    );
    expect(food?.updated_at).toBe(later(1).toISOString());
  });

  it('la voce registrata prima resta con i valori di allora (snapshot)', async () => {
    const id = await tray();
    const food = await getFood(db, id);
    if (food === null) throw new Error('ricetta non salvata');
    const [slot] = await ensureMealSlots(db, USER, NOW);
    await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: slot?.id ?? '',
      food,
      quantity: 150,
      now: NOW,
    });
    const before = await entriesForDay(db, USER, '2026-11-21');
    await setCookedWeight(db, USER, id, 180, later(1));
    expect(await entriesForDay(db, USER, '2026-11-21')).toEqual(before);
  });

  it('non tocca la ricetta di un altro utente, eliminata o a porzioni', async () => {
    const id = await tray();
    const before = await valuesOf(id);
    expect(await setCookedWeight(db, OTHER, id, 100, later(1))).toBe('not_found');
    expect((await recipeDetail(db, USER, id))?.yield).toEqual({
      mode: 'weight',
      cookedWeightG: 250,
    });
    expect(await valuesOf(id)).toEqual(before);
    const portions = await pancake();
    expect(await setCookedWeight(db, USER, portions, 100, later(1))).toBe('not_found');
    expect((await recipeDetail(db, USER, portions))?.yield.mode).toBe('portions');
    await deleteRecipe(db, USER, id, later(2));
    expect(await setCookedWeight(db, USER, id, 100, later(3))).toBe('not_found');
  });

  it('rifiuta un peso cotto non positivo', async () => {
    const id = await tray();
    await expect(setCookedWeight(db, USER, id, 0, later(1))).rejects.toThrow(
      /recipe_yield_complete/,
    );
  });
});

describe('duplicateRecipe e deleteRecipe', () => {
  it('duplica con il nome "(copia)" e gli stessi ingredienti', async () => {
    const id = await pancake();
    const copy = await duplicateRecipe(db, USER, id, later(1));
    expect(copy).not.toBeNull();
    const detail = await recipeDetail(db, USER, copy ?? '');
    expect(detail).toMatchObject({ name: 'Pancake proteici (copia)', servingG: 125 });
    expect(detail?.items.map((item) => [item.foodId, item.gramsRaw])).toEqual([
      ['albume-crudo', 200],
      [oats, 50],
    ]);
    expect(await valuesOf(copy ?? '')).toEqual({
      ...(await valuesOf(id)),
    });
    expect(await recipes(db, USER)).toHaveLength(2);
  });

  it('non duplica la ricetta di un altro utente', async () => {
    const id = await pancake();
    expect(await duplicateRecipe(db, OTHER, id, later(1))).toBeNull();
    expect(await recipes(db, OTHER)).toEqual([]);
  });

  it('eliminata sparisce da ricerca, elenco e preferiti; il diario resta', async () => {
    const id = await pancake();
    const food = await getFood(db, id);
    if (food === null) throw new Error('ricetta non salvata');
    await setFavorite(db, USER, food, true, NOW);
    const [slot] = await ensureMealSlots(db, USER, NOW);
    await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: slot?.id ?? '',
      food,
      quantity: 125,
      now: NOW,
    });
    await deleteRecipe(db, OTHER, id, later(1));
    expect(await recipes(db, USER)).toHaveLength(1);
    await deleteRecipe(db, USER, id, later(2));
    expect(await recipes(db, USER)).toEqual([]);
    expect(await searchFoods(db, 'pancake', USER)).toEqual([]);
    expect(await favorites(db, USER)).toEqual([]);
    expect(await recipeDetail(db, USER, id)).toBeNull();
    expect(await entriesForDay(db, USER, '2026-11-21')).toHaveLength(1);
  });
});

describe('recipeDetail e recipes', () => {
  it('non mostra le ricette degli altri e le elenca in ordine alfabetico', async () => {
    const id = await pancake();
    await createRecipe(db, USER, { ...PANCAKE([]), name: 'albicocche' }, NOW);
    await createRecipe(db, OTHER, { ...PANCAKE([]), name: 'Zuppa' }, NOW);
    expect(await recipeDetail(db, OTHER, id)).toBeNull();
    expect((await recipes(db, USER)).map((r) => r.name)).toEqual([
      'albicocche',
      'Pancake proteici',
    ]);
    expect((await recipes(db, USER))[0]?.kcalPer100).toBeNull();
  });
});

describe('recipesContaining (nessun giro nelle ricette)', () => {
  it('trova le ricette che contengono quella, direttamente e a catena', async () => {
    const inner = await pancake();
    const middle = await createRecipe(
      db,
      USER,
      {
        name: 'Colazione',
        yield: { mode: 'portions', portions: 1 },
        items: [{ foodId: inner, gramsRaw: 100 }],
      },
      NOW,
    );
    const outer = await createRecipe(
      db,
      USER,
      {
        name: 'Settimana',
        yield: { mode: 'portions', portions: 1 },
        items: [{ foodId: middle, gramsRaw: 100 }],
      },
      NOW,
    );
    expect((await recipesContaining(db, inner)).sort()).toEqual([middle, outer].sort());
    expect(await recipesContaining(db, outer)).toEqual([]);
  });

  it('ignora gli ingredienti tolti e non si perde in un giro già presente', async () => {
    const a = await pancake();
    const b = await createRecipe(
      db,
      USER,
      { name: 'B', yield: { mode: 'portions', portions: 1 }, items: [{ foodId: a, gramsRaw: 10 }] },
      NOW,
    );
    expect(await recipesContaining(db, a)).toEqual([b]);
    // Tolta dalla ricetta B, A non la contiene più.
    await updateRecipe(
      db,
      USER,
      b,
      {
        name: 'B',
        yield: { mode: 'portions', portions: 1 },
        items: [{ foodId: oats, gramsRaw: 10 }],
      },
      later(1),
    );
    expect(await recipesContaining(db, a)).toEqual([]);
    // Un giro (A in B e B in A) che il database non vieta: la ricerca termina.
    await updateRecipe(
      db,
      USER,
      b,
      { name: 'B', yield: { mode: 'portions', portions: 1 }, items: [{ foodId: a, gramsRaw: 10 }] },
      later(2),
    );
    await db.runAsync(
      `INSERT INTO recipe_item (id, user_id, recipe_id, ingredient_food_id, grams_raw, position, created_at, updated_at)
       VALUES ('loop', ?, ?, ?, 5, 9, 'a', 'a')`,
      USER,
      a,
      b,
    );
    expect((await recipesContaining(db, a)).sort()).toEqual([a, b].sort());
  });
});
