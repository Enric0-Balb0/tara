import { beforeEach, describe, expect, it } from 'vitest';

import { initDatabase, MIGRATIONS, SCHEMA_VERSION } from './schema';
import type { SqlDatabase } from './sql';
import { openTestDatabase } from './testing/nodeDatabase';

let db: SqlDatabase;

beforeEach(async () => {
  db = openTestDatabase();
  await initDatabase(db);
});

async function insertEggWhite(state = 'raw') {
  await db.runAsync(
    'INSERT INTO food (id, user_id, name, state, base_unit, search_text) VALUES (?, NULL, ?, ?, ?, ?)',
    'f1',
    "Albume d'uovo",
    state,
    'g',
    "albume d'uovo",
  );
}

describe('initDatabase', () => {
  it('crea le tabelle e porta user_version a SCHEMA_VERSION', async () => {
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual([
      'day_plan',
      'day_type',
      'day_type_target',
      'day_type_water',
      'diary_entry',
      'favorite_food',
      'food',
      'meal_slot',
      'nutrient',
      'nutrient_value',
      'plan_item',
      'recipe',
      'recipe_item',
      'saved_meal',
      'saved_meal_item',
      'sync_state',
      'user_setting',
      'water_entry',
      'weight_entry',
    ]);
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(12);
  });

  it('chi trova il database occupato aspetta invece di fallire subito', async () => {
    // Il download del catalogo tiene il database in una transazione esclusiva per qualche
    // secondo: senza attesa la prima lettura del diario fallisce con SQLITE_BUSY.
    const row = await db.getFirstAsync<{ timeout: number }>('PRAGMA busy_timeout');
    expect(row?.timeout).toBeGreaterThanOrEqual(5000);
  });

  it('rieseguita non tocca i dati', async () => {
    await db.runAsync(
      'INSERT INTO nutrient (code, name, unit, display_order) VALUES (?, ?, ?, ?)',
      'caffeine_mg',
      'Caffeina',
      'mg',
      24,
    );
    await initDatabase(db);
    const rows = await db.getAllAsync<{ code: string }>('SELECT code FROM nutrient ORDER BY code');
    expect(rows).toHaveLength(11);
    expect(rows).toContainEqual({ code: 'caffeine_mg' });
  });

  it("ha da subito i nutrienti dell'etichetta, per gli alimenti personali", async () => {
    const rows = await db.getAllAsync<{ code: string }>(
      'SELECT code FROM nutrient ORDER BY display_order',
    );
    expect(rows.map((row) => row.code)).toEqual([
      'energy_kcal',
      'energy_kj',
      'protein_g',
      'carbs_g',
      'sugars_g',
      'fat_g',
      'sat_fat_g',
      'fiber_g',
      'salt_g',
      'sodium_mg',
    ]);
  });

  it('rifiuta uno stato non previsto', async () => {
    await expect(insertEggWhite('boiled')).rejects.toThrow(/food_state_valid/);
  });

  it('rifiuta un valore che non è un numero', async () => {
    await insertEggWhite();
    await db.runAsync(
      'INSERT OR IGNORE INTO nutrient (code, name, unit, display_order) VALUES (?, ?, ?, ?)',
      'protein_g',
      'Proteine',
      'g',
      0,
    );
    await expect(
      db.runAsync(
        'INSERT INTO nutrient_value (food_id, nutrient_code, amount_per_100, provenance, confidence) VALUES (?, ?, ?, ?, ?)',
        'f1',
        'protein_g',
        'abc',
        'reference',
        0.9,
      ),
    ).rejects.toThrow(/REAL/);
  });

  it('rifiuta una confidenza fuori da 0..1', async () => {
    await insertEggWhite();
    await db.runAsync(
      'INSERT OR IGNORE INTO nutrient (code, name, unit, display_order) VALUES (?, ?, ?, ?)',
      'protein_g',
      'Proteine',
      'g',
      0,
    );
    await expect(
      db.runAsync(
        'INSERT INTO nutrient_value (food_id, nutrient_code, amount_per_100, provenance, confidence) VALUES (?, ?, ?, ?, ?)',
        'f1',
        'protein_g',
        10.9,
        'reference',
        1.5,
      ),
    ).rejects.toThrow(/nutrient_value_confidence_range/);
  });
});

describe('migrazione alla versione 2', () => {
  it('migra un database della versione 1 senza perdere il catalogo', async () => {
    const old = openTestDatabase();
    await old.execAsync(MIGRATIONS[0] ?? '');
    await old.execAsync('PRAGMA user_version = 1');
    await old.runAsync(
      "INSERT INTO food (id, name, state, base_unit, search_text) VALUES ('f1', 'Albume d''uovo', 'raw', 'g', 'albume d''uovo')",
    );
    await initDatabase(old);
    const version = await old.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(SCHEMA_VERSION);
    expect(await old.getFirstAsync("SELECT name, source FROM food WHERE id = 'f1'")).toEqual({
      name: "Albume d'uovo",
      source: null,
    });
  });

  it('rifiuta una fonte sconosciuta', async () => {
    await expect(
      db.runAsync(
        "INSERT INTO food (id, name, state, base_unit, search_text, source) VALUES ('f2', 'Pane', 'not_applicable', 'g', 'pane', 'wiki')",
      ),
    ).rejects.toThrow(/food_source_valid/);
  });
});

describe('migrazione alla versione 3', () => {
  it('migra un database della versione 2 senza perdere il catalogo', async () => {
    const old = openTestDatabase();
    await old.execAsync(MIGRATIONS[0] ?? '');
    await old.execAsync(MIGRATIONS[1] ?? '');
    await old.execAsync('PRAGMA user_version = 2');
    await old.runAsync(
      "INSERT INTO food (id, name, state, base_unit, search_text, source) VALUES ('f1', 'Broccoli', 'cooked', 'g', 'broccoli', 'ciqual')",
    );
    await initDatabase(old);
    const version = await old.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(SCHEMA_VERSION);
    expect(await old.getFirstAsync("SELECT name, cooking FROM food WHERE id = 'f1'")).toEqual({
      name: 'Broccoli',
      cooking: null,
    });
  });

  it('la cottura vale solo per i cotti', async () => {
    await expect(
      db.runAsync(
        "INSERT INTO food (id, name, state, base_unit, search_text, cooking) VALUES ('f2', 'Broccoli', 'raw', 'g', 'broccoli', 'al vapore')",
      ),
    ).rejects.toThrow(/food_cooking_valid/);
  });

  it('rifiuta una cottura vuota', async () => {
    await expect(
      db.runAsync(
        "INSERT INTO food (id, name, state, base_unit, search_text, cooking) VALUES ('f3', 'Broccoli', 'cooked', 'g', 'broccoli', ' ')",
      ),
    ).rejects.toThrow(/food_cooking_valid/);
  });
});
