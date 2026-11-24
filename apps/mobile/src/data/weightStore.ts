/**
 * Peso (RF-70): una pesata al giorno per utente, in chili. Righe dell'utente con
 * cancellazione logica, come il diario.
 */

import { newId } from '@/domain/ids';
import type { WeightPoint } from '@/domain/weight';

import type { SqlDatabase } from './sql';

/** Imposta la pesata del giorno: se c'è già la aggiorna, altrimenti la crea. */
export async function setWeight(
  db: SqlDatabase,
  userId: string,
  date: string,
  kg: number,
  now: Date,
): Promise<void> {
  const stamp = now.toISOString();
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `UPDATE weight_entry SET kg = ?, updated_at = ?
       WHERE user_id = ? AND date = ? AND deleted_at IS NULL`,
      kg,
      stamp,
      userId,
      date,
    );
    if (result.changes > 0) return;
    await db.runAsync(
      `INSERT INTO weight_entry (id, user_id, date, kg, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      newId(now.getTime()),
      userId,
      date,
      kg,
      stamp,
      stamp,
    );
  });
}

/** Cancella la pesata del giorno; false se non c'era. */
export async function deleteWeight(
  db: SqlDatabase,
  userId: string,
  date: string,
  now: Date,
): Promise<boolean> {
  const stamp = now.toISOString();
  const result = await db.runAsync(
    `UPDATE weight_entry SET deleted_at = ?, updated_at = ?
     WHERE user_id = ? AND date = ? AND deleted_at IS NULL`,
    stamp,
    stamp,
    userId,
    date,
  );
  return result.changes > 0;
}

/** Le pesate tra due date (comprese), dalla più vecchia. */
export function weights(
  db: SqlDatabase,
  userId: string,
  fromDate: string,
  toDate: string,
): Promise<WeightPoint[]> {
  return db.getAllAsync<WeightPoint>(
    `SELECT date, kg FROM weight_entry
     WHERE user_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
     ORDER BY date`,
    userId,
    fromDate,
    toDate,
  );
}

/** Le ultime `limit` pesate, dalla più recente. */
export function latestWeights(
  db: SqlDatabase,
  userId: string,
  limit: number,
): Promise<WeightPoint[]> {
  return db.getAllAsync<WeightPoint>(
    `SELECT date, kg FROM weight_entry
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY date DESC LIMIT ?`,
    userId,
    limit,
  );
}
