import { beforeEach, describe, expect, it } from 'vitest';

import { initDatabase, SCHEMA_VERSION } from './schema';
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
    expect(tables.map((t) => t.name)).toEqual(['food', 'nutrient', 'nutrient_value', 'sync_state']);
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('rieseguita non tocca i dati', async () => {
    await db.runAsync(
      'INSERT INTO nutrient (code, name, unit, display_order) VALUES (?, ?, ?, ?)',
      'protein_g',
      'Proteine',
      'g',
      0,
    );
    await initDatabase(db);
    const rows = await db.getAllAsync<{ code: string }>('SELECT code FROM nutrient');
    expect(rows).toEqual([{ code: 'protein_g' }]);
  });

  it('rifiuta uno stato non previsto', async () => {
    await expect(insertEggWhite('boiled')).rejects.toThrow(/food_state_valid/);
  });

  it('rifiuta un valore che non è un numero', async () => {
    await insertEggWhite();
    await db.runAsync(
      'INSERT INTO nutrient (code, name, unit, display_order) VALUES (?, ?, ?, ?)',
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
      'INSERT INTO nutrient (code, name, unit, display_order) VALUES (?, ?, ?, ?)',
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
