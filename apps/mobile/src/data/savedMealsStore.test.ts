import { beforeEach, describe, expect, it } from 'vitest';

import { getFood, replaceCatalog } from './catalogStore';
import { addEntry, ensureMealSlots, entriesForDay, type EntryFood } from './diaryStore';
import { createFood, deleteFood, type PersonalFoodInput, updateFood } from './foodsStore';
import { createRecipe } from './recipesStore';
import {
  createSavedMeal,
  deleteSavedMeal,
  logSavedMeal,
  removeSavedMealItem,
  renameSavedMeal,
  saveMealFromDiary,
  savedMealItems,
  savedMeals,
  unavailableFoodIds,
  updateSavedMealItem,
} from './savedMealsStore';
import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
import { snapshotText } from './testing/snapshot';
import { openTestDatabase } from './testing/nodeDatabase';

const USER = '0195f1a2-0000-7000-8000-000000000001';
const OTHER = '0195f1a2-0000-7000-8000-000000000002';
const NOW = new Date('2026-11-21T12:30:00.000Z');
const DAY = '2026-11-21';
const TARGET_DAY = '2026-11-22';
const ms = (n: number) => new Date(NOW.getTime() + n);

const OATS: PersonalFoodInput = {
  name: 'Avena',
  brand: null,
  state: 'raw',
  baseUnit: 'g',
  values: { energy_kcal: 372, protein_g: 13.5, carbs_g: 60, fat_g: 7 },
};

const OATS_ITEM = {
  foodId: 'x',
  foodName: 'Avena',
  foodState: 'raw' as const,
  quantity: 50,
  unit: 'g' as const,
};

let db: SqlDatabase;
let oats: string;
let breakfast: string;
let lunch: string;

async function entryFood(id: string): Promise<EntryFood> {
  const food = await getFood(db, id);
  if (food === null) throw new Error('alimento mancante');
  return food;
}

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
  await replaceCatalog(db, snapshotText(), { etag: null, syncedAt: NOW.toISOString() });
  oats = await createFood(db, USER, OATS, NOW);
  const slots = await ensureMealSlots(db, USER, NOW);
  breakfast = slots[0]!.id;
  lunch = slots[1]!.id;
});

async function logDiary(foodId: string, quantity: number, slot: string, at: Date): Promise<void> {
  await addEntry(db, {
    userId: USER,
    date: DAY,
    mealSlotId: slot,
    food: await entryFood(foodId),
    quantity,
    now: at,
  });
}

function fromDiary(name: string, slot = breakfast) {
  return saveMealFromDiary(db, { userId: USER, name, date: DAY, mealSlotId: slot, now: NOW });
}

describe('saveMealFromDiary (RF-32)', () => {
  it("salva le voci di quel pasto e giorno nell'ordine del diario", async () => {
    await logDiary('albume-crudo', 200, breakfast, ms(0));
    await logDiary(oats, 50, breakfast, ms(5));
    await logDiary('albume-crudo', 100, lunch, ms(10));
    const id = await fromDiary('Colazione tipo');
    expect(id).not.toBeNull();
    const items = await savedMealItems(db, USER, id!);
    expect(items.map((i) => [i.foodId, i.quantity, i.unit, i.foodState])).toEqual([
      ['albume-crudo', 200, 'g', 'raw'],
      [oats, 50, 'g', 'raw'],
    ]);
    expect(items[0]!.foodName).toBe("Albume d'uovo");
    expect(items.map((i) => i.position)).toEqual([0, 1]);
  });

  it('non salva le voci eliminate e restituisce null se non ce ne sono', async () => {
    expect(await fromDiary('Vuoto')).toBeNull();
    await logDiary(oats, 50, breakfast, NOW);
    const [entry] = await entriesForDay(db, USER, DAY);
    await db.runAsync(
      'UPDATE diary_entry SET deleted_at = ? WHERE id = ?',
      NOW.toISOString(),
      entry!.id,
    );
    expect(await fromDiary('Vuoto')).toBeNull();
    expect(await savedMeals(db, USER)).toEqual([]);
  });

  it('un nome vuoto viene rifiutato dal vincolo e non lascia niente', async () => {
    await logDiary(oats, 50, breakfast, NOW);
    await expect(fromDiary('   ')).rejects.toThrow(/saved_meal_name_not_blank/);
    expect(await savedMeals(db, USER)).toEqual([]);
  });
});

describe('elenco e isolamento', () => {
  it('elenca i pasti in ordine alfabetico con il numero di voci', async () => {
    await createSavedMeal(db, USER, 'Zeta', [OATS_ITEM], NOW);
    await createSavedMeal(db, USER, 'alfa', [OATS_ITEM, { ...OATS_ITEM, quantity: 20 }], NOW);
    expect(await savedMeals(db, USER)).toEqual([
      expect.objectContaining({ name: 'alfa', itemCount: 2 }),
      expect.objectContaining({ name: 'Zeta', itemCount: 1 }),
    ]);
  });

  it('ogni utente vede e modifica solo i propri pasti', async () => {
    const id = await createSavedMeal(db, USER, 'Mio', [{ ...OATS_ITEM, foodId: oats }], NOW);
    expect(await savedMeals(db, OTHER)).toEqual([]);
    expect(await savedMealItems(db, OTHER, id)).toEqual([]);
    const [row] = await savedMealItems(db, USER, id);
    await renameSavedMeal(db, OTHER, id, 'Rubato', NOW);
    await deleteSavedMeal(db, OTHER, id, NOW);
    await updateSavedMealItem(db, OTHER, row!.id, 999, NOW);
    await removeSavedMealItem(db, OTHER, row!.id, NOW);
    expect(await savedMeals(db, USER)).toEqual([
      expect.objectContaining({ name: 'Mio', itemCount: 1 }),
    ]);
    expect((await savedMealItems(db, USER, id))[0]!.quantity).toBe(50);
    const logged = await logSavedMeal(db, {
      userId: OTHER,
      savedMealId: id,
      date: DAY,
      mealSlotId: breakfast,
      quantities: {},
      now: NOW,
    });
    expect(logged).toBe(0);
  });
});

describe('modifica', () => {
  it("rinomina, cambia la quantità di una voce e ne toglie un'altra", async () => {
    const id = await createSavedMeal(
      db,
      USER,
      'Colazione',
      [OATS_ITEM, { ...OATS_ITEM, quantity: 10 }],
      NOW,
    );
    const [first, second] = await savedMealItems(db, USER, id);
    await renameSavedMeal(db, USER, id, 'Colazione 2', NOW);
    await updateSavedMealItem(db, USER, first!.id, 75, NOW);
    await removeSavedMealItem(db, USER, second!.id, NOW);
    expect(await savedMeals(db, USER)).toEqual([
      expect.objectContaining({ name: 'Colazione 2', itemCount: 1 }),
    ]);
    expect((await savedMealItems(db, USER, id)).map((i) => i.quantity)).toEqual([75]);
  });

  it('elimina un pasto solo logicamente', async () => {
    const id = await createSavedMeal(db, USER, 'Colazione', [OATS_ITEM], NOW);
    await deleteSavedMeal(db, USER, id, NOW);
    expect(await savedMeals(db, USER)).toEqual([]);
    expect(await savedMealItems(db, USER, id)).toEqual([]);
    const row = await db.getFirstAsync<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM saved_meal WHERE id = ?',
      id,
    );
    expect(row?.deleted_at).toBe(NOW.toISOString());
  });
});

describe('logSavedMeal (RF-31)', () => {
  async function breakfastMeal(): Promise<string> {
    await logDiary('albume-crudo', 200, breakfast, ms(0));
    await logDiary(oats, 50, breakfast, ms(5));
    return (await fromDiary('Colazione'))!;
  }

  it("registra le voci con i valori di adesso, nell'ordine, con le quantità cambiate", async () => {
    const id = await breakfastMeal();
    const [, oatsItem] = await savedMealItems(db, USER, id);
    // L'alimento cambia dopo il salvataggio: la registrazione usa i valori attuali.
    await updateFood(
      db,
      USER,
      oats,
      { ...OATS, values: { ...OATS.values, energy_kcal: 400 } },
      ms(100),
    );
    const logged = await logSavedMeal(db, {
      userId: USER,
      savedMealId: id,
      date: TARGET_DAY,
      mealSlotId: lunch,
      quantities: { [oatsItem!.id]: 80 },
      now: ms(200),
    });
    expect(logged).toBe(2);
    const entries = await entriesForDay(db, USER, TARGET_DAY);
    expect(entries.map((e) => [e.foodId, e.quantity, e.mealSlotId])).toEqual([
      ['albume-crudo', 200, lunch],
      [oats, 80, lunch],
    ]);
    expect(JSON.stringify(entries[1]!.snapshot)).toContain('400');
    // Modificare l'alimento dopo non riscrive la voce registrata.
    await updateFood(
      db,
      USER,
      oats,
      { ...OATS, values: { ...OATS.values, energy_kcal: 111 } },
      ms(300),
    );
    const after = await entriesForDay(db, USER, TARGET_DAY);
    expect(JSON.stringify(after[1]!.snapshot)).toContain('400');
    expect(JSON.stringify(after[1]!.snapshot)).not.toContain('111');
    // Il pasto salvato non cambia: le quantità valgono solo per questa registrazione.
    expect((await savedMealItems(db, USER, id)).map((i) => i.quantity)).toEqual([200, 50]);
  });

  it('salta le voci il cui alimento è stato eliminato', async () => {
    const id = await breakfastMeal();
    await deleteFood(db, USER, oats, ms(100));
    const logged = await logSavedMeal(db, {
      userId: USER,
      savedMealId: id,
      date: TARGET_DAY,
      mealSlotId: lunch,
      quantities: {},
      now: ms(200),
    });
    expect(logged).toBe(1);
    const entries = await entriesForDay(db, USER, TARGET_DAY);
    expect(entries.map((e) => e.foodId)).toEqual(['albume-crudo']);
  });

  it('elenca gli alimenti che la registrazione salterebbe: eliminati o spariti', async () => {
    const id = await breakfastMeal();
    expect(await unavailableFoodIds(db, ['albume-crudo', oats])).toEqual([]);
    await deleteFood(db, USER, oats, ms(100));
    expect(await unavailableFoodIds(db, ['albume-crudo', oats, 'non-esiste'])).toEqual([
      oats,
      'non-esiste',
    ]);
    expect(await unavailableFoodIds(db, [])).toEqual([]);
    // Coerente con logSavedMeal: le voci segnalate sono quelle saltate.
    const logged = await logSavedMeal(db, {
      userId: USER,
      savedMealId: id,
      date: TARGET_DAY,
      mealSlotId: lunch,
      quantities: {},
      now: ms(200),
    });
    expect(logged).toBe(1);
  });

  it('rifiuta un pasto del diario di un altro utente o eliminato, senza scrivere', async () => {
    const id = await breakfastMeal();
    const foreign = (await ensureMealSlots(db, OTHER, NOW))[0]!.id;
    const call = (mealSlotId: string) =>
      logSavedMeal(db, {
        userId: USER,
        savedMealId: id,
        date: TARGET_DAY,
        mealSlotId,
        quantities: {},
        now: ms(200),
      });
    await expect(call(foreign)).rejects.toThrow(/Pasto non trovato/);
    await db.runAsync('UPDATE meal_slot SET deleted_at = ? WHERE id = ?', NOW.toISOString(), lunch);
    await expect(call(lunch)).rejects.toThrow(/Pasto non trovato/);
    expect(await entriesForDay(db, USER, TARGET_DAY)).toEqual([]);
  });

  it('rifiuta quantità non valide o di voci estranee prima di scrivere', async () => {
    const id = await breakfastMeal();
    const [first] = await savedMealItems(db, USER, id);
    const call = (quantities: Record<string, number>) =>
      logSavedMeal(db, {
        userId: USER,
        savedMealId: id,
        date: TARGET_DAY,
        mealSlotId: lunch,
        quantities,
        now: ms(200),
      });
    await expect(call({ [first!.id]: 0 })).rejects.toThrow(/Quantità non valida/);
    await expect(call({ [first!.id]: -5 })).rejects.toThrow(/Quantità non valida/);
    await expect(call({ [first!.id]: NaN })).rejects.toThrow(/Quantità non valida/);
    await expect(call({ [first!.id]: Infinity })).rejects.toThrow(/Quantità non valida/);
    await expect(call({ 'non-esiste': 10 })).rejects.toThrow(/Voce non nel pasto salvato/);
    expect(await entriesForDay(db, USER, TARGET_DAY)).toEqual([]);
  });

  it('registra anche una ricetta con i suoi valori attuali', async () => {
    const recipe = await createRecipe(
      db,
      USER,
      {
        name: 'Pancake',
        yield: { mode: 'portions', portions: 2 },
        items: [{ foodId: 'albume-crudo', gramsRaw: 200 }],
      },
      NOW,
    );
    const id = await createSavedMeal(
      db,
      USER,
      'Con ricetta',
      [
        {
          foodId: recipe,
          foodName: 'Pancake',
          foodState: 'not_applicable',
          quantity: 150,
          unit: 'g',
        },
      ],
      NOW,
    );
    const logged = await logSavedMeal(db, {
      userId: USER,
      savedMealId: id,
      date: TARGET_DAY,
      mealSlotId: lunch,
      quantities: {},
      now: ms(50),
    });
    expect(logged).toBe(1);
    const [entry] = await entriesForDay(db, USER, TARGET_DAY);
    expect(entry).toMatchObject({ foodId: recipe, foodName: 'Pancake', quantity: 150 });
    expect(Object.keys(entry!.snapshot).length).toBeGreaterThan(0);
  });
});

describe('vincoli', () => {
  function insertItem(state: string, quantity: number, unit: string) {
    return db.runAsync(
      `INSERT INTO saved_meal_item (id, user_id, saved_meal_id, food_id, food_name, food_state,
         quantity, unit, position, created_at, updated_at)
       VALUES ('i1', ?, 'm1', 'f', 'F', ?, ?, ?, 0, 'x', 'x')`,
      USER,
      state,
      quantity,
      unit,
    );
  }

  beforeEach(async () => {
    await db.runAsync(
      "INSERT INTO saved_meal (id, user_id, name, created_at, updated_at) VALUES ('m1', ?, 'M', 'x', 'x')",
      USER,
    );
  });

  it('rifiuta una quantità non positiva', async () => {
    await expect(insertItem('raw', 0, 'g')).rejects.toThrow(/saved_meal_item_quantity_positive/);
  });

  it('rifiuta uno stato non valido', async () => {
    await expect(insertItem('fritto', 10, 'g')).rejects.toThrow(/saved_meal_item_state_valid/);
  });

  it("rifiuta un'unità non valida", async () => {
    await expect(insertItem('raw', 10, 'kg')).rejects.toThrow(/saved_meal_item_unit_valid/);
  });
});
