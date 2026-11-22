/**
 * Acqua (RF-60, RF-61): le aggiunte del giorno, il target per tipo di giornata e gli
 * incrementi dei pulsanti. Righe dell'utente con cancellazione logica, come il diario.
 */

import { newId } from '@/domain/ids';
import { DEFAULT_INCREMENTS, validIncrements } from '@/domain/water';

import type { SqlDatabase } from './sql';

const INCREMENTS_KEY = 'water_increments';

export async function addWater(
  db: SqlDatabase,
  userId: string,
  date: string,
  ml: number,
  now: Date,
): Promise<void> {
  const stamp = now.toISOString();
  await db.runAsync(
    `INSERT INTO water_entry (id, user_id, date, ml, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    newId(now.getTime()),
    userId,
    date,
    ml,
    stamp,
    stamp,
  );
}

/** Cancella l'ultima aggiunta del giorno; false se non ce n'era. */
export async function undoLastWater(
  db: SqlDatabase,
  userId: string,
  date: string,
  now: Date,
): Promise<boolean> {
  const stamp = now.toISOString();
  // Una sola istruzione: l'ultima per data di creazione (gli id UUIDv7 rompono i pari).
  const result = await db.runAsync(
    `UPDATE water_entry SET deleted_at = ?, updated_at = ?
     WHERE id = (
       SELECT id FROM water_entry
       WHERE user_id = ? AND date = ? AND deleted_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 1
     )`,
    stamp,
    stamp,
    userId,
    date,
  );
  return result.changes > 0;
}

/** I ml dell'ultima aggiunta del giorno (quella che "Annulla" toglie); null se non ce n'è. */
export async function lastWater(
  db: SqlDatabase,
  userId: string,
  date: string,
): Promise<number | null> {
  const row = await db.getFirstAsync<{ ml: number }>(
    `SELECT ml FROM water_entry
     WHERE user_id = ? AND date = ? AND deleted_at IS NULL
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    userId,
    date,
  );
  return row?.ml ?? null;
}

/** I ml bevuti nel giorno. */
export async function waterOn(db: SqlDatabase, userId: string, date: string): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT sum(ml) AS total FROM water_entry
     WHERE user_id = ? AND date = ? AND deleted_at IS NULL`,
    userId,
    date,
  );
  return row?.total ?? 0;
}

async function ownsType(db: SqlDatabase, userId: string, dayTypeId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM day_type WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    dayTypeId,
    userId,
  );
  return row !== null;
}

/** Il target dell'acqua del tipo, in ml; null se non c'è (o il tipo non è dell'utente). */
export async function waterTarget(
  db: SqlDatabase,
  userId: string,
  dayTypeId: string,
): Promise<number | null> {
  const row = await db.getFirstAsync<{ ml: number }>(
    `SELECT w.ml FROM day_type_water AS w
       JOIN day_type AS t ON t.id = w.day_type_id AND t.user_id = w.user_id
     WHERE w.user_id = ? AND w.day_type_id = ? AND w.deleted_at IS NULL
       AND t.deleted_at IS NULL`,
    userId,
    dayTypeId,
  );
  return row?.ml ?? null;
}

/** Imposta il target dell'acqua del tipo; null lo cancella. Un tipo altrui non si tocca. */
export async function setWaterTarget(
  db: SqlDatabase,
  userId: string,
  dayTypeId: string,
  ml: number | null,
  now: Date,
): Promise<void> {
  if (!(await ownsType(db, userId, dayTypeId))) return;
  const stamp = now.toISOString();
  if (ml === null) {
    await db.runAsync(
      `UPDATE day_type_water SET deleted_at = ?, updated_at = ?
       WHERE user_id = ? AND day_type_id = ? AND deleted_at IS NULL`,
      stamp,
      stamp,
      userId,
      dayTypeId,
    );
    return;
  }
  const result = await db.runAsync(
    `UPDATE day_type_water SET ml = ?, updated_at = ?
     WHERE user_id = ? AND day_type_id = ? AND deleted_at IS NULL`,
    ml,
    stamp,
    userId,
    dayTypeId,
  );
  if (result.changes > 0) return;
  await db.runAsync(
    `INSERT INTO day_type_water (id, user_id, day_type_id, ml, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    newId(now.getTime()),
    userId,
    dayTypeId,
    ml,
    stamp,
  );
}

/** Gli incrementi dei pulsanti; i predefiniti se mancano o il valore salvato non è valido. */
export async function waterIncrements(db: SqlDatabase, userId: string): Promise<number[]> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM user_setting WHERE user_id = ? AND key = ?',
    userId,
    INCREMENTS_KEY,
  );
  if (row) {
    try {
      const parsed: unknown = JSON.parse(row.value);
      if (
        Array.isArray(parsed) &&
        parsed.every((item): item is number => typeof item === 'number') &&
        validIncrements(parsed)
      ) {
        return parsed;
      }
    } catch {
      // Valore rovinato: si torna ai predefiniti.
    }
  }
  return [...DEFAULT_INCREMENTS];
}

export async function setWaterIncrements(
  db: SqlDatabase,
  userId: string,
  increments: readonly number[],
  now: Date,
): Promise<void> {
  if (!validIncrements(increments)) {
    throw new Error('Gli incrementi sono da uno a tre valori interi tra 50 e 2000 ml');
  }
  await db.runAsync(
    `INSERT INTO user_setting (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    userId,
    INCREMENTS_KEY,
    JSON.stringify(increments),
    now.toISOString(),
  );
}
