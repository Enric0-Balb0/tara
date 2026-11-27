import { beforeEach, describe, expect, it } from 'vitest';

import { clearCatalog, getFood, replaceCatalog, searchFoods } from './catalogStore';
import {
  createFood,
  deleteFood,
  type PersonalFoodInput,
  personalFoods,
  updateFood,
} from './foodsStore';
import { addEntry, ensureMealSlots, entriesForDay } from './diaryStore';
import { favorites, recentFoods, setFavorite } from './quickStore';
import { createRecipe } from './recipesStore';
import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
import { snapshotText } from './testing/snapshot';
import { openTestDatabase } from './testing/nodeDatabase';

const USER = '0195f1a2-0000-7000-8000-000000000001';
const OTHER = '0195f1a2-0000-7000-8000-000000000002';
const NOW = new Date('2026-11-21T12:30:00.000Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const SKYR: PersonalFoodInput = {
  name: 'Skyr bianco',
  brand: 'Müller',
  state: 'not_applicable',
  baseUnit: 'g',
  values: { energy_kcal: 63, fat_g: 0.2, carbs_g: 4, protein_g: 11, salt_g: 0.13, sodium_mg: 52 },
  derived: ['sodium_mg'],
};

let db: SqlDatabase;

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
});

describe('createFood (RF-18)', () => {
  it('salva un alimento personale con i valori per 100 inseriti a mano', async () => {
    const id = await createFood(db, USER, SKYR, NOW);
    const food = await getFood(db, id);
    expect(food).toMatchObject({
      id,
      name: 'Skyr bianco',
      brand: 'Müller',
      state: 'not_applicable',
      baseUnit: 'g',
      source: 'manual',
      personal: true,
    });
    expect(
      food?.nutrients.map((n) => [n.code, n.amountPer100, n.provenance, n.confidence]),
    ).toEqual([
      ['energy_kcal', 63, 'manual', 1],
      ['protein_g', 11, 'manual', 1],
      ['carbs_g', 4, 'manual', 1],
      ['fat_g', 0.2, 'manual', 1],
      ['salt_g', 0.13, 'manual', 1],
      ['sodium_mg', 52, 'estimated', 1],
    ]);
  });

  it('funziona anche prima del primo download del catalogo', async () => {
    const id = await createFood(db, USER, SKYR, NOW);
    expect((await getFood(db, id))?.nutrients).toHaveLength(6);
  });

  it('se un valore è rifiutato non resta un alimento a metà', async () => {
    await expect(
      createFood(db, USER, { ...SKYR, values: { ...SKYR.values, fat_g: -1 } }, NOW),
    ).rejects.toThrow(/nutrient_value_amount_non_negative/);
    expect(await personalFoods(db, USER)).toEqual([]);
  });

  it('rifiuta un alimento personale senza le date di sincronizzazione', async () => {
    await expect(
      db.runAsync(
        `INSERT INTO food (id, user_id, name, state, base_unit, search_text)
         VALUES ('x', ?, 'X', 'raw', 'g', 'x')`,
        USER,
      ),
    ).rejects.toThrow(/food_personal_dated/);
  });
});

describe('ricerca e alimenti personali', () => {
  it('trova gli alimenti personali per nome e per marca, prima dei generici', async () => {
    await replaceCatalog(db, snapshotText(), { etag: null, syncedAt: NOW.toISOString() });
    await createFood(
      db,
      USER,
      { ...SKYR, name: "Albume d'uovo pastorizzato", brand: 'Eurovo' },
      NOW,
    );
    const byName = await searchFoods(db, 'albume', USER);
    expect(byName[0]).toMatchObject({ name: "Albume d'uovo pastorizzato", brand: 'Eurovo' });
    expect(byName.length).toBeGreaterThan(1);
    expect((await searchFoods(db, 'eurovo', USER)).map((hit) => hit.name)).toEqual([
      "Albume d'uovo pastorizzato",
    ]);
  });

  it('non mostra gli alimenti di un altro utente né quelli eliminati', async () => {
    const id = await createFood(db, OTHER, SKYR, NOW);
    expect(await searchFoods(db, 'skyr', USER)).toEqual([]);
    expect(await searchFoods(db, 'skyr', OTHER)).toHaveLength(1);
    await deleteFood(db, OTHER, id, later(1));
    expect(await searchFoods(db, 'skyr', OTHER)).toEqual([]);
    expect(await getFood(db, id)).toBeNull();
  });

  it('il catalogo nuovo o svuotato lascia gli alimenti personali', async () => {
    const id = await createFood(db, USER, SKYR, NOW);
    await replaceCatalog(db, snapshotText(), { etag: null, syncedAt: NOW.toISOString() });
    await clearCatalog(db);
    expect((await getFood(db, id))?.nutrients).toHaveLength(6);
  });
});

describe('personalFoods', () => {
  it("sono quelli dell'utente, in ordine alfabetico, con le kcal per 100", async () => {
    await createFood(db, USER, SKYR, NOW);
    await createFood(db, USER, { ...SKYR, name: 'Bresaola', brand: null }, later(1));
    await createFood(db, OTHER, { ...SKYR, name: 'Avena' }, NOW);
    expect(await personalFoods(db, USER)).toEqual([
      expect.objectContaining({ name: 'Bresaola', brand: null, kcal: 63 }),
      expect.objectContaining({ name: 'Skyr bianco', brand: 'Müller', kcal: 63 }),
    ]);
  });
});

describe('personalFoods e ricette', () => {
  it('non include le ricette: hanno il loro elenco', async () => {
    const skyr = await createFood(db, USER, SKYR, NOW);
    await createRecipe(
      db,
      USER,
      {
        name: 'Budino',
        yield: { mode: 'portions', portions: 1 },
        items: [{ foodId: skyr, gramsRaw: 150 }],
      },
      later(1),
    );
    expect((await personalFoods(db, USER)).map((food) => food.name)).toEqual(['Skyr bianco']);
  });
});

describe('porzione dichiarata (RF-02)', () => {
  it('si salva con il nome, si legge, si cambia e si toglie', async () => {
    const id = await createFood(
      db,
      USER,
      { ...SKYR, serving: { grams: 170, name: ' vasetto ' } },
      NOW,
    );
    expect((await getFood(db, id))?.serving).toEqual({ grams: 170, name: 'vasetto' });
    await updateFood(db, USER, id, { ...SKYR, serving: { grams: 150, name: null } }, later(1));
    expect((await getFood(db, id))?.serving).toEqual({ grams: 150, name: null });
    await updateFood(db, USER, id, SKYR, later(2));
    expect((await getFood(db, id))?.serving).toBeNull();
  });

  it('un nome vuoto vale nessun nome; i grammi non positivi sono rifiutati', async () => {
    const id = await createFood(db, USER, { ...SKYR, serving: { grams: 30, name: '  ' } }, NOW);
    expect((await getFood(db, id))?.serving).toEqual({ grams: 30, name: null });
    await expect(
      createFood(db, USER, { ...SKYR, serving: { grams: 0, name: 'uovo' } }, NOW),
    ).rejects.toThrow(/food_serving_positive/);
  });
});

describe('updateFood e deleteFood', () => {
  it('la modifica sostituisce nome, marca e valori', async () => {
    const id = await createFood(db, USER, SKYR, NOW);
    const changed = await updateFood(
      db,
      USER,
      id,
      { ...SKYR, name: 'Skyr magro', brand: null, values: { energy_kcal: 60, protein_g: 12 } },
      later(1),
    );
    expect(changed).toBe(true);
    const food = await getFood(db, id);
    expect(food).toMatchObject({ name: 'Skyr magro', brand: null });
    expect(food?.nutrients.map((n) => [n.code, n.amountPer100])).toEqual([
      ['energy_kcal', 60],
      ['protein_g', 12],
    ]);
    expect((await searchFoods(db, 'magro', USER)).map((hit) => hit.id)).toEqual([id]);
    expect(await searchFoods(db, 'muller', USER)).toEqual([]);
  });

  it("non tocca l'alimento di un altro utente né i generici", async () => {
    const id = await createFood(db, OTHER, SKYR, NOW);
    expect(await updateFood(db, USER, id, { ...SKYR, name: 'Rubato' }, later(1))).toBe(false);
    await deleteFood(db, USER, id, later(1));
    expect(await getFood(db, id)).toMatchObject({ name: 'Skyr bianco' });

    await replaceCatalog(db, snapshotText(), { etag: null, syncedAt: NOW.toISOString() });
    expect(await updateFood(db, USER, 'albume-crudo', SKYR, later(1))).toBe(false);
    expect(await getFood(db, 'albume-crudo')).toMatchObject({ name: "Albume d'uovo" });
  });

  it('un alimento personale senza fonte si elenca, si modifica e si elimina', async () => {
    // `source <> 'recipe'` con source NULL non sarebbe vero: l'alimento resterebbe bloccato.
    await db.runAsync(
      `INSERT INTO food (id, user_id, name, state, base_unit, search_text, source, created_at,
         updated_at)
       VALUES ('senza-fonte', ?, 'Grana', 'not_applicable', 'g', 'grana', NULL, ?, ?)`,
      USER,
      NOW.toISOString(),
      NOW.toISOString(),
    );
    expect((await personalFoods(db, USER)).map((food) => food.id)).toEqual(['senza-fonte']);
    expect(await updateFood(db, USER, 'senza-fonte', SKYR, later(1))).toBe(true);
    await deleteFood(db, USER, 'senza-fonte', later(2));
    expect(await getFood(db, 'senza-fonte')).toBeNull();
  });

  it("se un valore è rifiutato la modifica non tocca l'alimento", async () => {
    const id = await createFood(db, USER, SKYR, NOW);
    await expect(
      updateFood(db, USER, id, { ...SKYR, name: 'Rotto', values: { fat_g: -1 } }, later(1)),
    ).rejects.toThrow(/nutrient_value_amount_non_negative/);
    const food = await getFood(db, id);
    expect(food?.name).toBe('Skyr bianco');
    expect(food?.nutrients).toHaveLength(6);
  });
});

describe('preferiti e recenti degli alimenti personali', () => {
  it('rinominato, il preferito mostra il nome nuovo', async () => {
    const id = await createFood(db, USER, SKYR, NOW);
    await setFavorite(db, USER, { id, name: 'Skyr bianco', state: 'not_applicable' }, true, NOW);
    await updateFood(db, USER, id, { ...SKYR, name: 'Skyr greco', state: 'raw' }, later(1));
    expect((await favorites(db, USER)).map((f) => [f.foodName, f.foodState])).toEqual([
      ['Skyr greco', 'raw'],
    ]);
  });

  it('eliminato, sparisce da preferiti e recenti; il diario resta', async () => {
    const id = await createFood(db, USER, SKYR, NOW);
    const food = await getFood(db, id);
    if (food === null) throw new Error('alimento non salvato');
    await setFavorite(db, USER, food, true, NOW);
    const [slot] = await ensureMealSlots(db, USER, NOW);
    await addEntry(db, {
      userId: USER,
      date: '2026-11-21',
      mealSlotId: slot?.id ?? '',
      food,
      quantity: 170,
      now: NOW,
    });
    await deleteFood(db, USER, id, later(1));
    expect(await favorites(db, USER)).toEqual([]);
    expect(await recentFoods(db, USER, 10)).toEqual([]);
    expect(await entriesForDay(db, USER, '2026-11-21')).toHaveLength(1);
  });
});
