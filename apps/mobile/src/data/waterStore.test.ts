import { beforeEach, describe, expect, it } from 'vitest';

import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
import { ensureDayTypes } from './targetsStore';
import { openTestDatabase } from './testing/nodeDatabase';
import {
  addWater,
  lastWater,
  setWaterIncrements,
  setWaterTarget,
  undoLastWater,
  waterIncrements,
  waterOn,
  waterTarget,
} from './waterStore';

const USER = '0195f1a2-0000-7000-8000-000000000001';
const OTHER = '0195f1a2-0000-7000-8000-000000000002';
const NOW = new Date('2026-11-22T08:00:00.000Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const DAY = '2026-11-22';

let db: SqlDatabase;

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
});

async function firstType(user = USER) {
  const [type] = await ensureDayTypes(db, user, NOW);
  if (!type) throw new Error('manca il tipo');
  return type;
}

describe('acqua del giorno', () => {
  it('somma le aggiunte del giorno; un giorno senza niente fa zero', async () => {
    expect(await waterOn(db, USER, DAY)).toBe(0);
    await addWater(db, USER, DAY, 250, NOW);
    await addWater(db, USER, DAY, 500, later(1));
    await addWater(db, USER, '2026-11-21', 1000, later(2));
    expect(await waterOn(db, USER, DAY)).toBe(750);
    expect(await waterOn(db, USER, '2026-11-21')).toBe(1000);
  });

  it("è dell'utente: un altro non la vede né la annulla", async () => {
    await addWater(db, USER, DAY, 250, NOW);
    expect(await waterOn(db, OTHER, DAY)).toBe(0);
    expect(await undoLastWater(db, OTHER, DAY, later(1))).toBe(false);
    expect(await waterOn(db, USER, DAY)).toBe(250);
  });

  it("annullare cancella logicamente l'ultima aggiunta del giorno", async () => {
    await addWater(db, USER, DAY, 250, NOW);
    await addWater(db, USER, DAY, 500, later(1));
    await addWater(db, USER, '2026-11-23', 100, later(2));
    expect(await undoLastWater(db, USER, DAY, later(3))).toBe(true);
    expect(await waterOn(db, USER, DAY)).toBe(250);
    expect(await undoLastWater(db, USER, DAY, later(4))).toBe(true);
    expect(await waterOn(db, USER, DAY)).toBe(0);
    expect(await undoLastWater(db, USER, DAY, later(5))).toBe(false);
    expect(await waterOn(db, USER, '2026-11-23')).toBe(100);
    const rows = await db.getAllAsync<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM water_entry WHERE date = ?',
      DAY,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.deleted_at !== null)).toBe(true);
  });

  it("conosce l'ultima aggiunta del giorno, quella che Annulla toglie", async () => {
    expect(await lastWater(db, USER, DAY)).toBeNull();
    await addWater(db, USER, DAY, 250, NOW);
    await addWater(db, USER, DAY, 500, later(1));
    expect(await lastWater(db, USER, DAY)).toBe(500);
    expect(await lastWater(db, OTHER, DAY)).toBeNull();
    await undoLastWater(db, USER, DAY, later(2));
    expect(await lastWater(db, USER, DAY)).toBe(250);
  });

  it('rifiuta quantità e date non valide con il vincolo', async () => {
    await expect(addWater(db, USER, DAY, 0, NOW)).rejects.toThrow(/water_entry_ml_positive/);
    await expect(addWater(db, USER, '22/11/2026', 250, NOW)).rejects.toThrow(
      /water_entry_date_valid/,
    );
  });
});

describe("target dell'acqua per tipo di giornata", () => {
  it('senza target è null; si imposta, si corregge e si cancella con null', async () => {
    const type = await firstType();
    expect(await waterTarget(db, USER, type.id)).toBeNull();
    await setWaterTarget(db, USER, type.id, 3000, NOW);
    expect(await waterTarget(db, USER, type.id)).toBe(3000);
    await setWaterTarget(db, USER, type.id, 3500, later(1));
    expect(await waterTarget(db, USER, type.id)).toBe(3500);
    const active = await db.getAllAsync(
      'SELECT id FROM day_type_water WHERE day_type_id = ? AND deleted_at IS NULL',
      type.id,
    );
    expect(active).toHaveLength(1);
    await setWaterTarget(db, USER, type.id, null, later(2));
    expect(await waterTarget(db, USER, type.id)).toBeNull();
    await setWaterTarget(db, USER, type.id, 2500, later(3));
    expect(await waterTarget(db, USER, type.id)).toBe(2500);
  });

  it('un tipo di un altro utente non si tocca e non si legge', async () => {
    const mine = await firstType();
    const theirs = await firstType(OTHER);
    await setWaterTarget(db, USER, theirs.id, 4000, NOW);
    expect(await waterTarget(db, OTHER, theirs.id)).toBeNull();
    await setWaterTarget(db, OTHER, theirs.id, 3000, NOW);
    await setWaterTarget(db, USER, theirs.id, null, later(1));
    expect(await waterTarget(db, OTHER, theirs.id)).toBe(3000);
    expect(await waterTarget(db, USER, theirs.id)).toBeNull();
    expect(await waterTarget(db, USER, mine.id)).toBeNull();
  });

  it('un target non positivo viola il vincolo', async () => {
    const type = await firstType();
    await expect(setWaterTarget(db, USER, type.id, 0, NOW)).rejects.toThrow(
      /day_type_water_ml_positive/,
    );
  });

  it("un solo target attivo per tipo: lo dice l'indice unico", async () => {
    const type = await firstType();
    await setWaterTarget(db, USER, type.id, 3000, NOW);
    await expect(
      db.runAsync(
        'INSERT INTO day_type_water (id, user_id, day_type_id, ml, updated_at) VALUES (?, ?, ?, ?, ?)',
        'w2',
        USER,
        type.id,
        2000,
        NOW.toISOString(),
      ),
    ).rejects.toThrow(/day_type_water/);
  });
});

describe('incrementi dei pulsanti', () => {
  it('predefiniti 250 e 500; si cambiano e si rileggono', async () => {
    expect(await waterIncrements(db, USER)).toEqual([250, 500]);
    await setWaterIncrements(db, USER, [200, 330, 750], NOW);
    expect(await waterIncrements(db, USER)).toEqual([200, 330, 750]);
    await setWaterIncrements(db, USER, [1000], later(1));
    expect(await waterIncrements(db, USER)).toEqual([1000]);
    expect(await waterIncrements(db, OTHER)).toEqual([250, 500]);
  });

  it('rifiuta zero valori, più di tre, fuori da 50-2000 ml o non interi', async () => {
    await expect(setWaterIncrements(db, USER, [], NOW)).rejects.toThrow(/incrementi/i);
    await expect(setWaterIncrements(db, USER, [100, 200, 300, 400], NOW)).rejects.toThrow(
      /incrementi/i,
    );
    await expect(setWaterIncrements(db, USER, [49], NOW)).rejects.toThrow(/incrementi/i);
    await expect(setWaterIncrements(db, USER, [2001], NOW)).rejects.toThrow(/incrementi/i);
    await expect(setWaterIncrements(db, USER, [250.5], NOW)).rejects.toThrow(/incrementi/i);
    expect(await waterIncrements(db, USER)).toEqual([250, 500]);
  });

  it('un valore salvato rovinato torna ai predefiniti', async () => {
    await db.runAsync(
      "INSERT INTO user_setting (user_id, key, value, updated_at) VALUES (?, 'water_increments', ?, ?)",
      USER,
      'non json',
      NOW.toISOString(),
    );
    expect(await waterIncrements(db, USER)).toEqual([250, 500]);
    await db.runAsync("UPDATE user_setting SET value = '[1, 2]' WHERE user_id = ?", USER);
    expect(await waterIncrements(db, USER)).toEqual([250, 500]);
  });
});
