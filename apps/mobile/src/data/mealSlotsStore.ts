/**
 * Pasti della giornata configurabili (RF-40): aggiungere, rinominare, dare un orario,
 * riordinare ed eliminare. Ogni scrittura verifica che il pasto sia dell'utente; un pasto con
 * voci di diario o di piano non si elimina, perché Oggi e Piano mostrano solo le voci dei
 * pasti attivi.
 */

import { newId } from '@/domain/ids';

import { ensureMealSlots, type MealSlot } from './diaryStore';
import type { SqlDatabase } from './sql';

export type MealSlotErrorCode = 'name' | 'duplicate' | 'time' | 'missing' | 'in_use' | 'last';

/** Un'operazione sui pasti rifiutata, con il motivo in `code`; non scrive nulla. */
export class MealSlotError extends Error {
  readonly code: MealSlotErrorCode;

  constructor(code: MealSlotErrorCode, message: string) {
    super(message);
    this.name = 'MealSlotError';
    this.code = code;
  }
}

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

function cleanName(name: string): string {
  const clean = name.trim();
  if (clean === '') throw new MealSlotError('name', 'Il pasto ha bisogno di un nome.');
  return clean;
}

function checkTime(time: string | null): string | null {
  if (time !== null && !TIME.test(time)) {
    throw new MealSlotError('time', 'L’orario va scritto come ore e minuti, per esempio 13:30.');
  }
  return time;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Il nome non può ripetersi tra i pasti attivi (senza maiuscole né spazi ai bordi). */
async function assertFreeName(
  db: SqlDatabase,
  userId: string,
  name: string,
  exceptId?: string,
  message = 'Esiste già un pasto con questo nome.',
): Promise<void> {
  const rows = await db.getAllAsync<{ id: string; name: string }>(
    'SELECT id, name FROM meal_slot WHERE user_id = ? AND deleted_at IS NULL AND archived_at IS NULL',
    userId,
  );
  if (rows.some((row) => row.id !== exceptId && sameName(row.name, name))) {
    throw new MealSlotError('duplicate', message);
  }
}

/** Aggiunge un pasto in coda all'elenco. */
export async function addMealSlot(
  db: SqlDatabase,
  userId: string,
  name: string,
  expectedTime: string | null,
  now: Date,
): Promise<MealSlot> {
  const clean = cleanName(name);
  const time = checkTime(expectedTime);
  // I predefiniti si creano prima, così un pasto aggiunto non li sostituisce.
  await ensureMealSlots(db, userId, now);
  await assertFreeName(db, userId, clean);
  const slot: MealSlot = { id: newId(now.getTime()), name: clean, position: 0, expectedTime: time };
  await db.runAsync(
    `INSERT INTO meal_slot (id, user_id, name, position, expected_time, updated_at)
     SELECT ?, ?, ?, coalesce(max(position), -1) + 1, ?, ?
     FROM meal_slot WHERE user_id = ? AND deleted_at IS NULL`,
    slot.id,
    userId,
    clean,
    time,
    now.toISOString(),
    userId,
  );
  const row = await db.getFirstAsync<{ position: number }>(
    'SELECT position FROM meal_slot WHERE id = ?',
    slot.id,
  );
  return { ...slot, position: row?.position ?? 0 };
}

async function update(
  db: SqlDatabase,
  userId: string,
  id: string,
  column: 'name' | 'expected_time',
  value: string | null,
  now: Date,
): Promise<void> {
  const result = await db.runAsync(
    `UPDATE meal_slot SET ${column} = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    value,
    now.toISOString(),
    id,
    userId,
  );
  if (result.changes === 0) throw new MealSlotError('missing', 'Il pasto non esiste più.');
}

export async function renameMealSlot(
  db: SqlDatabase,
  userId: string,
  id: string,
  name: string,
  now: Date,
): Promise<void> {
  const clean = cleanName(name);
  await assertFreeName(db, userId, clean, id);
  await update(db, userId, id, 'name', clean, now);
}

/** L'orario ("HH:MM") con cui il pasto viene proposto; null lo toglie. */
export async function setMealSlotTime(
  db: SqlDatabase,
  userId: string,
  id: string,
  expectedTime: string | null,
  now: Date,
): Promise<void> {
  await update(db, userId, id, 'expected_time', checkTime(expectedTime), now);
}

/** Scambia la posizione del pasto con quella del vicino; ai bordi non fa nulla. */
export async function moveMealSlot(
  db: SqlDatabase,
  userId: string,
  id: string,
  direction: 'up' | 'down',
  now: Date,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const slots = await db.getAllAsync<{ id: string; position: number }>(
      `SELECT id, position FROM meal_slot
       WHERE user_id = ? AND deleted_at IS NULL AND archived_at IS NULL ORDER BY position, id`,
      userId,
    );
    const index = slots.findIndex((slot) => slot.id === id);
    if (index < 0) throw new MealSlotError('missing', 'Il pasto non esiste più.');
    const neighbour = slots[direction === 'up' ? index - 1 : index + 1];
    const current = slots[index];
    if (neighbour === undefined || current === undefined) return;
    const stamp = now.toISOString();
    // Se due pasti avessero la stessa posizione lo scambio non cambierebbe nulla: si
    // riscrivono entrambe con l'ordine dell'elenco.
    const first = direction === 'up' ? neighbour : current;
    const second = direction === 'up' ? current : neighbour;
    const low = Math.min(first.position, second.position);
    const high = Math.max(first.position, second.position, low + 1);
    for (const [slotId, position] of [
      [second.id, low],
      [first.id, high],
    ] as const) {
      await db.runAsync(
        'UPDATE meal_slot SET position = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        position,
        stamp,
        slotId,
        userId,
      );
    }
  });
}

/**
 * Elimina il pasto (cancellazione logica). Si rifiuta se ha voci di diario o di piano non
 * eliminate, e se è l'ultimo rimasto.
 */
export async function deleteMealSlot(
  db: SqlDatabase,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const counts = await db.getFirstAsync<{ mine: number; others: number; used: number }>(
      `SELECT
         (SELECT count(*) FROM meal_slot WHERE id = ? AND user_id = ? AND deleted_at IS NULL) AS mine,
         (SELECT count(*) FROM meal_slot
          WHERE id <> ? AND user_id = ? AND deleted_at IS NULL AND archived_at IS NULL) AS others,
         (SELECT count(*) FROM diary_entry WHERE meal_slot_id = ? AND user_id = ? AND deleted_at IS NULL)
         + (SELECT count(*) FROM plan_item AS p
            JOIN day_type AS t ON t.id = p.day_type_id AND t.deleted_at IS NULL
            WHERE p.meal_slot_id = ? AND p.user_id = ? AND p.deleted_at IS NULL) AS used`,
      id,
      userId,
      id,
      userId,
      id,
      userId,
      id,
      userId,
    );
    if (!counts || counts.mine === 0) {
      throw new MealSlotError('missing', 'Il pasto non esiste più.');
    }
    if (counts.used > 0) {
      throw new MealSlotError(
        'in_use',
        'Il pasto ha voci nel diario o nel piano: non si può eliminare.',
      );
    }
    if (counts.others === 0) {
      throw new MealSlotError('last', 'Deve restare almeno un pasto.');
    }
    await db.runAsync(
      'UPDATE meal_slot SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      now.toISOString(),
      now.toISOString(),
      id,
      userId,
    );
  });
}

/** I pasti con voci di diario o di piano vive: questi non si eliminano, si archiviano. */
export async function slotsInUse(db: SqlDatabase, userId: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT s.id FROM meal_slot AS s
     WHERE s.user_id = ? AND s.deleted_at IS NULL
       AND (EXISTS (SELECT 1 FROM diary_entry AS e
                    WHERE e.meal_slot_id = s.id AND e.user_id = s.user_id AND e.deleted_at IS NULL)
         OR EXISTS (SELECT 1 FROM plan_item AS p
                    JOIN day_type AS t ON t.id = p.day_type_id AND t.user_id = p.user_id
                         AND t.deleted_at IS NULL
                    WHERE p.meal_slot_id = s.id AND p.user_id = s.user_id AND p.deleted_at IS NULL))`,
    userId,
  );
  return new Set(rows.map((row) => row.id));
}

/**
 * Archivia il pasto: sparisce dai pasti futuri (scheda alimento, ricerca, Piano, proposta
 * dall'ora), mentre i giorni con voci lo mostrano ancora. Non si archivia l'ultimo attivo.
 */
export async function archiveMealSlot(
  db: SqlDatabase,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const counts = await db.getFirstAsync<{ mine: number; others: number }>(
      `SELECT
         (SELECT count(*) FROM meal_slot
          WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND archived_at IS NULL) AS mine,
         (SELECT count(*) FROM meal_slot
          WHERE id <> ? AND user_id = ? AND deleted_at IS NULL AND archived_at IS NULL) AS others`,
      id,
      userId,
      id,
      userId,
    );
    if (!counts || counts.mine === 0) {
      throw new MealSlotError('missing', 'Il pasto non esiste più.');
    }
    if (counts.others === 0) throw new MealSlotError('last', 'Deve restare almeno un pasto.');
    await db.runAsync(
      'UPDATE meal_slot SET archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      now.toISOString(),
      now.toISOString(),
      id,
      userId,
    );
  });
}

/** Riporta un pasto archiviato tra gli attivi, in coda. */
export async function restoreMealSlot(
  db: SqlDatabase,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const slot = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM meal_slot
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND archived_at IS NOT NULL`,
      id,
      userId,
    );
    if (slot === null) throw new MealSlotError('missing', 'Il pasto non è archiviato.');
    await assertFreeName(
      db,
      userId,
      slot.name,
      id,
      'Esiste già un pasto attivo con questo nome: rinominalo, poi ripristina.',
    );
    await db.runAsync(
      `UPDATE meal_slot SET archived_at = NULL, updated_at = ?,
         position = (SELECT coalesce(max(position), -1) + 1 FROM meal_slot
                     WHERE user_id = ? AND deleted_at IS NULL)
       WHERE id = ? AND user_id = ?`,
      now.toISOString(),
      userId,
      id,
      userId,
    );
  });
}
