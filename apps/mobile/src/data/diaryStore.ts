/**
 * Diario sul telefono (RF-40, RF-42, RF-43): pasti dell'utente e voci per giorno. Ogni
 * riga è dell'utente che l'ha scritta e si cancella solo logicamente (deleted_at), così la
 * sincronizzazione potrà portare anche le cancellazioni.
 */

import type { BaseUnit, FoodState } from '@/domain/food';
import {
  DEFAULT_MEAL_SLOTS,
  type NutrientSnapshot,
  snapshotFrom,
  type SlotRef,
} from '@/domain/diary';
import { newId } from '@/domain/ids';

import type { SqlDatabase } from './sql';

export type MealSlot = SlotRef;

interface MealSlotRow {
  id: string;
  name: string;
  position: number;
  expected_time: string | null;
}

async function activeSlots(db: SqlDatabase, userId: string): Promise<MealSlot[]> {
  const rows = await db.getAllAsync<MealSlotRow>(
    `SELECT id, name, position, expected_time FROM meal_slot
     WHERE user_id = ? AND deleted_at IS NULL ORDER BY position, id`,
    userId,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    expectedTime: row.expected_time,
  }));
}

/** I pasti dell'utente; la prima volta crea quelli predefiniti. */
export async function ensureMealSlots(
  db: SqlDatabase,
  userId: string,
  now: Date,
): Promise<MealSlot[]> {
  const existing = await activeSlots(db, userId);
  if (existing.length > 0) return existing;
  // Una sola istruzione, atomica da sola: se due schermate li chiedono insieme, la seconda
  // trova già i pasti e non ne aggiunge altri. Niente transazione esclusiva, che durante il
  // download del catalogo troverebbe il database occupato.
  const rows = DEFAULT_MEAL_SLOTS.map((slot, position) => [
    newId(now.getTime()),
    userId,
    slot.name,
    position,
    slot.time,
    now.toISOString(),
  ]);
  await db.runAsync(
    `INSERT INTO meal_slot (id, user_id, name, position, expected_time, updated_at)
     SELECT column1, column2, column3, column4, column5, column6
     FROM (VALUES ${rows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')})
     WHERE NOT EXISTS (
       SELECT 1 FROM meal_slot WHERE user_id = ? AND deleted_at IS NULL
     )`,
    ...rows.flat(),
    userId,
  );
  return activeSlots(db, userId);
}

export interface DiaryEntry {
  id: string;
  date: string;
  mealSlotId: string;
  foodId: string;
  foodName: string;
  foodState: FoodState;
  quantity: number;
  unit: BaseUnit;
  snapshot: NutrientSnapshot;
  /** La voce del piano che questa voce conferma (RF-130); null se registrata a mano. */
  planItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EntryRow {
  id: string;
  date: string;
  meal_slot_id: string;
  food_id: string;
  food_name: string;
  food_state: FoodState;
  quantity: number;
  unit: BaseUnit;
  nutrients_snapshot: string;
  plan_item_id: string | null;
  created_at: string;
  updated_at: string;
}

function toEntry(row: EntryRow): DiaryEntry {
  return {
    id: row.id,
    date: row.date,
    mealSlotId: row.meal_slot_id,
    foodId: row.food_id,
    foodName: row.food_name,
    foodState: row.food_state,
    quantity: row.quantity,
    unit: row.unit,
    snapshot: JSON.parse(row.nutrients_snapshot) as NutrientSnapshot,
    planItemId: row.plan_item_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** L'alimento come serve al diario: nome, stato, unità e valori per 100 noti. */
export interface EntryFood {
  id: string;
  name: string;
  state: FoodState;
  baseUnit: BaseUnit;
  nutrients: readonly {
    code: string;
    amountPer100: number;
    provenance: string;
    confidence: number;
  }[];
}

export async function addEntry(
  db: SqlDatabase,
  input: {
    userId: string;
    date: string;
    mealSlotId: string;
    food: EntryFood;
    quantity: number;
    now: Date;
    /** La voce del piano confermata da questa voce, se c'è. */
    planItemId?: string;
  },
): Promise<DiaryEntry> {
  const stamp = input.now.toISOString();
  const row: EntryRow = {
    id: newId(input.now.getTime()),
    date: input.date,
    meal_slot_id: input.mealSlotId,
    food_id: input.food.id,
    food_name: input.food.name,
    food_state: input.food.state,
    quantity: input.quantity,
    unit: input.food.baseUnit,
    nutrients_snapshot: JSON.stringify(snapshotFrom(input.food.nutrients)),
    plan_item_id: input.planItemId ?? null,
    created_at: stamp,
    updated_at: stamp,
  };
  await db.runAsync(
    `INSERT INTO diary_entry (id, user_id, date, meal_slot_id, food_id, food_name, food_state,
       quantity, unit, nutrients_snapshot, plan_item_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    input.userId,
    row.date,
    row.meal_slot_id,
    row.food_id,
    row.food_name,
    row.food_state,
    row.quantity,
    row.unit,
    row.nutrients_snapshot,
    row.plan_item_id,
    row.created_at,
    row.updated_at,
  );
  return toEntry(row);
}

/**
 * Le voci di un giorno, nell'ordine dei pasti e poi di inserimento. Le voci di un pasto
 * eliminato restano fuori: non comparirebbero in nessun pasto ma conterebbero nei totali.
 */
export async function entriesForDay(
  db: SqlDatabase,
  userId: string,
  date: string,
): Promise<DiaryEntry[]> {
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT e.id, e.date, e.meal_slot_id, e.food_id, e.food_name, e.food_state, e.quantity,
            e.unit, e.nutrients_snapshot, e.plan_item_id, e.created_at, e.updated_at
     FROM diary_entry AS e
       JOIN meal_slot AS s
         ON s.id = e.meal_slot_id AND s.user_id = e.user_id AND s.deleted_at IS NULL
     WHERE e.user_id = ? AND e.date = ? AND e.deleted_at IS NULL
     ORDER BY s.position, e.created_at, e.id`,
    userId,
    date,
  );
  return rows.map(toEntry);
}

export async function updateEntryQuantity(
  db: SqlDatabase,
  userId: string,
  id: string,
  quantity: number,
  now: Date,
): Promise<void> {
  await db.runAsync(
    `UPDATE diary_entry SET quantity = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    quantity,
    now.toISOString(),
    id,
    userId,
  );
}

export async function deleteEntry(
  db: SqlDatabase,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  const stamp = now.toISOString();
  await db.runAsync(
    `UPDATE diary_entry SET deleted_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    stamp,
    stamp,
    id,
    userId,
  );
}

/** L'ultimo peso registrato per l'alimento in quel pasto (RF-42); null se non c'è. */
export async function lastQuantity(
  db: SqlDatabase,
  userId: string,
  foodId: string,
  mealSlotId: string,
): Promise<number | null> {
  const row = await db.getFirstAsync<{ quantity: number }>(
    `SELECT quantity FROM diary_entry
     WHERE user_id = ? AND food_id = ? AND meal_slot_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    userId,
    foodId,
    mealSlotId,
  );
  return row?.quantity ?? null;
}
