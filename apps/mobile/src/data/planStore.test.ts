import { beforeEach, describe, expect, it } from 'vitest';

import { addEntry, deleteEntry, ensureMealSlots, entriesForDay } from './diaryStore';
import {
  addPlanItem,
  confirmPlanItem,
  deletePlanItem,
  pendingPlan,
  planFor,
  updatePlanQuantity,
} from './planStore';
import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
import { ensureDayTypes } from './targetsStore';
import { openTestDatabase } from './testing/nodeDatabase';

const USER = '0195f1a2-0000-7000-8000-000000000001';
const OTHER = '0195f1a2-0000-7000-8000-000000000002';
const NOW = new Date('2026-11-21T12:30:00.000Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const DATE = '2026-11-21';

const food = (id: string, name: string, kcal: number, protein: number) => ({
  id,
  name,
  state: 'raw' as const,
  baseUnit: 'g' as const,
  nutrients: [
    { code: 'energy_kcal', amountPer100: kcal, provenance: 'reference', confidence: 1 },
    { code: 'protein_g', amountPer100: protein, provenance: 'reference', confidence: 1 },
  ],
});
const RISO = food('riso', 'Riso', 350, 7);
const POLLO = food('pollo', 'Petto di pollo', 110, 23);

let db: SqlDatabase;

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
});

async function setup(user = USER) {
  const slots = await ensureMealSlots(db, user, NOW);
  const types = await ensureDayTypes(db, user, NOW);
  const slot = (name: string) => {
    const found = slots.find((s) => s.name === name);
    if (!found) throw new Error(name);
    return found.id;
  };
  return {
    pranzo: slot('Pranzo'),
    cena: slot('Cena'),
    allenamento: types[0]?.id ?? '',
    riposo: types[1]?.id ?? '',
  };
}

describe('piano alimentare (RF-130)', () => {
  it('ogni tipo di giornata ha i suoi alimenti per pasto, nell ordine dei pasti e di inserimento', async () => {
    const { pranzo, cena, allenamento, riposo } = await setup();
    await addPlanItem(db, {
      userId: USER,
      dayTypeId: allenamento,
      mealSlotId: cena,
      food: POLLO,
      quantity: 200,
      now: NOW,
    });
    await addPlanItem(db, {
      userId: USER,
      dayTypeId: allenamento,
      mealSlotId: pranzo,
      food: RISO,
      quantity: 100,
      now: later(1),
    });
    await addPlanItem(db, {
      userId: USER,
      dayTypeId: allenamento,
      mealSlotId: pranzo,
      food: POLLO,
      quantity: 300,
      now: later(2),
    });
    await addPlanItem(db, {
      userId: USER,
      dayTypeId: riposo,
      mealSlotId: pranzo,
      food: RISO,
      quantity: 60,
      now: later(3),
    });
    const plan = await planFor(db, USER, allenamento);
    expect(plan.map((i) => [i.mealSlotId, i.foodName, i.quantity])).toEqual([
      [pranzo, 'Riso', 100],
      [pranzo, 'Petto di pollo', 300],
      [cena, 'Petto di pollo', 200],
    ]);
    expect(plan[0]?.snapshot.energy_kcal?.amount).toBe(350);
    expect((await planFor(db, USER, riposo)).map((i) => i.quantity)).toEqual([60]);
  });

  it('si cambiano i grammi e si tolgono alimenti', async () => {
    const { pranzo, allenamento } = await setup();
    const riso = await addPlanItem(db, {
      userId: USER,
      dayTypeId: allenamento,
      mealSlotId: pranzo,
      food: RISO,
      quantity: 100,
      now: NOW,
    });
    const pollo = await addPlanItem(db, {
      userId: USER,
      dayTypeId: allenamento,
      mealSlotId: pranzo,
      food: POLLO,
      quantity: 300,
      now: later(1),
    });
    await updatePlanQuantity(db, USER, riso.id, 120, later(2));
    await deletePlanItem(db, USER, pollo.id, later(3));
    expect((await planFor(db, USER, allenamento)).map((i) => [i.foodName, i.quantity])).toEqual([
      ['Riso', 120],
    ]);
  });

  it('un altro utente non vede né tocca il mio piano', async () => {
    const { pranzo, allenamento } = await setup();
    const riso = await addPlanItem(db, {
      userId: USER,
      dayTypeId: allenamento,
      mealSlotId: pranzo,
      food: RISO,
      quantity: 100,
      now: NOW,
    });
    await updatePlanQuantity(db, OTHER, riso.id, 999, later(1));
    await deletePlanItem(db, OTHER, riso.id, later(2));
    expect(await planFor(db, OTHER, allenamento)).toEqual([]);
    expect((await planFor(db, USER, allenamento)).map((i) => i.quantity)).toEqual([100]);
  });

  it('non si aggiunge al tipo o al pasto di un altro utente', async () => {
    const mine = await setup();
    const theirs = await setup(OTHER);
    await addPlanItem(db, {
      userId: USER,
      dayTypeId: theirs.allenamento,
      mealSlotId: mine.pranzo,
      food: RISO,
      quantity: 100,
      now: NOW,
    }).catch(() => undefined);
    await addPlanItem(db, {
      userId: USER,
      dayTypeId: mine.allenamento,
      mealSlotId: theirs.pranzo,
      food: RISO,
      quantity: 100,
      now: NOW,
    }).catch(() => undefined);
    const rows = await db.getAllAsync('SELECT id FROM plan_item');
    expect(rows).toEqual([]);
  });
});

describe('voci previste di un giorno', () => {
  it('le voci del piano non ancora confermate quel giorno sono previste', async () => {
    const { pranzo, allenamento } = await setup();
    const riso = await addPlanItem(db, {
      userId: USER,
      dayTypeId: allenamento,
      mealSlotId: pranzo,
      food: RISO,
      quantity: 100,
      now: NOW,
    });
    const pollo = await addPlanItem(db, {
      userId: USER,
      dayTypeId: allenamento,
      mealSlotId: pranzo,
      food: POLLO,
      quantity: 300,
      now: later(1),
    });
    expect((await pendingPlan(db, USER, DATE, allenamento)).map((i) => i.id)).toEqual([
      riso.id,
      pollo.id,
    ]);

    const entry = await confirmPlanItem(db, {
      userId: USER,
      date: DATE,
      item: riso,
      quantity: 120,
      now: later(2),
    });
    expect(entry).toMatchObject({
      foodName: 'Riso',
      quantity: 120,
      mealSlotId: pranzo,
      planItemId: riso.id,
    });
    expect((await pendingPlan(db, USER, DATE, allenamento)).map((i) => i.id)).toEqual([pollo.id]);
    // Un altro giorno ha ancora tutto il piano da fare.
    expect(await pendingPlan(db, USER, '2026-11-22', allenamento)).toHaveLength(2);
  });

  it('eliminare la voce confermata riporta la voce prevista', async () => {
    const { pranzo, allenamento } = await setup();
    const riso = await addPlanItem(db, {
      userId: USER,
      dayTypeId: allenamento,
      mealSlotId: pranzo,
      food: RISO,
      quantity: 100,
      now: NOW,
    });
    const entry = await confirmPlanItem(db, {
      userId: USER,
      date: DATE,
      item: riso,
      quantity: 100,
      now: later(1),
    });
    await deleteEntry(db, USER, entry.id, later(2));
    expect(await pendingPlan(db, USER, DATE, allenamento)).toHaveLength(1);
  });

  it('una voce registrata a mano non conta come prevista confermata', async () => {
    const { pranzo, allenamento } = await setup();
    await addPlanItem(db, {
      userId: USER,
      dayTypeId: allenamento,
      mealSlotId: pranzo,
      food: RISO,
      quantity: 100,
      now: NOW,
    });
    await addEntry(db, {
      userId: USER,
      date: DATE,
      mealSlotId: pranzo,
      food: RISO,
      quantity: 100,
      now: later(1),
    });
    expect(await pendingPlan(db, USER, DATE, allenamento)).toHaveLength(1);
    expect((await entriesForDay(db, USER, DATE))[0]?.planItemId).toBeNull();
  });
});

describe('vincoli del database', () => {
  it('rifiuta grammi zero o negativi nel piano', async () => {
    const { pranzo, allenamento } = await setup();
    await expect(
      addPlanItem(db, {
        userId: USER,
        dayTypeId: allenamento,
        mealSlotId: pranzo,
        food: RISO,
        quantity: 0,
        now: NOW,
      }),
    ).rejects.toThrow(/plan_item_quantity_positive/);
  });
});
