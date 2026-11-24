import { beforeEach, describe, expect, it } from 'vitest';

import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
import { openTestDatabase } from './testing/nodeDatabase';
import { deleteWeight, latestWeights, setWeight, weights } from './weightStore';

const USER = '0195f1a2-0000-7000-8000-000000000001';
const OTHER = '0195f1a2-0000-7000-8000-000000000002';
const NOW = new Date('2026-11-22T08:00:00.000Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

let db: SqlDatabase;

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
});

describe('pesate', () => {
  it('salva la pesata del giorno e la rilegge', async () => {
    await setWeight(db, USER, '2026-11-22', 82.4, NOW);
    expect(await weights(db, USER, '2026-11-01', '2026-11-30')).toEqual([
      { date: '2026-11-22', kg: 82.4 },
    ]);
  });

  it('una seconda pesata dello stesso giorno sostituisce la prima, sulla stessa riga', async () => {
    await setWeight(db, USER, '2026-11-22', 82.4, NOW);
    await setWeight(db, USER, '2026-11-22', 81.9, later(5));
    expect(await weights(db, USER, '2026-11-22', '2026-11-22')).toEqual([
      { date: '2026-11-22', kg: 81.9 },
    ]);
    const rows = await db.getAllAsync<{ created_at: string; updated_at: string }>(
      'SELECT created_at, updated_at FROM weight_entry',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.created_at).toBe(NOW.toISOString());
    expect(rows[0]?.updated_at).toBe(later(5).toISOString());
  });

  it("le legge in ordine di data, solo nell'intervallo", async () => {
    await setWeight(db, USER, '2026-11-20', 83, NOW);
    await setWeight(db, USER, '2026-11-18', 84, NOW);
    await setWeight(db, USER, '2026-11-25', 82, NOW);
    expect(await weights(db, USER, '2026-11-18', '2026-11-20')).toEqual([
      { date: '2026-11-18', kg: 84 },
      { date: '2026-11-20', kg: 83 },
    ]);
  });

  it("sono dell'utente: un altro non le vede, non le tocca e ha la sua nello stesso giorno", async () => {
    await setWeight(db, USER, '2026-11-22', 82.4, NOW);
    expect(await weights(db, OTHER, '2026-11-01', '2026-11-30')).toEqual([]);
    expect(await deleteWeight(db, OTHER, '2026-11-22', later(1))).toBe(false);
    await setWeight(db, OTHER, '2026-11-22', 60, later(2));
    expect(await weights(db, USER, '2026-11-22', '2026-11-22')).toEqual([
      { date: '2026-11-22', kg: 82.4 },
    ]);
    expect(await weights(db, OTHER, '2026-11-22', '2026-11-22')).toEqual([
      { date: '2026-11-22', kg: 60 },
    ]);
  });

  it('eliminare cancella logicamente, e si può pesarsi di nuovo lo stesso giorno', async () => {
    await setWeight(db, USER, '2026-11-22', 82.4, NOW);
    expect(await deleteWeight(db, USER, '2026-11-22', later(1))).toBe(true);
    expect(await weights(db, USER, '2026-11-01', '2026-11-30')).toEqual([]);
    expect(await deleteWeight(db, USER, '2026-11-22', later(2))).toBe(false);
    await setWeight(db, USER, '2026-11-22', 82, later(3));
    expect(await weights(db, USER, '2026-11-22', '2026-11-22')).toEqual([
      { date: '2026-11-22', kg: 82 },
    ]);
    const rows = await db.getAllAsync('SELECT id FROM weight_entry');
    expect(rows).toHaveLength(2);
  });

  it('le ultime pesate vanno dalla più recente, fino al limite', async () => {
    await setWeight(db, USER, '2026-11-20', 83, NOW);
    await setWeight(db, USER, '2026-11-22', 82, NOW);
    await setWeight(db, USER, '2026-11-21', 82.5, NOW);
    expect(await latestWeights(db, USER, 2)).toEqual([
      { date: '2026-11-22', kg: 82 },
      { date: '2026-11-21', kg: 82.5 },
    ]);
  });

  it('i vincoli del database rifiutano date e pesi impossibili, con il loro nome', async () => {
    await expect(setWeight(db, USER, '22/11/2026', 82, NOW)).rejects.toThrow(
      /weight_entry_date_valid/,
    );
    await expect(setWeight(db, USER, '2026-11-22', 19.9, NOW)).rejects.toThrow(
      /weight_entry_kg_range/,
    );
    await expect(setWeight(db, USER, '2026-11-22', 400.1, NOW)).rejects.toThrow(
      /weight_entry_kg_range/,
    );
  });

  it("una sola pesata viva al giorno per utente: lo dice l'indice unico", async () => {
    const stamp = NOW.toISOString();
    const insert = (id: string) =>
      db.runAsync(
        `INSERT INTO weight_entry (id, user_id, date, kg, created_at, updated_at)
         VALUES (?, ?, '2026-11-22', 82, ?, ?)`,
        id,
        USER,
        stamp,
        stamp,
      );
    await insert('a');
    await expect(insert('b')).rejects.toThrow(/weight_entry_one_per_day|weight_entry\.user_id/);
  });

  it('la sorgente è manuale o health', async () => {
    const stamp = NOW.toISOString();
    await expect(
      db.runAsync(
        `INSERT INTO weight_entry (id, user_id, date, kg, source, created_at, updated_at)
         VALUES ('x', ?, '2026-11-22', 82, 'altro', ?, ?)`,
        USER,
        stamp,
        stamp,
      ),
    ).rejects.toThrow(/weight_entry_source_valid/);
  });
});
