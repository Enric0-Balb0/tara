import { beforeEach, describe, expect, it } from 'vitest';

import { addEntry, deleteEntry, ensureMealSlots, entriesForDay } from './diaryStore';
import { copyEntries, favorites, isFavorite, recentFoods, setFavorite } from './quickStore';
import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
import { openTestDatabase } from './testing/nodeDatabase';

const USER = '0195f1a2-0000-7000-8000-000000000001';
const OTHER = '0195f1a2-0000-7000-8000-000000000002';
const NOW = new Date('2026-11-21T12:30:00.000Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const food = (id: string, name: string, state: 'raw' | 'cooked' = 'raw') => ({
  id,
  name,
  state,
  baseUnit: 'g' as const,
  nutrients: [{ code: 'protein_g', amountPer100: 10, provenance: 'reference', confidence: 1 }],
});
const RISO = food('riso', 'Riso');
const POLLO = food('pollo', 'Petto di pollo');
const AVENA = food('avena', "Fiocchi d'avena");

let db: SqlDatabase;

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
});

async function slots(user = USER) {
  const all = await ensureMealSlots(db, user, NOW);
  const id = (name: string) => all.find((slot) => slot.name === name)?.id ?? '';
  return { colazione: id('Colazione'), pranzo: id('Pranzo'), cena: id('Cena') };
}

describe('recenti', () => {
  it("sono gli ultimi alimenti registrati, uno per alimento, con l'ultimo peso", async () => {
    const { pranzo, cena } = await slots();
    await addEntry(db, {
      userId: USER,
      date: '2026-11-20',
      mealSlotId: pranzo,
      food: RISO,
      quantity: 80,
      now: NOW,
    });
    await addEntry(db, {
      userId: USER,
      date: '2026-11-20',
      mealSlotId: cena,
      food: POLLO,
      quantity: 200,
      now: later(1),
    });
    await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: pranzo,
      food: RISO,
      quantity: 100,
      now: later(2),
    });
    const recent = await recentFoods(db, USER, 10);
    expect(recent.map((r) => [r.foodId, r.foodName, r.lastQuantity, r.unit])).toEqual([
      ['riso', 'Riso', 100, 'g'],
      ['pollo', 'Petto di pollo', 200, 'g'],
    ]);
  });

  it('non contano le voci eliminate né quelle di altri utenti, e rispettano il limite', async () => {
    const { pranzo } = await slots();
    const other = await slots(OTHER);
    const removed = await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: pranzo,
      food: AVENA,
      quantity: 50,
      now: NOW,
    });
    await deleteEntry(db, USER, removed.id, later(1));
    await addEntry(db, {
      userId: OTHER,
      date: '2026-11-21',
      mealSlotId: other.pranzo,
      food: POLLO,
      quantity: 200,
      now: later(2),
    });
    await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: pranzo,
      food: RISO,
      quantity: 80,
      now: later(3),
    });
    await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: pranzo,
      food: POLLO,
      quantity: 150,
      now: later(4),
    });
    expect((await recentFoods(db, USER, 10)).map((r) => r.foodId)).toEqual(['pollo', 'riso']);
    expect((await recentFoods(db, USER, 1)).map((r) => r.foodId)).toEqual(['pollo']);
  });
});

describe('recenti e pasti eliminati', () => {
  it('le voci di un pasto eliminato non contano tra i recenti', async () => {
    const { pranzo, cena } = await slots();
    await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: cena,
      food: AVENA,
      quantity: 50,
      now: NOW,
    });
    await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: pranzo,
      food: RISO,
      quantity: 80,
      now: later(1),
    });
    await db.runAsync(
      'UPDATE meal_slot SET deleted_at = ? WHERE id = ?',
      later(2).toISOString(),
      cena,
    );
    expect((await recentFoods(db, USER, 10)).map((r) => r.foodId)).toEqual(['riso']);
  });
});

describe('preferiti', () => {
  it('si aggiungono e si tolgono, e la lista è in ordine alfabetico', async () => {
    expect(await isFavorite(db, USER, 'riso')).toBe(false);
    await setFavorite(db, USER, { id: 'riso', name: 'Riso', state: 'raw' }, true, NOW);
    await setFavorite(
      db,
      USER,
      { id: 'avena', name: "Fiocchi d'avena", state: 'raw' },
      true,
      later(1),
    );
    expect(await isFavorite(db, USER, 'riso')).toBe(true);
    expect((await favorites(db, USER)).map((f) => f.foodName)).toEqual(["Fiocchi d'avena", 'Riso']);
    await setFavorite(db, USER, { id: 'riso', name: 'Riso', state: 'raw' }, false, later(2));
    expect(await isFavorite(db, USER, 'riso')).toBe(false);
    expect((await favorites(db, USER)).map((f) => f.foodId)).toEqual(['avena']);
  });

  it('due volte preferito resta uno; gli altri utenti hanno i loro', async () => {
    await setFavorite(db, USER, { id: 'riso', name: 'Riso', state: 'raw' }, true, NOW);
    await setFavorite(db, USER, { id: 'riso', name: 'Riso', state: 'raw' }, true, later(1));
    expect(await favorites(db, USER)).toHaveLength(1);
    expect(await favorites(db, OTHER)).toEqual([]);
  });
});

describe('copia di voci da un altro giorno', () => {
  it('copia un pasto con pesi e valori, come voci nuove di oggi', async () => {
    const { pranzo, cena } = await slots();
    await addEntry(db, {
      userId: USER,
      date: '2026-11-20',
      mealSlotId: pranzo,
      food: RISO,
      quantity: 80,
      now: NOW,
    });
    await addEntry(db, {
      userId: USER,
      date: '2026-11-20',
      mealSlotId: pranzo,
      food: POLLO,
      quantity: 200,
      now: later(1),
    });
    await addEntry(db, {
      userId: USER,
      date: '2026-11-20',
      mealSlotId: cena,
      food: AVENA,
      quantity: 50,
      now: later(2),
    });
    const copied = await copyEntries(db, {
      userId: USER,
      fromDate: '2026-11-20',
      toDate: '2026-11-21',
      mealSlotId: pranzo,
      now: later(3),
    });
    expect(copied).toBe(2);
    const today = await entriesForDay(db, USER, '2026-11-21');
    expect(today.map((e) => [e.foodName, e.quantity, e.mealSlotId, e.planItemId])).toEqual([
      ['Riso', 80, pranzo, null],
      ['Petto di pollo', 200, pranzo, null],
    ]);
    expect(today[0]?.snapshot.protein_g?.amount).toBe(10);
    // Ieri resta com'era.
    expect(await entriesForDay(db, USER, '2026-11-20')).toHaveLength(3);
  });

  it('senza pasto copia la giornata intera', async () => {
    const { pranzo, cena } = await slots();
    await addEntry(db, {
      userId: USER,
      date: '2026-11-20',
      mealSlotId: pranzo,
      food: RISO,
      quantity: 80,
      now: NOW,
    });
    await addEntry(db, {
      userId: USER,
      date: '2026-11-20',
      mealSlotId: cena,
      food: AVENA,
      quantity: 50,
      now: later(1),
    });
    expect(
      await copyEntries(db, {
        userId: USER,
        fromDate: '2026-11-20',
        toDate: '2026-11-21',
        now: later(2),
      }),
    ).toBe(2);
    expect((await entriesForDay(db, USER, '2026-11-21')).map((e) => e.foodName)).toEqual([
      'Riso',
      "Fiocchi d'avena",
    ]);
  });

  it('non copia voci eliminate né quelle di un altro utente', async () => {
    const { pranzo } = await slots();
    const other = await slots(OTHER);
    const removed = await addEntry(db, {
      userId: USER,
      date: '2026-11-20',
      mealSlotId: pranzo,
      food: RISO,
      quantity: 80,
      now: NOW,
    });
    await deleteEntry(db, USER, removed.id, later(1));
    await addEntry(db, {
      userId: OTHER,
      date: '2026-11-20',
      mealSlotId: other.pranzo,
      food: POLLO,
      quantity: 200,
      now: later(2),
    });
    expect(
      await copyEntries(db, {
        userId: USER,
        fromDate: '2026-11-20',
        toDate: '2026-11-21',
        now: later(3),
      }),
    ).toBe(0);
  });
});
