/**
 * Velocità di registrazione (RF-44): alimenti recenti, preferiti e copia di voci da un altro
 * giorno. Copiare conta più che digitare: chi mangia sempre le stesse cose registra in un tocco.
 */

import type { BaseUnit, FoodState } from '@/domain/food';
import { newId } from '@/domain/ids';

import type { SqlDatabase } from './sql';

export interface QuickFood {
  foodId: string;
  foodName: string;
  foodState: FoodState;
}

export interface RecentFood extends QuickFood {
  lastQuantity: number;
  unit: BaseUnit;
}

/** Gli ultimi alimenti registrati, uno per alimento, con l'ultimo peso usato. */
export async function recentFoods(
  db: SqlDatabase,
  userId: string,
  limit: number,
): Promise<RecentFood[]> {
  // Per ogni alimento la voce più recente; poi gli alimenti dal più recente.
  return db.getAllAsync<RecentFood>(
    `SELECT e.food_id AS foodId, e.food_name AS foodName, e.food_state AS foodState,
            e.quantity AS lastQuantity, e.unit AS unit
     FROM diary_entry AS e
       JOIN meal_slot AS s ON s.id = e.meal_slot_id AND s.user_id = e.user_id AND s.deleted_at IS NULL
     WHERE e.user_id = ? AND e.deleted_at IS NULL
       AND e.id = (
         SELECT latest.id FROM diary_entry AS latest
         WHERE latest.user_id = e.user_id AND latest.food_id = e.food_id
           AND latest.deleted_at IS NULL
         ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
       )
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT ?`,
    userId,
    limit,
  );
}

export async function isFavorite(
  db: SqlDatabase,
  userId: string,
  foodId: string,
): Promise<boolean> {
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM favorite_food WHERE user_id = ? AND food_id = ? AND deleted_at IS NULL',
    userId,
    foodId,
  );
  return row !== null;
}

export async function setFavorite(
  db: SqlDatabase,
  userId: string,
  food: { id: string; name: string; state: FoodState },
  favorite: boolean,
  now: Date,
): Promise<void> {
  const stamp = now.toISOString();
  if (!favorite) {
    await db.runAsync(
      `UPDATE favorite_food SET deleted_at = ?, updated_at = ?
       WHERE user_id = ? AND food_id = ? AND deleted_at IS NULL`,
      stamp,
      stamp,
      userId,
      food.id,
    );
    return;
  }
  // Una sola istruzione: due tocchi non creano due preferiti.
  await db.runAsync(
    `INSERT INTO favorite_food (id, user_id, food_id, food_name, food_state, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM favorite_food WHERE user_id = ? AND food_id = ? AND deleted_at IS NULL
     )`,
    newId(now.getTime()),
    userId,
    food.id,
    food.name,
    food.state,
    stamp,
    stamp,
    userId,
    food.id,
  );
}

/** I preferiti in ordine alfabetico, come si cercano a occhio. */
export async function favorites(db: SqlDatabase, userId: string): Promise<QuickFood[]> {
  return db.getAllAsync<QuickFood>(
    `SELECT food_id AS foodId, food_name AS foodName, food_state AS foodState
     FROM favorite_food WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY food_name COLLATE NOCASE, food_id`,
    userId,
  );
}

/**
 * Copia le voci di un giorno (tutte, o di un pasto) in un altro, come voci nuove con gli stessi
 * pesi e valori. Le copie non confermano il piano: sono registrate a mano. Restituisce quante.
 */
export async function copyEntries(
  db: SqlDatabase,
  input: { userId: string; fromDate: string; toDate: string; mealSlotId?: string; now: Date },
): Promise<number> {
  const source = await db.getAllAsync<{ id: string }>(
    `SELECT e.id FROM diary_entry AS e
       JOIN meal_slot AS s ON s.id = e.meal_slot_id AND s.user_id = e.user_id AND s.deleted_at IS NULL
     WHERE e.user_id = ? AND e.date = ? AND e.deleted_at IS NULL
       AND (? IS NULL OR e.meal_slot_id = ?)
     ORDER BY s.position, e.created_at, e.id`,
    input.userId,
    input.fromDate,
    input.mealSlotId ?? null,
    input.mealSlotId ?? null,
  );
  if (source.length === 0) return 0;
  // Una sola istruzione, atomica: una copia riesce tutta o per niente, così "Riprova" dopo un
  // errore non duplica le voci già copiate. Un millisecondo in più per voce tiene l'ordine.
  const rows = source.map(({ id }, index) => [
    newId(input.now.getTime() + index),
    id,
    new Date(input.now.getTime() + index).toISOString(),
  ]);
  await db.runAsync(
    `INSERT INTO diary_entry (id, user_id, date, meal_slot_id, food_id, food_name, food_state,
       quantity, unit, nutrients_snapshot, plan_item_id, created_at, updated_at)
     SELECT v.column1, e.user_id, ?, e.meal_slot_id, e.food_id, e.food_name, e.food_state,
            e.quantity, e.unit, e.nutrients_snapshot, NULL, v.column3, v.column3
     FROM (VALUES ${rows.map(() => '(?, ?, ?)').join(', ')}) AS v
       JOIN diary_entry AS e ON e.id = v.column2`,
    input.toDate,
    ...rows.flat(),
  );
  return source.length;
}
