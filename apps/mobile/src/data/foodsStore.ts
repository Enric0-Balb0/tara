/**
 * Catalogo personale (RF-02, RF-18): i prodotti inseriti a mano stanno nella stessa tabella
 * dei generici con il loro `user_id`, così ricerca, scheda e diario li trattano allo stesso
 * modo. Pronti per la sincronizzazione: id UUIDv7, date e cancellazione logica.
 * Modificarne uno non riscrive il diario, che ha i valori del momento (principio 7).
 */

import type { BaseUnit, FoodState } from '@/domain/food';
import { newId } from '@/domain/ids';
import { searchKey } from '@/domain/search';

import { refreshRecipesUsing } from './recipesStore';
import type { SqlDatabase } from './sql';

export interface PersonalFoodInput {
  name: string;
  brand: string | null;
  state: FoodState;
  baseUnit: BaseUnit;
  /** Per 100 g o 100 ml, per codice di nutriente; un nutriente assente manca. */
  values: Readonly<Record<string, number>>;
  /** I valori calcolati da altri (kcal dai kJ, sodio dal sale): provenienza `estimated`. */
  derived?: readonly string[];
}

export interface PersonalFood {
  id: string;
  name: string;
  brand: string | null;
  state: FoodState;
  baseUnit: BaseUnit;
  kcal: number | null;
}

/** Nome e marca, ognuno su una riga: la ricerca trova il prodotto anche dalla marca. */
function searchText(input: PersonalFoodInput): string {
  return [input.name, input.brand]
    .filter((text): text is string => text !== null && text.trim() !== '')
    .map(searchKey)
    .join('\n');
}

function brandOf(input: PersonalFoodInput): string | null {
  const brand = input.brand?.trim() ?? '';
  return brand === '' ? null : brand;
}

// Scritti a mano dall'etichetta (`manual`) o calcolati da quelli (`estimated`, così in modifica
// si ricalcolano); confidenza piena in entrambi i casi: la conversione è esatta.
async function insertValues(db: SqlDatabase, foodId: string, input: PersonalFoodInput) {
  const derived = input.derived ?? [];
  const rows = Object.entries(input.values).map(([code, amount]) => [
    code,
    amount,
    derived.includes(code) ? 'estimated' : 'manual',
  ]);
  await db.runAsync(
    `INSERT INTO nutrient_value (food_id, nutrient_code, amount_per_100, provenance, confidence)
     SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), 1
     FROM json_each(?)`,
    foodId,
    JSON.stringify(rows),
  );
}

export async function createFood(
  db: SqlDatabase,
  userId: string,
  input: PersonalFoodInput,
  now: Date,
): Promise<string> {
  const id = newId(now.getTime());
  const at = now.toISOString();
  // Alimento e valori insieme: un valore rifiutato non lascia un alimento senza valori.
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO food (id, user_id, name, state, base_unit, search_text, source, brand,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)`,
      id,
      userId,
      input.name.trim(),
      input.state,
      input.baseUnit,
      searchText(input),
      brandOf(input),
      at,
      at,
    );
    await insertValues(db, id, input);
  });
  return id;
}

/** Sostituisce nome, marca, stato, unità e valori; false se l'alimento non è dell'utente. */
export async function updateFood(
  db: SqlDatabase,
  userId: string,
  id: string,
  input: PersonalFoodInput,
  now: Date,
): Promise<boolean> {
  let changed = false;
  await db.withTransactionAsync(async () => {
    const { changes } = await db.runAsync(
      `UPDATE food SET name = ?, state = ?, base_unit = ?, search_text = ?, brand = ?,
         updated_at = ?
       WHERE id = ? AND user_id = ? AND source IS NOT 'recipe' AND deleted_at IS NULL`,
      input.name.trim(),
      input.state,
      input.baseUnit,
      searchText(input),
      brandOf(input),
      now.toISOString(),
      id,
      userId,
    );
    if (changes === 0) return;
    await db.runAsync('DELETE FROM nutrient_value WHERE food_id = ?', id);
    await insertValues(db, id, input);
    // Il preferito è un rimando, non storia: segue il nome nuovo (il diario no, principio 7).
    await db.runAsync(
      `UPDATE favorite_food SET food_name = ?, food_state = ?, updated_at = ?
       WHERE user_id = ? AND food_id = ? AND deleted_at IS NULL`,
      input.name.trim(),
      input.state,
      now.toISOString(),
      userId,
      id,
    );
    // Le ricette che lo usano si ricalcolano (RF-22); il diario no.
    await refreshRecipesUsing(db, [id]);
    changed = true;
  });
  return changed;
}

/** Cancellazione logica, preferito compreso: il diario resta com'era, con i suoi valori. */
export async function deleteFood(
  db: SqlDatabase,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  const at = now.toISOString();
  await db.withTransactionAsync(async () => {
    const { changes } = await db.runAsync(
      `UPDATE food SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND source IS NOT 'recipe' AND deleted_at IS NULL`,
      at,
      at,
      id,
      userId,
    );
    if (changes === 0) return;
    await db.runAsync(
      `UPDATE favorite_food SET deleted_at = ?, updated_at = ?
       WHERE user_id = ? AND food_id = ? AND deleted_at IS NULL`,
      at,
      at,
      userId,
      id,
    );
  });
}

/** Il catalogo personale per la Dispensa, in ordine alfabetico; le ricette hanno il loro elenco. */
export async function personalFoods(db: SqlDatabase, userId: string): Promise<PersonalFood[]> {
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    brand: string | null;
    state: FoodState;
    base_unit: BaseUnit;
    kcal: number | null;
  }>(
    `SELECT f.id, f.name, f.brand, f.state, f.base_unit,
            (SELECT amount_per_100 FROM nutrient_value
             WHERE food_id = f.id AND nutrient_code = 'energy_kcal') AS kcal
     FROM food AS f
     WHERE f.user_id = ? AND f.deleted_at IS NULL AND f.source IS NOT 'recipe'
     ORDER BY f.name COLLATE NOCASE, f.brand COLLATE NOCASE`,
    userId,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    brand: row.brand,
    state: row.state,
    baseUnit: row.base_unit,
    kcal: row.kcal,
  }));
}
