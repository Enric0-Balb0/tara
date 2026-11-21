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
  refreshRecipeValues,
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
          gramsRaw: 200,
        }),
        expect.objectContaining({ foodId: oats, foodName: 'Avena', gramsRaw: 50 }),
      ],
      totalWeightG: 250,
      servingG: 125,
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

  it('il ricalcolo di tutte le ricette salta quelle eliminate', async () => {
    const id = await pancake();
    await deleteRecipe(db, USER, id, later(1));
    await expect(refreshRecipeValues(db)).resolves.toBeUndefined();
    expect(await recipes(db, USER)).toEqual([]);
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
