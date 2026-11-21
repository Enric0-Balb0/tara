import { beforeEach, describe, expect, it } from 'vitest';

import { replaceCatalog } from './catalogStore';
import {
  addEntry,
  deleteEntry,
  ensureMealSlots,
  entriesForDay,
  lastQuantity,
  updateEntryQuantity,
} from './diaryStore';
import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
import { openTestDatabase } from './testing/nodeDatabase';
import { snapshotText } from './testing/snapshot';

const USER = '0195f1a2-0000-7000-8000-000000000001';
const OTHER = '0195f1a2-0000-7000-8000-000000000002';
const NOW = new Date('2026-11-21T12:30:00.000Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const ALBUME = {
  id: 'albume',
  name: "Albume d'uovo",
  state: 'raw' as const,
  baseUnit: 'g' as const,
  nutrients: [
    { code: 'energy_kcal', amountPer100: 48, provenance: 'reference', confidence: 1 },
    { code: 'protein_g', amountPer100: 10.9, provenance: 'reference', confidence: 1 },
  ],
};

let db: SqlDatabase;

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
});

async function slotNamed(name: string, user = USER) {
  const slots = await ensureMealSlots(db, user, NOW);
  const slot = slots.find((s) => s.name === name);
  if (!slot) throw new Error(`manca ${name}`);
  return slot;
}

describe('ensureMealSlots', () => {
  it('la prima volta crea i cinque pasti predefiniti, in ordine', async () => {
    const slots = await ensureMealSlots(db, USER, NOW);
    expect(slots.map((s) => [s.name, s.position, s.expectedTime])).toEqual([
      ['Colazione', 0, '07:30'],
      ['Spuntino', 1, '10:30'],
      ['Pranzo', 2, '13:00'],
      ['Merenda', 3, '16:30'],
      ['Cena', 4, '20:00'],
    ]);
  });

  it('le volte successive restituisce gli stessi pasti senza duplicarli', async () => {
    const first = await ensureMealSlots(db, USER, NOW);
    const second = await ensureMealSlots(db, USER, later(5));
    expect(second.map((s) => s.id)).toEqual(first.map((s) => s.id));
  });

  it('ogni utente ha i suoi pasti', async () => {
    const mine = await ensureMealSlots(db, USER, NOW);
    const theirs = await ensureMealSlots(db, OTHER, NOW);
    expect(theirs.map((s) => s.id)).not.toEqual(mine.map((s) => s.id));
  });
});

describe('voci del diario', () => {
  it('addEntry salva la voce con la copia dei valori e la restituisce', async () => {
    const pranzo = await slotNamed('Pranzo');
    const entry = await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: pranzo.id,
      food: ALBUME,
      quantity: 300,
      now: NOW,
    });
    expect(entry).toMatchObject({
      date: '2026-11-21',
      mealSlotId: pranzo.id,
      foodId: 'albume',
      foodName: "Albume d'uovo",
      foodState: 'raw',
      quantity: 300,
      unit: 'g',
    });
    expect(entry.snapshot.protein_g).toEqual({ amount: 10.9, provenance: 'reference', confidence: 1 });
    expect(await entriesForDay(db, USER, '2026-11-21')).toEqual([entry]);
  });

  it('la copia non cambia quando il catalogo viene sostituito (RF-43)', async () => {
    await replaceCatalog(db, snapshotText(), { etag: '"v1"', syncedAt: NOW.toISOString() });
    const pranzo = await slotNamed('Pranzo');
    await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: pranzo.id,
      food: ALBUME,
      quantity: 300,
      now: NOW,
    });
    await replaceCatalog(db, snapshotText(undefined, 'v2'), {
      etag: '"v2"',
      syncedAt: later(1).toISOString(),
    });
    const [entry] = await entriesForDay(db, USER, '2026-11-21');
    expect(entry?.snapshot.energy_kcal?.amount).toBe(48);
  });

  it('entriesForDay ordina per pasto e poi per ora di inserimento, solo del giorno e utente', async () => {
    const cena = await slotNamed('Cena');
    const colazione = await slotNamed('Colazione');
    const add = (mealSlotId: string, minutes: number, date = '2026-11-21', userId = USER) =>
      addEntry(db, { userId, date, mealSlotId, food: ALBUME, quantity: 100, now: later(minutes) });
    const c1 = await add(cena.id, 1);
    const b1 = await add(colazione.id, 2);
    const b2 = await add(colazione.id, 3);
    await add(colazione.id, 4, '2026-11-20');
    await add((await slotNamed('Colazione', OTHER)).id, 5, '2026-11-21', OTHER);
    const ids = (await entriesForDay(db, USER, '2026-11-21')).map((e) => e.id);
    expect(ids).toEqual([b1.id, b2.id, c1.id]);
  });

  it('updateEntryQuantity cambia il peso e aggiorna updated_at', async () => {
    const pranzo = await slotNamed('Pranzo');
    const entry = await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: pranzo.id,
      food: ALBUME,
      quantity: 300,
      now: NOW,
    });
    await updateEntryQuantity(db, USER, entry.id, 250, later(2));
    const [updated] = await entriesForDay(db, USER, '2026-11-21');
    expect(updated?.quantity).toBe(250);
    expect(updated?.updatedAt).toBe(later(2).toISOString());
  });

  it("deleteEntry nasconde la voce ma la tiene per la sincronizzazione; un altro utente non può", async () => {
    const pranzo = await slotNamed('Pranzo');
    const entry = await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: pranzo.id,
      food: ALBUME,
      quantity: 300,
      now: NOW,
    });
    await deleteEntry(db, OTHER, entry.id, later(1));
    expect(await entriesForDay(db, USER, '2026-11-21')).toHaveLength(1);
    await deleteEntry(db, USER, entry.id, later(2));
    expect(await entriesForDay(db, USER, '2026-11-21')).toEqual([]);
    const row = await db.getFirstAsync<{ deleted_at: string }>(
      'SELECT deleted_at FROM diary_entry WHERE id = ?',
      entry.id,
    );
    expect(row?.deleted_at).toBe(later(2).toISOString());
  });

  it("lastQuantity è l'ultimo peso dello stesso alimento nello stesso pasto (RF-42)", async () => {
    const pranzo = await slotNamed('Pranzo');
    const cena = await slotNamed('Cena');
    const add = (mealSlotId: string, quantity: number, minutes: number) =>
      addEntry(db, {
        userId: USER,
        date: '2026-11-21',
        mealSlotId,
        food: ALBUME,
        quantity,
        now: later(minutes),
      });
    expect(await lastQuantity(db, USER, 'albume', pranzo.id)).toBeNull();
    await add(pranzo.id, 200, 1);
    const removed = await add(pranzo.id, 300, 2);
    await add(cena.id, 500, 3);
    await deleteEntry(db, USER, removed.id, later(4));
    expect(await lastQuantity(db, USER, 'albume', pranzo.id)).toBe(200);
    expect(await lastQuantity(db, USER, 'albume', cena.id)).toBe(500);
  });
});

describe('vincoli del database', () => {
  async function insertEntry(overrides: Record<string, unknown>) {
    const pranzo = await slotNamed('Pranzo');
    const row = {
      id: 'e1',
      user_id: USER,
      date: '2026-11-21',
      meal_slot_id: pranzo.id,
      food_id: 'albume',
      food_name: 'Albume',
      food_state: 'raw',
      quantity: 100,
      unit: 'g',
      nutrients_snapshot: '{}',
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
      ...overrides,
    };
    const columns = Object.keys(row);
    await db.runAsync(
      `INSERT INTO diary_entry (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      ...(Object.values(row) as (string | number)[]),
    );
  }

  it('rifiuta un peso zero o negativo', async () => {
    await expect(insertEntry({ quantity: 0 })).rejects.toThrow(/diary_entry_quantity_positive/);
  });

  it('rifiuta una data che non è AAAA-MM-GG', async () => {
    await expect(insertEntry({ date: '21/11/2026' })).rejects.toThrow(/diary_entry_date_valid/);
  });

  it('rifiuta una copia dei valori che non è JSON', async () => {
    await expect(insertEntry({ nutrients_snapshot: 'non json' })).rejects.toThrow(
      /diary_entry_snapshot_json/,
    );
  });

  it('rifiuta un pasto senza nome', async () => {
    await expect(
      db.runAsync(
        'INSERT INTO meal_slot (id, user_id, name, position, updated_at) VALUES (?, ?, ?, ?, ?)',
        's1',
        USER,
        '  ',
        0,
        NOW.toISOString(),
      ),
    ).rejects.toThrow(/meal_slot_name_not_blank/);
  });
});
