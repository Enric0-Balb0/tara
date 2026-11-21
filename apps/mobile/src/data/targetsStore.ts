/**
 * Tipi di giornata, target e tipo assegnato a ogni giorno (RF-50, RF-51, RF-53) sul telefono.
 * Come il diario: righe dell'utente, cancellazioni logiche, pronte per la sincronizzazione.
 */

import { newId } from '@/domain/ids';
import { DEFAULT_DAY_TYPES, type MacroTargets, targetFor } from '@/domain/targets';

import type { SqlDatabase } from './sql';

export interface DayType {
  id: string;
  name: string;
  position: number;
}

export interface DayTarget extends MacroTargets {
  id: string;
  dayTypeId: string;
  validFrom: string;
}

async function activeTypes(db: SqlDatabase, userId: string): Promise<DayType[]> {
  return db.getAllAsync<DayType>(
    `SELECT id, name, position FROM day_type
     WHERE user_id = ? AND deleted_at IS NULL ORDER BY position, id`,
    userId,
  );
}

/** I tipi di giornata dell'utente; la prima volta crea Allenamento e Riposo. */
export async function ensureDayTypes(
  db: SqlDatabase,
  userId: string,
  now: Date,
): Promise<DayType[]> {
  const existing = await activeTypes(db, userId);
  if (existing.length > 0) return existing;
  // Una sola istruzione atomica, come per i pasti (diaryStore): niente doppioni, niente
  // transazione esclusiva durante il download del catalogo.
  const rows = DEFAULT_DAY_TYPES.map((name, position) => [
    newId(now.getTime()),
    userId,
    name,
    position,
    now.toISOString(),
  ]);
  await db.runAsync(
    `INSERT INTO day_type (id, user_id, name, position, updated_at)
     SELECT column1, column2, column3, column4, column5
     FROM (VALUES ${rows.map(() => '(?, ?, ?, ?, ?)').join(', ')})
     WHERE NOT EXISTS (SELECT 1 FROM day_type WHERE user_id = ? AND deleted_at IS NULL)`,
    ...rows.flat(),
    userId,
  );
  return activeTypes(db, userId);
}

export async function addDayType(
  db: SqlDatabase,
  userId: string,
  name: string,
  now: Date,
): Promise<DayType> {
  const last = await db.getFirstAsync<{ position: number | null }>(
    'SELECT max(position) AS position FROM day_type WHERE user_id = ? AND deleted_at IS NULL',
    userId,
  );
  const type = {
    id: newId(now.getTime()),
    name: name.trim(),
    position: (last?.position ?? -1) + 1,
  };
  await db.runAsync(
    'INSERT INTO day_type (id, user_id, name, position, updated_at) VALUES (?, ?, ?, ?, ?)',
    type.id,
    userId,
    type.name,
    type.position,
    now.toISOString(),
  );
  return type;
}

export async function renameDayType(
  db: SqlDatabase,
  userId: string,
  id: string,
  name: string,
  now: Date,
): Promise<void> {
  await db.runAsync(
    `UPDATE day_type SET name = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    name.trim(),
    now.toISOString(),
    id,
    userId,
  );
}

/** Elimina un tipo; i giorni assegnati a lui tornano al primo tipo. L'ultimo non si elimina. */
export async function deleteDayType(
  db: SqlDatabase,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  const types = await activeTypes(db, userId);
  if (!types.some((type) => type.id === id)) return;
  if (types.length <= 1) throw new Error("Non si può eliminare l'ultimo tipo di giornata");
  await db.runAsync(
    'UPDATE day_type SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    now.toISOString(),
    now.toISOString(),
    id,
    userId,
  );
}

/** Il tipo del giorno: quello assegnato, se esiste ancora, altrimenti il primo. */
export async function dayTypeFor(
  db: SqlDatabase,
  userId: string,
  date: string,
): Promise<string | undefined> {
  const assigned = await db.getFirstAsync<{ day_type_id: string }>(
    `SELECT p.day_type_id FROM day_plan AS p
       JOIN day_type AS t ON t.id = p.day_type_id AND t.deleted_at IS NULL
     WHERE p.user_id = ? AND p.date = ? AND p.deleted_at IS NULL`,
    userId,
    date,
  );
  if (assigned) return assigned.day_type_id;
  const [first] = await activeTypes(db, userId);
  return first?.id;
}

async function ownsType(db: SqlDatabase, userId: string, dayTypeId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM day_type WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    dayTypeId,
    userId,
  );
  return row !== null;
}

/**
 * Fissa il tipo di un giorno che ancora non ne ha uno, con quello che vale adesso. Si chiama
 * per i giorni con voci registrate: così eliminare o riordinare i tipi dopo non cambia il
 * target con cui quei giorni sono stati confrontati (RF-53).
 */
export async function keepDayType(
  db: SqlDatabase,
  userId: string,
  date: string,
  now: Date,
): Promise<void> {
  const assigned = await db.getFirstAsync<{ id: string }>(
    `SELECT p.id FROM day_plan AS p
       JOIN day_type AS t ON t.id = p.day_type_id AND t.deleted_at IS NULL
     WHERE p.user_id = ? AND p.date = ? AND p.deleted_at IS NULL`,
    userId,
    date,
  );
  if (assigned) return;
  const current = await dayTypeFor(db, userId, date);
  if (current !== undefined) await setDayType(db, userId, date, current, now);
}

export async function setDayType(
  db: SqlDatabase,
  userId: string,
  date: string,
  dayTypeId: string,
  now: Date,
): Promise<void> {
  if (!(await ownsType(db, userId, dayTypeId))) return;
  const stamp = now.toISOString();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM day_plan WHERE user_id = ? AND date = ? AND deleted_at IS NULL',
    userId,
    date,
  );
  if (existing) {
    await db.runAsync(
      'UPDATE day_plan SET day_type_id = ?, updated_at = ? WHERE id = ?',
      dayTypeId,
      stamp,
      existing.id,
    );
    return;
  }
  await db.runAsync(
    'INSERT INTO day_plan (id, user_id, date, day_type_id, updated_at) VALUES (?, ?, ?, ?, ?)',
    newId(now.getTime()),
    userId,
    date,
    dayTypeId,
    stamp,
  );
}

interface TargetRow {
  id: string;
  day_type_id: string;
  valid_from: string;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

/**
 * Imposta il target di un tipo da un giorno in poi; se quel giorno ne ha già uno lo corregge,
 * così più modifiche nello stesso giorno non lasciano una storia di tentativi.
 */
export async function setTarget(
  db: SqlDatabase,
  userId: string,
  dayTypeId: string,
  validFrom: string,
  values: MacroTargets,
  now: Date,
): Promise<void> {
  if (!(await ownsType(db, userId, dayTypeId))) return;
  const stamp = now.toISOString();
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM day_type_target
     WHERE user_id = ? AND day_type_id = ? AND valid_from = ? AND deleted_at IS NULL`,
    userId,
    dayTypeId,
    validFrom,
  );
  if (existing) {
    await db.runAsync(
      `UPDATE day_type_target SET kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, updated_at = ?
       WHERE id = ?`,
      values.kcal,
      values.protein_g,
      values.carbs_g,
      values.fat_g,
      stamp,
      existing.id,
    );
    return;
  }
  await db.runAsync(
    `INSERT INTO day_type_target
       (id, user_id, day_type_id, valid_from, kcal, protein_g, carbs_g, fat_g, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(now.getTime()),
    userId,
    dayTypeId,
    validFrom,
    values.kcal,
    values.protein_g,
    values.carbs_g,
    values.fat_g,
    stamp,
  );
}

/** Il target del tipo in vigore in quella data (RF-53); undefined se non ce n'è uno. */
export async function targetOn(
  db: SqlDatabase,
  userId: string,
  dayTypeId: string,
  date: string,
): Promise<DayTarget | undefined> {
  const rows = await db.getAllAsync<TargetRow>(
    `SELECT id, day_type_id, valid_from, kcal, protein_g, carbs_g, fat_g FROM day_type_target
     WHERE user_id = ? AND day_type_id = ? AND valid_from <= ? AND deleted_at IS NULL`,
    userId,
    dayTypeId,
    date,
  );
  const row = targetFor(
    rows.map((r) => ({ ...r, validFrom: r.valid_from })),
    date,
  );
  return row
    ? {
        id: row.id,
        dayTypeId: row.day_type_id,
        validFrom: row.valid_from,
        kcal: row.kcal,
        protein_g: row.protein_g,
        carbs_g: row.carbs_g,
        fat_g: row.fat_g,
      }
    : undefined;
}
