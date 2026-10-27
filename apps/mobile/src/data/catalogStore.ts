/**
 * Catalogo condiviso dei generici sul telefono (RF-01, RF-03): lo snapshot di
 * `GET /v1/catalog` sostituisce quello di prima in una sola transazione, e da lì in poi
 * ricerca e scheda leggono solo da SQLite, anche senza rete.
 */

import type { BaseUnit, FoodState } from '@/domain/food';
import { searchKey } from '@/domain/search';

import type { SqlDatabase } from './sql';

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export interface CatalogInfo {
  foodCount: number;
  version: string | null;
  etag: string | null;
  /** ISO 8601: ultimo catalogo scaricato. */
  syncedAt: string | null;
  /** ISO 8601: ultima volta che il server ha confermato il catalogo. */
  checkedAt: string | null;
}

const STATE_KEYS = {
  version: 'catalog_version',
  etag: 'catalog_etag',
  syncedAt: 'catalog_synced_at',
  checkedAt: 'catalog_checked_at',
} as const;

interface SnapshotFoodNames {
  id: string;
  name: string;
  state: unknown;
  base_unit: unknown;
  names: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Controlla in JavaScript solo ciò che serve per i nomi; tipi e valori ammessi di stato,
 * unità e nutrienti li verificano i vincoli delle tabelle durante l'inserimento.
 */
function parseSnapshot(text: string): { version: string; foods: SnapshotFoodNames[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SnapshotError('Il catalogo ricevuto non è JSON');
  }
  if (
    !isRecord(data) ||
    typeof data.version !== 'string' ||
    data.version === '' ||
    !Array.isArray(data.nutrients) ||
    !Array.isArray(data.foods)
  ) {
    throw new SnapshotError('Il catalogo ricevuto non ha la forma attesa');
  }
  const foods = data.foods.map((food: unknown) => {
    if (
      !isRecord(food) ||
      typeof food.id !== 'string' ||
      typeof food.name !== 'string' ||
      !Array.isArray(food.names) ||
      !food.names.every((name) => typeof name === 'string')
    ) {
      throw new SnapshotError('Un alimento del catalogo non ha id e nomi validi');
    }
    return food as unknown as SnapshotFoodNames;
  });
  return { version: data.version, foods };
}

function searchText(food: SnapshotFoodNames): string {
  return [...new Set([food.name, ...food.names].map(searchKey))].join('\n');
}

async function setState(db: SqlDatabase, key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db.runAsync('DELETE FROM sync_state WHERE key = ?', key);
    return;
  }
  await db.runAsync(
    `INSERT INTO sync_state (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

async function sharedFoodCount(db: SqlDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT count(*) AS n FROM food WHERE user_id IS NULL',
  );
  return row?.n ?? 0;
}

/**
 * Sostituisce il catalogo condiviso con lo snapshot. Se qualcosa non va, la transazione
 * si annulla e resta il catalogo di prima; gli alimenti personali non si toccano.
 */
export async function replaceCatalog(
  db: SqlDatabase,
  snapshotText: string,
  meta: { etag: string | null; syncedAt: string },
): Promise<{ version: string; foodCount: number }> {
  const snapshot = parseSnapshot(snapshotText);
  const foodRows = JSON.stringify(
    snapshot.foods.map((food) => [food.id, food.name, food.state, food.base_unit, searchText(food)]),
  );
  let foodCount = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    // Cancellazioni esplicite: nella connessione della transazione foreign_keys è spento.
    await txn.runAsync(
      'DELETE FROM nutrient_value WHERE food_id IN (SELECT id FROM food WHERE user_id IS NULL)',
    );
    await txn.runAsync('DELETE FROM food WHERE user_id IS NULL');
    // WHERE true: senza, SQLite non distingue ON CONFLICT dalla join della SELECT.
    await txn.runAsync(
      `INSERT INTO nutrient (code, name, unit, display_order)
       SELECT json_extract(value, '$.code'), json_extract(value, '$.name'),
              json_extract(value, '$.unit'), key
       FROM json_each(?, '$.nutrients') WHERE true
       ON CONFLICT (code) DO UPDATE SET
         name = excluded.name, unit = excluded.unit, display_order = excluded.display_order`,
      snapshotText,
    );
    await txn.runAsync(
      `INSERT INTO food (id, user_id, name, state, base_unit, search_text)
       SELECT json_extract(value, '$[0]'), NULL, json_extract(value, '$[1]'),
              json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[4]')
       FROM json_each(?)`,
      foodRows,
    );
    // Circa 90 000 valori in una sola istruzione, letti direttamente dal testo ricevuto.
    await txn.runAsync(
      `INSERT INTO nutrient_value (food_id, nutrient_code, amount_per_100, provenance, confidence)
       SELECT json_extract(food.value, '$.id'), entry.key,
              json_extract(entry.value, '$.amount'), json_extract(entry.value, '$.provenance'),
              json_extract(entry.value, '$.confidence')
       FROM json_each(?, '$.foods') AS food, json_each(food.value, '$.values') AS entry`,
      snapshotText,
    );
    await setState(txn, STATE_KEYS.version, snapshot.version);
    await setState(txn, STATE_KEYS.etag, meta.etag);
    await setState(txn, STATE_KEYS.syncedAt, meta.syncedAt);
    await setState(txn, STATE_KEYS.checkedAt, meta.syncedAt);
    foodCount = await sharedFoodCount(txn);
  });
  return { version: snapshot.version, foodCount };
}

export async function catalogInfo(db: SqlDatabase): Promise<CatalogInfo> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM sync_state',
  );
  const state = new Map(rows.map((row) => [row.key, row.value]));
  return {
    foodCount: await sharedFoodCount(db),
    version: state.get(STATE_KEYS.version) ?? null,
    etag: state.get(STATE_KEYS.etag) ?? null,
    syncedAt: state.get(STATE_KEYS.syncedAt) ?? null,
    checkedAt: state.get(STATE_KEYS.checkedAt) ?? null,
  };
}

/** Il server ha confermato che il catalogo sul telefono è quello attuale. */
export async function markChecked(db: SqlDatabase, checkedAt: string): Promise<void> {
  await setState(db, STATE_KEYS.checkedAt, checkedAt);
}

export interface FoodHit {
  id: string;
  name: string;
  state: FoodState;
  baseUnit: BaseUnit;
  /** Un macro sconosciuto è null, non zero (principio 2). */
  per100: {
    energy_kcal: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
  };
}

export interface FoodNutrient {
  code: string;
  name: string;
  unit: string;
  amountPer100: number;
  provenance: string;
  confidence: number;
}

export interface FoodDetail {
  id: string;
  name: string;
  state: FoodState;
  baseUnit: BaseUnit;
  /** Solo i nutrienti noti, nell'ordine di visualizzazione. */
  nutrients: FoodNutrient[];
}

interface FoodRow {
  id: string;
  name: string;
  state: FoodState;
  base_unit: BaseUnit;
}

const MIN_QUERY_LENGTH = 2;

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Codici fissi del codice, mai testo dell'utente: si possono scrivere nell'SQL.
function macroColumn(code: keyof FoodHit['per100']): string {
  return `(SELECT amount_per_100 FROM nutrient_value WHERE food_id = f.id AND nutrient_code = '${code}') AS ${code}`;
}

/**
 * Le regole di `search_foods` del backend, senza la somiglianza a trigrammi: ogni parola
 * deve comparire in un nome; prima i nomi che iniziano con la ricerca, poi il crudo (si
 * pesa a crudo, principio 4), poi i nomi più corti.
 */
export async function searchFoods(db: SqlDatabase, query: string, limit = 20): Promise<FoodHit[]> {
  const key = searchKey(query);
  if (key.length < MIN_QUERY_LENGTH) return [];
  const words = key.split(' ');
  const rows = await db.getAllAsync<FoodRow & FoodHit['per100']>(
    `SELECT f.id, f.name, f.state, f.base_unit,
            ${macroColumn('energy_kcal')}, ${macroColumn('protein_g')},
            ${macroColumn('carbs_g')}, ${macroColumn('fat_g')}
     FROM food AS f
     WHERE ${words.map(() => "f.search_text LIKE ? ESCAPE '\\'").join(' AND ')}
     ORDER BY (char(10) || f.search_text) LIKE ? ESCAPE '\\' DESC,
              f.state = 'raw' DESC, length(f.name), f.name
     LIMIT ?`,
    ...words.map((word) => `%${escapeLike(word)}%`),
    `%\n${escapeLike(key)}%`,
    limit,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    state: row.state,
    baseUnit: row.base_unit,
    per100: {
      energy_kcal: row.energy_kcal,
      protein_g: row.protein_g,
      carbs_g: row.carbs_g,
      fat_g: row.fat_g,
    },
  }));
}

export async function getFood(db: SqlDatabase, id: string): Promise<FoodDetail | null> {
  const food = await db.getFirstAsync<FoodRow>(
    'SELECT id, name, state, base_unit FROM food WHERE id = ?',
    id,
  );
  if (food === null) return null;
  const nutrients = await db.getAllAsync<FoodNutrient>(
    `SELECT v.nutrient_code AS code, n.name, n.unit, v.amount_per_100 AS amountPer100,
            v.provenance, v.confidence
     FROM nutrient_value AS v JOIN nutrient AS n ON n.code = v.nutrient_code
     WHERE v.food_id = ?
     ORDER BY n.display_order`,
    id,
  );
  return { id: food.id, name: food.name, state: food.state, baseUnit: food.base_unit, nutrients };
}
