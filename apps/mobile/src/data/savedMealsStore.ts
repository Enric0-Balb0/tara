/**
 * Pasti salvati (RF-30, RF-31, RF-32): un elenco con nome di alimenti e quantità, da registrare
 * nel diario in un tocco. Ogni riga è dell'utente e si cancella solo logicamente. Le voci non
 * tengono i valori nutrizionali: registrando si leggono dall'alimento di adesso (snapshot).
 */

import type { BaseUnit, FoodState } from '@/domain/food';
import { newId } from '@/domain/ids';

import { getFood } from './catalogStore';
import { addEntry, entriesForDay } from './diaryStore';
import type { SqlDatabase } from './sql';

export interface SavedMealSummary {
  id: string;
  name: string;
  itemCount: number;
}

export interface SavedMealItemInput {
  foodId: string;
  foodName: string;
  foodState: FoodState;
  quantity: number;
  unit: BaseUnit;
}

export interface SavedMealItem extends SavedMealItemInput {
  id: string;
  position: number;
}

/** Il pasto salvato dalle voci non eliminate di un pasto del diario; null se non ce ne sono. */
export async function saveMealFromDiary(
  db: SqlDatabase,
  input: { userId: string; name: string; date: string; mealSlotId: string; now: Date },
): Promise<string | null> {
  const entries = (await entriesForDay(db, input.userId, input.date)).filter(
    (entry) => entry.mealSlotId === input.mealSlotId,
  );
  if (entries.length === 0) return null;
  return createSavedMeal(
    db,
    input.userId,
    input.name,
    entries.map((entry) => ({
      foodId: entry.foodId,
      foodName: entry.foodName,
      foodState: entry.foodState,
      quantity: entry.quantity,
      unit: entry.unit,
    })),
    input.now,
  );
}

export async function createSavedMeal(
  db: SqlDatabase,
  userId: string,
  name: string,
  items: readonly SavedMealItemInput[],
  now: Date,
): Promise<string> {
  const stamp = now.toISOString();
  const id = newId(now.getTime());
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO saved_meal (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      id,
      userId,
      name.trim(),
      stamp,
      stamp,
    );
    for (const [position, item] of items.entries()) {
      await db.runAsync(
        `INSERT INTO saved_meal_item (id, user_id, saved_meal_id, food_id, food_name, food_state,
           quantity, unit, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(now.getTime() + position),
        userId,
        id,
        item.foodId,
        item.foodName,
        item.foodState,
        item.quantity,
        item.unit,
        position,
        stamp,
        stamp,
      );
    }
  });
  return id;
}

/** I pasti salvati in ordine alfabetico, con quante voci hanno. */
export async function savedMeals(db: SqlDatabase, userId: string): Promise<SavedMealSummary[]> {
  return db.getAllAsync<SavedMealSummary>(
    `SELECT m.id, m.name,
            (SELECT COUNT(*) FROM saved_meal_item AS i
             WHERE i.saved_meal_id = m.id AND i.user_id = m.user_id AND i.deleted_at IS NULL
            ) AS itemCount
     FROM saved_meal AS m
     WHERE m.user_id = ? AND m.deleted_at IS NULL
     ORDER BY m.name COLLATE NOCASE, m.id`,
    userId,
  );
}

/** Le voci di un pasto salvato, nell'ordine in cui si registrano. */
export async function savedMealItems(
  db: SqlDatabase,
  userId: string,
  savedMealId: string,
): Promise<SavedMealItem[]> {
  return db.getAllAsync<SavedMealItem>(
    `SELECT i.id, i.food_id AS foodId, i.food_name AS foodName, i.food_state AS foodState,
            i.quantity, i.unit, i.position
     FROM saved_meal_item AS i
       JOIN saved_meal AS m ON m.id = i.saved_meal_id AND m.user_id = i.user_id
         AND m.deleted_at IS NULL
     WHERE i.saved_meal_id = ? AND i.user_id = ? AND i.deleted_at IS NULL
     ORDER BY i.position, i.id`,
    savedMealId,
    userId,
  );
}

export async function renameSavedMeal(
  db: SqlDatabase,
  userId: string,
  id: string,
  name: string,
  now: Date,
): Promise<void> {
  await db.runAsync(
    `UPDATE saved_meal SET name = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    name.trim(),
    now.toISOString(),
    id,
    userId,
  );
}

/** Elimina il pasto e le sue voci (logicamente). */
export async function deleteSavedMeal(
  db: SqlDatabase,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  const stamp = now.toISOString();
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `UPDATE saved_meal SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      stamp,
      stamp,
      id,
      userId,
    );
    if (result.changes === 0) return;
    await db.runAsync(
      `UPDATE saved_meal_item SET deleted_at = ?, updated_at = ?
       WHERE saved_meal_id = ? AND user_id = ? AND deleted_at IS NULL`,
      stamp,
      stamp,
      id,
      userId,
    );
  });
}

export async function updateSavedMealItem(
  db: SqlDatabase,
  userId: string,
  itemId: string,
  quantity: number,
  now: Date,
): Promise<void> {
  await db.runAsync(
    `UPDATE saved_meal_item SET quantity = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    quantity,
    now.toISOString(),
    itemId,
    userId,
  );
}

export async function removeSavedMealItem(
  db: SqlDatabase,
  userId: string,
  itemId: string,
  now: Date,
): Promise<void> {
  const stamp = now.toISOString();
  await db.runAsync(
    `UPDATE saved_meal_item SET deleted_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    stamp,
    stamp,
    itemId,
    userId,
  );
}

/**
 * Gli id tra `foodIds` il cui alimento non c'è o è eliminato: gli stessi che `logSavedMeal`
 * salta (`getFood` restituisce null), nell'ordine dato.
 */
export async function unavailableFoodIds(
  db: SqlDatabase,
  foodIds: readonly string[],
): Promise<string[]> {
  if (foodIds.length === 0) return [];
  const present = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM food WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))`,
    JSON.stringify(foodIds),
  );
  const alive = new Set(present.map((row) => row.id));
  return [...new Set(foodIds)].filter((id) => !alive.has(id));
}

/**
 * Registra il pasto nel diario con i valori di adesso di ogni alimento. `quantities` può
 * sostituire il peso di singole voci (per id) solo per questa registrazione. Le voci il cui
 * alimento non c'è più si saltano. Tutto o niente; un millisecondo in più per voce tiene
 * l'ordine del pasto. Un pasto salvato non dell'utente (o senza voci) registra 0. Lancia un
 * errore, senza scrivere niente, se il pasto del diario non è dell'utente o è eliminato, o se
 * una quantità non è un numero finito > 0 o non è di una voce del pasto salvato.
 * Restituisce quante voci ha registrato (le saltate sono le altre).
 */
export async function logSavedMeal(
  db: SqlDatabase,
  input: {
    userId: string;
    savedMealId: string;
    date: string;
    mealSlotId: string;
    quantities: Record<string, number>;
    now: Date;
  },
): Promise<number> {
  const items = await savedMealItems(db, input.userId, input.savedMealId);
  if (items.length === 0) return 0;
  const known = new Set(items.map((item) => item.id));
  for (const [itemId, quantity] of Object.entries(input.quantities)) {
    if (!known.has(itemId)) throw new Error(`Voce non nel pasto salvato: ${itemId}`);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Quantità non valida per la voce ${itemId}`);
    }
  }
  let logged = 0;
  await db.withTransactionAsync(async () => {
    const slot = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM meal_slot WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND archived_at IS NULL',
      input.mealSlotId,
      input.userId,
    );
    if (slot === null) throw new Error('Pasto non trovato per questo utente');
    for (const item of items) {
      const food = await getFood(db, item.foodId);
      if (food === null) continue;
      await addEntry(db, {
        userId: input.userId,
        date: input.date,
        mealSlotId: input.mealSlotId,
        food,
        quantity: input.quantities[item.id] ?? item.quantity,
        now: new Date(input.now.getTime() + logged),
      });
      logged += 1;
    }
  });
  return logged;
}
