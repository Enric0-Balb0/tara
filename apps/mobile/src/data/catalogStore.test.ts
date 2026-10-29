import { beforeEach, describe, expect, it } from 'vitest';

import { catalogInfo, markChecked, replaceCatalog, SnapshotError } from './catalogStore';
import { initDatabase } from './schema';
import type { SqlDatabase } from './sql';
import { openTestDatabase } from './testing/nodeDatabase';
import { snapshotText, TEST_FOODS } from './testing/snapshot';

const SYNCED_AT = '2026-10-27T14:42:00.000Z';

let db: SqlDatabase;

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
});

function replaceV1() {
  return replaceCatalog(db, snapshotText(), { etag: '"v1"', syncedAt: SYNCED_AT });
}

function valueCount(foodId: string) {
  return db
    .getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM nutrient_value WHERE food_id = ?', foodId)
    .then((row) => row?.n);
}

describe('replaceCatalog', () => {
  it('salva alimenti, nomi per la ricerca e valori con provenienza', async () => {
    expect(await replaceV1()).toEqual({ version: 'v1', foodCount: 3 });
    expect(await catalogInfo(db)).toEqual({
      foodCount: 3,
      version: 'v1',
      etag: '"v1"',
      syncedAt: SYNCED_AT,
      checkedAt: SYNCED_AT,
    });
    const coffee = await db.getFirstAsync<{ search_text: string }>(
      "SELECT search_text FROM food WHERE id = 'caffe-espresso'",
    );
    expect(coffee?.search_text).toBe('caffe espresso\nespresso');
    const protein = await db.getFirstAsync(
      `SELECT amount_per_100, provenance, confidence FROM nutrient_value
       WHERE food_id = 'albume-crudo' AND nutrient_code = 'protein_g'`,
    );
    expect(protein).toEqual({ amount_per_100: 10.9, provenance: 'reference', confidence: 0.9 });
  });

  it('salva la fonte di ogni alimento', async () => {
    await replaceV1();
    const sources = await db.getAllAsync<{ source: string | null }>('SELECT DISTINCT source FROM food');
    expect(sources).toEqual([{ source: 'ciqual' }]);
  });

  it('uno snapshot senza fonte lascia la fonte vuota', async () => {
    const formatOne = TEST_FOODS.map(({ source: _source, ...food }) => food);
    await replaceCatalog(db, snapshotText(formatOne), { etag: null, syncedAt: SYNCED_AT });
    const sources = await db.getAllAsync<{ source: string | null }>('SELECT DISTINCT source FROM food');
    expect(sources).toEqual([{ source: null }]);
  });

  it('un nutriente assente non diventa zero', async () => {
    await replaceV1();
    const sugars = await db.getFirstAsync<{ n: number }>(
      "SELECT count(*) AS n FROM nutrient_value WHERE food_id = 'albume-crudo' AND nutrient_code = 'sugars_g'",
    );
    expect(sugars?.n).toBe(0);
    expect(await valueCount('albume-crudo')).toBe(4);
  });

  it('un catalogo nuovo sostituisce il vecchio', async () => {
    await replaceV1();
    const withoutCoffee = TEST_FOODS.filter((food) => food.id !== 'caffe-espresso');
    const result = await replaceCatalog(db, snapshotText(withoutCoffee, 'v2'), {
      etag: '"v2"',
      syncedAt: SYNCED_AT,
    });
    expect(result).toEqual({ version: 'v2', foodCount: 2 });
    expect(await db.getFirstAsync("SELECT id FROM food WHERE id = 'caffe-espresso'")).toBeNull();
    expect(await valueCount('caffe-espresso')).toBe(0);
  });

  it('uno snapshot rifiutato lascia intatto il catalogo di prima', async () => {
    await replaceV1();
    const before = await catalogInfo(db);
    const boiled = { ...TEST_FOODS[0]!, id: 'albume-bollito', state: 'boiled' };
    await expect(
      replaceCatalog(db, snapshotText([...TEST_FOODS, boiled], 'v3'), {
        etag: '"v3"',
        syncedAt: '2026-10-28T08:00:00.000Z',
      }),
    ).rejects.toThrow(/food_state_valid/);
    expect(await catalogInfo(db)).toEqual(before);
    expect(await valueCount('albume-crudo')).toBe(4);
  });

  it('un valore di un nutriente sconosciuto rifiuta lo snapshot', async () => {
    await replaceV1();
    const before = await catalogInfo(db);
    const [eggWhite, ...rest] = TEST_FOODS;
    const ghost = {
      ...eggWhite!,
      values: { ...eggWhite!.values, ghost_g: { amount: 1, provenance: 'reference', confidence: 1 } },
    };
    await expect(
      replaceCatalog(db, snapshotText([ghost, ...rest], 'v2'), { etag: '"v2"', syncedAt: SYNCED_AT }),
    ).rejects.toBeInstanceOf(SnapshotError);
    expect(await catalogInfo(db)).toEqual(before);
  });

  it('un catalogo senza alimenti non cancella quello di prima', async () => {
    await replaceV1();
    const before = await catalogInfo(db);
    await expect(
      replaceCatalog(db, snapshotText([], 'v2'), { etag: '"v2"', syncedAt: SYNCED_AT }),
    ).rejects.toBeInstanceOf(SnapshotError);
    expect(await catalogInfo(db)).toEqual(before);
  });

  it('testo non JSON o senza foods dà SnapshotError', async () => {
    const meta = { etag: null, syncedAt: SYNCED_AT };
    await expect(replaceCatalog(db, '<html>', meta)).rejects.toBeInstanceOf(SnapshotError);
    await expect(replaceCatalog(db, '{"version":"x"}', meta)).rejects.toBeInstanceOf(
      SnapshotError,
    );
  });

  it('un alimento senza nomi validi dà SnapshotError', async () => {
    const noNames = { ...TEST_FOODS[0]!, names: [42] } as unknown as (typeof TEST_FOODS)[0];
    await expect(
      replaceCatalog(db, snapshotText([noNames]), { etag: null, syncedAt: SYNCED_AT }),
    ).rejects.toBeInstanceOf(SnapshotError);
  });

  it("senza ETag non resta quello del catalogo di prima", async () => {
    await replaceV1();
    await replaceCatalog(db, snapshotText(TEST_FOODS, 'v2'), { etag: null, syncedAt: SYNCED_AT });
    expect((await catalogInfo(db)).etag).toBeNull();
  });

  it('non tocca gli alimenti personali', async () => {
    await replaceV1();
    await db.runAsync(
      `INSERT INTO food (id, user_id, name, state, base_unit, search_text)
       VALUES ('mio', 'u1', 'Pancake proteico', 'cooked', 'g', 'pancake proteico')`,
    );
    await db.runAsync(
      `INSERT INTO nutrient_value (food_id, nutrient_code, amount_per_100, provenance, confidence)
       VALUES ('mio', 'protein_g', 25, 'manual', 1)`,
    );
    await replaceCatalog(db, snapshotText(TEST_FOODS, 'v2'), { etag: '"v2"', syncedAt: SYNCED_AT });
    expect(await db.getFirstAsync("SELECT user_id FROM food WHERE id = 'mio'")).toEqual({
      user_id: 'u1',
    });
    expect(await valueCount('mio')).toBe(1);
    expect((await catalogInfo(db)).foodCount).toBe(3);
  });
});

describe('catalogInfo', () => {
  it('senza catalogo non ha né versione né date', async () => {
    expect(await catalogInfo(db)).toEqual({
      foodCount: 0,
      version: null,
      etag: null,
      syncedAt: null,
      checkedAt: null,
    });
  });
});

describe('markChecked', () => {
  it("aggiorna solo l'ora del controllo", async () => {
    await replaceV1();
    await markChecked(db, '2026-10-28T08:00:00.000Z');
    const info = await catalogInfo(db);
    expect(info.checkedAt).toBe('2026-10-28T08:00:00.000Z');
    expect(info.syncedAt).toBe(SYNCED_AT);
    expect(info.version).toBe('v1');
  });
});
