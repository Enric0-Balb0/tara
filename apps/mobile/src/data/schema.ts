/**
 * Schema del database sul telefono: catalogo dei generici (RF-01, RF-03) e stato della
 * sincronizzazione. Le regole del backend sono vincoli anche qui; le tabelle sono STRICT,
 * così un valore del tipo sbagliato fallisce invece di finire salvato come testo.
 */

import type { SqlDatabase } from './sql';

/** La migrazione `i` porta il database dalla versione `i` alla `i + 1`. */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE nutrient (
    code TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    display_order INTEGER NOT NULL
  ) STRICT;

  -- user_id NULL: catalogo condiviso. Gli alimenti personali (F1) avranno il loro.
  CREATE TABLE food (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    state TEXT NOT NULL
      CONSTRAINT food_state_valid CHECK (state IN ('raw', 'cooked', 'not_applicable')),
    base_unit TEXT NOT NULL
      CONSTRAINT food_base_unit_valid CHECK (base_unit IN ('g', 'ml')),
    -- Nomi senza accenti e in minuscolo (searchKey), uno per riga.
    search_text TEXT NOT NULL
  ) STRICT;

  -- Un nutriente sconosciuto non ha riga: mancante non vuol dire zero (principio 2).
  CREATE TABLE nutrient_value (
    food_id TEXT NOT NULL REFERENCES food (id),
    nutrient_code TEXT NOT NULL REFERENCES nutrient (code),
    amount_per_100 REAL NOT NULL
      CONSTRAINT nutrient_value_amount_non_negative CHECK (amount_per_100 >= 0),
    provenance TEXT NOT NULL
      CONSTRAINT nutrient_value_provenance_valid
      CHECK (provenance IN ('label', 'open_food_facts', 'reference', 'estimated', 'manual')),
    confidence REAL NOT NULL
      CONSTRAINT nutrient_value_confidence_range CHECK (confidence BETWEEN 0 AND 1),
    PRIMARY KEY (food_id, nutrient_code)
  ) STRICT, WITHOUT ROWID;

  CREATE TABLE sync_state (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  ) STRICT;
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Pragma della connessione e migrazioni fino a `SCHEMA_VERSION`; da `onInit` di SQLiteProvider. */
export async function initDatabase(db: SqlDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let version = row?.user_version ?? 0; version < SCHEMA_VERSION; version++) {
    const migration = MIGRATIONS[version] ?? '';
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(migration);
      await txn.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
