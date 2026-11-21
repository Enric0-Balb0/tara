/**
 * Schema del database sul telefono: catalogo dei generici (RF-01, RF-03) e stato della
 * sincronizzazione. Le regole del backend sono vincoli anche qui; le tabelle sono STRICT,
 * così un valore del tipo sbagliato fallisce invece di finire salvato come testo.
 */

import type { SqlDatabase } from './sql';

/** La migrazione `i` porta il database dalla versione `i` alla `i + 1`. Esportate per i test. */
export const MIGRATIONS: readonly string[] = [
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
  // v2: da dove vengono i valori (snapshot del formato 2). NULL per il catalogo scaricato
  // prima: la fonte arriva con il download successivo.
  `
  ALTER TABLE food ADD COLUMN source TEXT
    CONSTRAINT food_source_valid
    CHECK (source IN ('ciqual', 'usda', 'open_food_facts', 'label', 'manual', 'recipe'));
  `,
  // v3: metodo di cottura dei cotti (snapshot del formato 3), dettaglio in secondo piano.
  // NULL per il catalogo scaricato prima: la cottura arriva con il download successivo.
  `
  ALTER TABLE food ADD COLUMN cooking TEXT
    CONSTRAINT food_cooking_valid
    CHECK (cooking IS NULL OR (length(trim(cooking)) > 0 AND state = 'cooked'));
  `,
  // v4: diario (RF-40, RF-43). Già pronto per la sincronizzazione: id UUIDv7 creati sul
  // telefono, updated_at per "vince l'ultima scrittura", deleted_at al posto di DELETE.
  `
  CREATE TABLE meal_slot (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL
      CONSTRAINT meal_slot_name_not_blank CHECK (length(trim(name)) > 0),
    position INTEGER NOT NULL,
    expected_time TEXT
      CONSTRAINT meal_slot_expected_time_valid
      CHECK (expected_time IS NULL OR expected_time GLOB '[0-2][0-9]:[0-5][0-9]'),
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) STRICT;

  CREATE TABLE diary_entry (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL
      CONSTRAINT diary_entry_date_valid
      CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    meal_slot_id TEXT NOT NULL REFERENCES meal_slot (id),
    -- Nessun riferimento a food: il catalogo si sostituisce, la voce resta con la sua copia.
    food_id TEXT NOT NULL,
    food_name TEXT NOT NULL,
    food_state TEXT NOT NULL
      CONSTRAINT diary_entry_food_state_valid
      CHECK (food_state IN ('raw', 'cooked', 'not_applicable')),
    quantity REAL NOT NULL
      CONSTRAINT diary_entry_quantity_positive CHECK (quantity > 0),
    unit TEXT NOT NULL
      CONSTRAINT diary_entry_unit_valid CHECK (unit IN ('g', 'ml')),
    -- Valori per 100 al momento della registrazione (RF-43), solo i nutrienti noti.
    nutrients_snapshot TEXT NOT NULL
      CONSTRAINT diary_entry_snapshot_json CHECK (json_valid(nutrients_snapshot)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) STRICT;

  CREATE INDEX diary_entry_day ON diary_entry (user_id, date);
  CREATE INDEX diary_entry_food_slot ON diary_entry (user_id, food_id, meal_slot_id);
  `,
  // v5: tipi di giornata, target con storico e tipo assegnato a ogni giorno (RF-50, RF-51,
  // RF-53). Come il diario, pronti per la sincronizzazione.
  `
  CREATE TABLE day_type (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL
      CONSTRAINT day_type_name_not_blank CHECK (length(trim(name)) > 0),
    position INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) STRICT;

  -- Un target vale da valid_from fino al successivo dello stesso tipo. NULL = non impostato.
  CREATE TABLE day_type_target (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    day_type_id TEXT NOT NULL REFERENCES day_type (id),
    valid_from TEXT NOT NULL
      CONSTRAINT day_type_target_valid_from_valid
      CHECK (valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    kcal REAL,
    protein_g REAL,
    carbs_g REAL,
    fat_g REAL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CONSTRAINT day_type_target_values_non_negative CHECK (
      coalesce(kcal, 0) >= 0 AND coalesce(protein_g, 0) >= 0
      AND coalesce(carbs_g, 0) >= 0 AND coalesce(fat_g, 0) >= 0
    )
  ) STRICT;

  CREATE UNIQUE INDEX day_type_target_one_per_day
    ON day_type_target (day_type_id, valid_from) WHERE deleted_at IS NULL;

  CREATE TABLE day_plan (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL
      CONSTRAINT day_plan_date_valid
      CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
    day_type_id TEXT NOT NULL REFERENCES day_type (id),
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  ) STRICT;

  CREATE UNIQUE INDEX day_plan_one_per_day ON day_plan (user_id, date) WHERE deleted_at IS NULL;
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
