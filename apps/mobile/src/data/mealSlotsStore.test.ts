import { beforeEach, describe, expect, it } from 'vitest';

import {
  addEntry,
  archivedMealSlots,
  archivedSlotsWithEntries,
  deleteEntry,
  ensureMealSlots,
} from './diaryStore';
import {
  addMealSlot,
  archiveMealSlot,
  deleteMealSlot,
  MealSlotError,
  moveMealSlot,
  renameMealSlot,
  restoreMealSlot,
  setMealSlotTime,
  slotsInUse,
} from './mealSlotsStore';
import { addPlanItem, deletePlanItem } from './planStore';
import { copyEntries } from './quickStore';
import { logSavedMeal, saveMealFromDiary } from './savedMealsStore';
import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
import { deleteDayType, ensureDayTypes } from './targetsStore';
import { openTestDatabase } from './testing/nodeDatabase';

const USER = '0195f1a2-0000-7000-8000-000000000001';
const OTHER = '0195f1a2-0000-7000-8000-000000000002';
const NOW = new Date('2026-11-24T12:30:00.000Z');

const ALBUME = {
  id: 'albume',
  name: "Albume d'uovo",
  state: 'raw' as const,
  baseUnit: 'g' as const,
  nutrients: [{ code: 'energy_kcal', amountPer100: 48, provenance: 'reference', confidence: 1 }],
};

let db: SqlDatabase;

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
});

const names = async (user = USER) => (await ensureMealSlots(db, user, NOW)).map((s) => s.name);
async function slotNamed(name: string, user = USER) {
  const slot = (await ensureMealSlots(db, user, NOW)).find((s) => s.name === name);
  if (!slot) throw new Error(`manca ${name}`);
  return slot;
}
async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('addMealSlot', () => {
  it('aggiunge in coda con nome ripulito e orario', async () => {
    await ensureMealSlots(db, USER, NOW);
    const slot = await addMealSlot(db, USER, '  Post-workout ', '18:15', NOW);
    expect(slot).toMatchObject({ name: 'Post-workout', position: 5, expectedTime: '18:15' });
    expect((await names()).at(-1)).toBe('Post-workout');
  });

  it('accetta un orario assente', async () => {
    await ensureMealSlots(db, USER, NOW);
    expect((await addMealSlot(db, USER, 'Notte', null, NOW)).expectedTime).toBeNull();
  });

  it('rifiuta nome vuoto e orario non valido', async () => {
    await ensureMealSlots(db, USER, NOW);
    expect(await rejection(addMealSlot(db, USER, '   ', null, NOW))).toMatchObject({
      code: 'name',
    });
    expect(await rejection(addMealSlot(db, USER, 'X', '25:00', NOW))).toMatchObject({
      code: 'time',
    });
    expect(await names()).toHaveLength(5);
  });

  it('parte dai predefiniti se l utente non ha ancora pasti', async () => {
    await addMealSlot(db, USER, 'Extra', null, NOW);
    expect(await names()).toEqual(['Colazione', 'Spuntino', 'Pranzo', 'Merenda', 'Cena', 'Extra']);
  });
});

describe('renameMealSlot e setMealSlotTime', () => {
  it('rinomina e aggiorna updated_at', async () => {
    const merenda = await slotNamed('Merenda');
    await renameMealSlot(db, USER, merenda.id, ' Pre-workout ', new Date(NOW.getTime() + 1000));
    expect(await names()).toContain('Pre-workout');
    const row = await db.getFirstAsync<{ updated_at: string }>(
      'SELECT updated_at FROM meal_slot WHERE id = ?',
      merenda.id,
    );
    expect(row?.updated_at).toBe('2026-11-24T12:30:01.000Z');
  });

  it('rifiuta un nome vuoto', async () => {
    const merenda = await slotNamed('Merenda');
    expect(await rejection(renameMealSlot(db, USER, merenda.id, ' ', NOW))).toBeInstanceOf(
      MealSlotError,
    );
    expect(await names()).toContain('Merenda');
  });

  it('imposta e toglie l orario; rifiuta formati non validi', async () => {
    const cena = await slotNamed('Cena');
    await setMealSlotTime(db, USER, cena.id, '21:05', NOW);
    expect((await slotNamed('Cena')).expectedTime).toBe('21:05');
    await setMealSlotTime(db, USER, cena.id, null, NOW);
    expect((await slotNamed('Cena')).expectedTime).toBeNull();
    for (const bad of ['24:00', '9:30', '12:60', 'ab:cd', '']) {
      expect(await rejection(setMealSlotTime(db, USER, cena.id, bad, NOW))).toMatchObject({
        code: 'time',
      });
    }
  });

  it('non tocca i pasti di un altro utente', async () => {
    const mine = await slotNamed('Cena');
    await ensureMealSlots(db, OTHER, NOW);
    expect(await rejection(renameMealSlot(db, OTHER, mine.id, 'Rubata', NOW))).toMatchObject({
      code: 'missing',
    });
    expect(await rejection(setMealSlotTime(db, OTHER, mine.id, '01:00', NOW))).toMatchObject({
      code: 'missing',
    });
    expect(await names()).toContain('Cena');
  });
});

describe('moveMealSlot', () => {
  it('scambia con il vicino in su e in giù', async () => {
    const pranzo = await slotNamed('Pranzo');
    await moveMealSlot(db, USER, pranzo.id, 'up', NOW);
    expect(await names()).toEqual(['Colazione', 'Pranzo', 'Spuntino', 'Merenda', 'Cena']);
    await moveMealSlot(db, USER, pranzo.id, 'down', NOW);
    expect(await names()).toEqual(['Colazione', 'Spuntino', 'Pranzo', 'Merenda', 'Cena']);
  });

  it('ai bordi non fa nulla', async () => {
    const first = await slotNamed('Colazione');
    const last = await slotNamed('Cena');
    await moveMealSlot(db, USER, first.id, 'up', NOW);
    await moveMealSlot(db, USER, last.id, 'down', NOW);
    expect(await names()).toEqual(['Colazione', 'Spuntino', 'Pranzo', 'Merenda', 'Cena']);
  });

  it('salta i pasti eliminati e non esce dall utente', async () => {
    const spuntino = await slotNamed('Spuntino');
    await deleteMealSlot(db, USER, spuntino.id, NOW);
    await ensureMealSlots(db, OTHER, NOW);
    await moveMealSlot(db, USER, (await slotNamed('Pranzo')).id, 'up', NOW);
    expect(await names()).toEqual(['Pranzo', 'Colazione', 'Merenda', 'Cena']);
    expect(await names(OTHER)).toEqual(['Colazione', 'Spuntino', 'Pranzo', 'Merenda', 'Cena']);
  });

  it('un pasto di un altro utente è rifiutato', async () => {
    const mine = await slotNamed('Pranzo');
    expect(await rejection(moveMealSlot(db, OTHER, mine.id, 'up', NOW))).toMatchObject({
      code: 'missing',
    });
  });
});

describe('deleteMealSlot', () => {
  it('elimina logicamente un pasto vuoto', async () => {
    const merenda = await slotNamed('Merenda');
    await deleteMealSlot(db, USER, merenda.id, NOW);
    expect(await names()).toEqual(['Colazione', 'Spuntino', 'Pranzo', 'Cena']);
    const row = await db.getFirstAsync<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM meal_slot WHERE id = ?',
      merenda.id,
    );
    expect(row?.deleted_at).toBe(NOW.toISOString());
  });

  it('rifiuta un pasto con voci di diario, senza scrivere', async () => {
    const pranzo = await slotNamed('Pranzo');
    await addEntry(db, {
      userId: USER,
      date: '2026-11-24',
      mealSlotId: pranzo.id,
      food: ALBUME,
      quantity: 100,
      now: NOW,
    });
    expect(await rejection(deleteMealSlot(db, USER, pranzo.id, NOW))).toMatchObject({
      code: 'in_use',
    });
    expect(await names()).toContain('Pranzo');
  });

  it('rifiuta un pasto con voci di piano', async () => {
    const cena = await slotNamed('Cena');
    const types = await ensureDayTypes(db, USER, NOW);
    await addPlanItem(db, {
      userId: USER,
      dayTypeId: types[0]?.id ?? '',
      mealSlotId: cena.id,
      food: ALBUME,
      quantity: 100,
      now: NOW,
    });
    expect(await rejection(deleteMealSlot(db, USER, cena.id, NOW))).toMatchObject({
      code: 'in_use',
    });
    expect(await names()).toContain('Cena');
  });

  it('le voci eliminate di diario e piano non bloccano l eliminazione', async () => {
    const pranzo = await slotNamed('Pranzo');
    const entry = await addEntry(db, {
      userId: USER,
      date: '2026-11-24',
      mealSlotId: pranzo.id,
      food: ALBUME,
      quantity: 100,
      now: NOW,
    });
    const types = await ensureDayTypes(db, USER, NOW);
    const item = await addPlanItem(db, {
      userId: USER,
      dayTypeId: types[0]?.id ?? '',
      mealSlotId: pranzo.id,
      food: ALBUME,
      quantity: 100,
      now: NOW,
    });
    await deleteEntry(db, USER, entry.id, NOW);
    await deletePlanItem(db, USER, item.id, NOW);
    await deleteMealSlot(db, USER, pranzo.id, NOW);
    expect(await names()).not.toContain('Pranzo');
  });

  it('un rifiuto non scrive: deleted_at resta NULL', async () => {
    const cena = await slotNamed('Cena');
    await addEntry(db, {
      userId: USER,
      date: '2026-11-24',
      mealSlotId: cena.id,
      food: ALBUME,
      quantity: 100,
      now: NOW,
    });
    await rejection(deleteMealSlot(db, USER, cena.id, NOW));
    const row = await db.getFirstAsync<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM meal_slot WHERE id = ?',
      cena.id,
    );
    expect(row?.deleted_at).toBeNull();
  });

  it('rifiuta l ultimo pasto rimasto', async () => {
    for (const name of ['Colazione', 'Spuntino', 'Pranzo', 'Merenda']) {
      await deleteMealSlot(db, USER, (await slotNamed(name)).id, NOW);
    }
    const cena = await slotNamed('Cena');
    expect(await rejection(deleteMealSlot(db, USER, cena.id, NOW))).toMatchObject({
      code: 'last',
    });
    expect(await names()).toEqual(['Cena']);
  });

  it('un pasto di un altro utente è rifiutato', async () => {
    const mine = await slotNamed('Merenda');
    await ensureMealSlots(db, OTHER, NOW);
    expect(await rejection(deleteMealSlot(db, OTHER, mine.id, NOW))).toMatchObject({
      code: 'missing',
    });
    expect(await names()).toContain('Merenda');
  });
});

const entryIn = (mealSlotId: string, date = '2026-11-24') =>
  addEntry(db, { userId: USER, date, mealSlotId, food: ALBUME, quantity: 100, now: NOW });

describe('nomi duplicati', () => {
  it('addMealSlot e renameMealSlot rifiutano un nome già usato, senza maiuscole né spazi', async () => {
    const cena = await slotNamed('Cena');
    expect(await rejection(addMealSlot(db, USER, '  pranzo ', null, NOW))).toMatchObject({
      code: 'duplicate',
    });
    expect(await rejection(renameMealSlot(db, USER, cena.id, 'COLAZIONE', NOW))).toMatchObject({
      code: 'duplicate',
    });
    await renameMealSlot(db, USER, cena.id, 'cena', NOW);
    expect(await names()).toHaveLength(5);
  });

  it('un nome archiviato si può riusare, ma non ripristinare in conflitto', async () => {
    const merenda = await slotNamed('Merenda');
    await archiveMealSlot(db, USER, merenda.id, NOW);
    await addMealSlot(db, USER, 'Merenda', null, NOW);
    expect(await rejection(restoreMealSlot(db, USER, merenda.id, NOW))).toMatchObject({
      code: 'duplicate',
    });
  });
});

describe('deleteMealSlot e piani di tipi eliminati', () => {
  it('le voci di piano di un tipo di giornata eliminato non bloccano', async () => {
    const cena = await slotNamed('Cena');
    const types = await ensureDayTypes(db, USER, NOW);
    const type = types[0]?.id ?? '';
    await addPlanItem(db, {
      userId: USER,
      dayTypeId: type,
      mealSlotId: cena.id,
      food: ALBUME,
      quantity: 100,
      now: NOW,
    });
    expect(await slotsInUse(db, USER)).toEqual(new Set([cena.id]));
    await deleteDayType(db, USER, type, NOW);
    expect((await slotsInUse(db, USER)).size).toBe(0);
    await deleteMealSlot(db, USER, cena.id, NOW);
    expect(await names()).not.toContain('Cena');
  });
});

describe('archivio dei pasti (RF-40)', () => {
  it('archivia e ripristina in coda; l archiviato non è tra i pasti attivi', async () => {
    const pranzo = await slotNamed('Pranzo');
    await entryIn(pranzo.id);
    expect(await slotsInUse(db, USER)).toEqual(new Set([pranzo.id]));
    await archiveMealSlot(db, USER, pranzo.id, NOW);
    expect(await names()).toEqual(['Colazione', 'Spuntino', 'Merenda', 'Cena']);
    expect((await archivedMealSlots(db, USER)).map((s) => s.name)).toEqual(['Pranzo']);
    await restoreMealSlot(db, USER, pranzo.id, NOW);
    expect(await names()).toEqual(['Colazione', 'Spuntino', 'Merenda', 'Cena', 'Pranzo']);
    expect(await archivedMealSlots(db, USER)).toEqual([]);
  });

  it('i predefiniti non tornano e il pasto non si può archiviare due volte', async () => {
    const merenda = await slotNamed('Merenda');
    await archiveMealSlot(db, USER, merenda.id, NOW);
    expect(await names()).toHaveLength(4);
    expect(await rejection(archiveMealSlot(db, USER, merenda.id, NOW))).toMatchObject({
      code: 'missing',
    });
  });

  it('rifiuta l ultimo pasto attivo e i pasti di altri', async () => {
    for (const name of ['Colazione', 'Spuntino', 'Pranzo', 'Merenda']) {
      await archiveMealSlot(db, USER, (await slotNamed(name)).id, NOW);
    }
    const cena = await slotNamed('Cena');
    expect(await rejection(archiveMealSlot(db, USER, cena.id, NOW))).toMatchObject({
      code: 'last',
    });
    expect(await names()).toEqual(['Cena']);
    expect(await rejection(restoreMealSlot(db, OTHER, cena.id, NOW))).toMatchObject({
      code: 'missing',
    });
    await ensureMealSlots(db, OTHER, NOW);
    const [first] = await archivedMealSlots(db, USER);
    expect(await rejection(restoreMealSlot(db, OTHER, first?.id ?? '', NOW))).toMatchObject({
      code: 'missing',
    });
  });

  it('Oggi mostra l archiviato solo nei giorni con voci vive', async () => {
    const pranzo = await slotNamed('Pranzo');
    const entry = await entryIn(pranzo.id);
    await archiveMealSlot(db, USER, pranzo.id, NOW);
    expect((await archivedSlotsWithEntries(db, USER, '2026-11-24')).map((s) => s.name)).toEqual([
      'Pranzo',
    ]);
    expect(await archivedSlotsWithEntries(db, USER, '2026-11-25')).toEqual([]);
    await deleteEntry(db, USER, entry.id, NOW);
    expect(await archivedSlotsWithEntries(db, USER, '2026-11-24')).toEqual([]);
  });

  it('un pasto archiviato non è un bersaglio: piano, pasti salvati, copia', async () => {
    const cena = await slotNamed('Cena');
    const pranzo = await slotNamed('Pranzo');
    await entryIn(cena.id);
    const saved = await saveMealFromDiary(db, {
      userId: USER,
      name: 'Cena tipo',
      date: '2026-11-24',
      mealSlotId: cena.id,
      now: NOW,
    });
    await archiveMealSlot(db, USER, cena.id, NOW);
    const types = await ensureDayTypes(db, USER, NOW);
    await expect(
      addPlanItem(db, {
        userId: USER,
        dayTypeId: types[0]?.id ?? '',
        mealSlotId: cena.id,
        food: ALBUME,
        quantity: 100,
        now: NOW,
      }),
    ).rejects.toThrow();
    await expect(
      logSavedMeal(db, {
        userId: USER,
        savedMealId: saved ?? '',
        date: '2026-11-25',
        mealSlotId: cena.id,
        quantities: {},
        now: NOW,
      }),
    ).rejects.toThrow();
    await entryIn(pranzo.id);
    expect(
      await copyEntries(db, {
        userId: USER,
        fromDate: '2026-11-24',
        toDate: '2026-11-25',
        now: NOW,
      }),
    ).toBe(1);
  });

  it('si può eliminare un pasto archiviato senza voci', async () => {
    const merenda = await slotNamed('Merenda');
    await archiveMealSlot(db, USER, merenda.id, NOW);
    await deleteMealSlot(db, USER, merenda.id, NOW);
    expect(await archivedMealSlots(db, USER)).toEqual([]);
  });
});
