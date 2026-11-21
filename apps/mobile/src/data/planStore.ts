/**
 * Piano alimentare per tipo di giornata (RF-130): per ogni tipo e pasto gli alimenti con i
 * grammi. In Oggi le voci del piano non ancora confermate quel giorno sono "previste"; una
 * conferma crea la voce del diario con plan_item_id.
 */

import type { BaseUnit, FoodState } from '@/domain/food';
import { type NutrientSnapshot, snapshotFrom } from '@/domain/diary';
import { newId } from '@/domain/ids';

import { addEntry, type DiaryEntry, type EntryFood } from './diaryStore';
import type { SqlDatabase } from './sql';

export interface PlanItem {
  id: string;
  dayTypeId: string;
  mealSlotId: string;
  foodId: string;
  foodName: string;
  foodState: FoodState;
  quantity: number;
  unit: BaseUnit;
  snapshot: NutrientSnapshot;
}

interface PlanRow {
  id: string;
  day_type_id: string;
  meal_slot_id: string;
  food_id: string;
  food_name: string;
  food_state: FoodState;
  quantity: number;
  unit: BaseUnit;
  nutrients_snapshot: string;
}

const COLUMNS = `p.id, p.day_type_id, p.meal_slot_id, p.food_id, p.food_name, p.food_state,
  p.quantity, p.unit, p.nutrients_snapshot`;

function toItem(row: PlanRow): PlanItem {
  return {
    id: row.id,
    dayTypeId: row.day_type_id,
    mealSlotId: row.meal_slot_id,
    foodId: row.food_id,
    foodName: row.food_name,
    foodState: row.food_state,
    quantity: row.quantity,
    unit: row.unit,
    snapshot: JSON.parse(row.nutrients_snapshot) as NutrientSnapshot,
  };
}

export async function addPlanItem(
  db: SqlDatabase,
  input: {
    userId: string;
    dayTypeId: string;
    mealSlotId: string;
    food: EntryFood;
    quantity: number;
    now: Date;
  },
): Promise<PlanItem> {
  // Tipo e pasto devono essere dell'utente: il riferimento da solo non lo garantisce.
  const owned = await db.getFirstAsync<{ n: number }>(
    `SELECT
       (SELECT count(*) FROM day_type WHERE id = ? AND user_id = ? AND deleted_at IS NULL) +
       (SELECT count(*) FROM meal_slot WHERE id = ? AND user_id = ? AND deleted_at IS NULL) AS n`,
    input.dayTypeId,
    input.userId,
    input.mealSlotId,
    input.userId,
  );
  if (owned?.n !== 2) throw new Error('Tipo di giornata o pasto non trovato');
  const stamp = input.now.toISOString();
  const row: PlanRow = {
    id: newId(input.now.getTime()),
    day_type_id: input.dayTypeId,
    meal_slot_id: input.mealSlotId,
    food_id: input.food.id,
    food_name: input.food.name,
    food_state: input.food.state,
    quantity: input.quantity,
    unit: input.food.baseUnit,
    nutrients_snapshot: JSON.stringify(snapshotFrom(input.food.nutrients)),
  };
  await db.runAsync(
    `INSERT INTO plan_item (id, user_id, day_type_id, meal_slot_id, food_id, food_name, food_state,
       quantity, unit, nutrients_snapshot, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    input.userId,
    row.day_type_id,
    row.meal_slot_id,
    row.food_id,
    row.food_name,
    row.food_state,
    row.quantity,
    row.unit,
    row.nutrients_snapshot,
    stamp,
    stamp,
  );
  return toItem(row);
}

/** Il piano di un tipo di giornata, nell'ordine dei pasti e poi di inserimento. */
export async function planFor(
  db: SqlDatabase,
  userId: string,
  dayTypeId: string,
): Promise<PlanItem[]> {
  const rows = await db.getAllAsync<PlanRow>(
    `SELECT ${COLUMNS} FROM plan_item AS p
       JOIN meal_slot AS s ON s.id = p.meal_slot_id AND s.deleted_at IS NULL
     WHERE p.user_id = ? AND p.day_type_id = ? AND p.deleted_at IS NULL
     ORDER BY s.position, p.created_at, p.id`,
    userId,
    dayTypeId,
  );
  return rows.map(toItem);
}

export async function updatePlanQuantity(
  db: SqlDatabase,
  userId: string,
  id: string,
  quantity: number,
  now: Date,
): Promise<void> {
  await db.runAsync(
    `UPDATE plan_item SET quantity = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    quantity,
    now.toISOString(),
    id,
    userId,
  );
}

export async function deletePlanItem(
  db: SqlDatabase,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  const stamp = now.toISOString();
  await db.runAsync(
    `UPDATE plan_item SET deleted_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    stamp,
    stamp,
    id,
    userId,
  );
}

/** Le voci del piano del tipo non ancora confermate in quella data: le voci previste. */
export async function pendingPlan(
  db: SqlDatabase,
  userId: string,
  date: string,
  dayTypeId: string,
): Promise<PlanItem[]> {
  const rows = await db.getAllAsync<PlanRow>(
    `SELECT ${COLUMNS} FROM plan_item AS p
       JOIN meal_slot AS s ON s.id = p.meal_slot_id AND s.deleted_at IS NULL
     WHERE p.user_id = ? AND p.day_type_id = ? AND p.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM diary_entry AS e
         WHERE e.user_id = p.user_id AND e.date = ? AND e.plan_item_id = p.id
           AND e.deleted_at IS NULL
       )
     ORDER BY s.position, p.created_at, p.id`,
    userId,
    dayTypeId,
    date,
  );
  return rows.map(toItem);
}

/** Conferma una voce prevista: la registra nel diario con i grammi scelti (anche diversi). */
export async function confirmPlanItem(
  db: SqlDatabase,
  input: { userId: string; date: string; item: PlanItem; quantity: number; now: Date },
): Promise<DiaryEntry> {
  const { item } = input;
  return addEntry(db, {
    userId: input.userId,
    date: input.date,
    mealSlotId: item.mealSlotId,
    food: {
      id: item.foodId,
      name: item.foodName,
      state: item.foodState,
      baseUnit: item.unit,
      nutrients: Object.entries(item.snapshot).map(([code, value]) => ({
        code,
        amountPer100: value.amount,
        provenance: value.provenance,
        confidence: value.confidence,
      })),
    },
    quantity: input.quantity,
    now: input.now,
    planItemId: item.id,
  });
}
