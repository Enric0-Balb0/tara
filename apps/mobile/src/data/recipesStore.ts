/**
 * Ricette (RF-20, RF-21, RF-22): una ricetta è un alimento personale (`source = 'recipe'`),
 * così ricerca, scheda, diario, piano e preferiti la trattano come gli altri. I suoi valori
 * per 100 g sono materializzati in `nutrient_value` e ricalcolati quando cambia la ricetta o
 * un ingrediente; il diario ha la copia dei valori del momento e non si riscrive (principio 7).
 */

import type { FoodState } from '@/domain/food';
import { newId } from '@/domain/ids';
import { recipeValues, type RecipeYield } from '@/domain/recipe';
import { searchKey } from '@/domain/search';

import type { SqlDatabase } from './sql';

export interface RecipeInput {
  name: string;
  yield: RecipeYield;
  /** Ingredienti in ordine, a crudo. */
  items: { foodId: string; gramsRaw: number }[];
}

export interface RecipeDetail {
  id: string;
  name: string;
  yield: RecipeYield;
  items: {
    id: string;
    foodId: string;
    foodName: string;
    foodState: FoodState;
    gramsRaw: number;
  }[];
  totalWeightG: number;
  servingG: number | null;
}

export interface RecipeListItem {
  id: string;
  name: string;
  kcalPer100: number | null;
  servingG: number | null;
}

interface RecipeRow {
  yield_mode: 'portions' | 'weight';
  portions: number | null;
  cooked_weight_g: number | null;
}

function yieldOf(row: RecipeRow): RecipeYield {
  return row.yield_mode === 'portions'
    ? { mode: 'portions', portions: row.portions ?? 0 }
    : { mode: 'weight', cookedWeightG: row.cooked_weight_g ?? 0 };
}

async function insertRecipeRows(
  db: SqlDatabase,
  userId: string,
  id: string,
  input: RecipeInput,
  now: Date,
  insertRecipe: boolean,
) {
  const at = now.toISOString();
  const { yield: recipeYield } = input;
  if (insertRecipe) {
    await db.runAsync(
      `INSERT INTO recipe (food_id, user_id, yield_mode, portions, cooked_weight_g, created_at,
         updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      userId,
      recipeYield.mode,
      recipeYield.mode === 'portions' ? recipeYield.portions : null,
      recipeYield.mode === 'weight' ? recipeYield.cookedWeightG : null,
      at,
      at,
    );
  } else {
    await db.runAsync(
      `UPDATE recipe SET yield_mode = ?, portions = ?, cooked_weight_g = ?, updated_at = ?
       WHERE food_id = ?`,
      recipeYield.mode,
      recipeYield.mode === 'portions' ? recipeYield.portions : null,
      recipeYield.mode === 'weight' ? recipeYield.cookedWeightG : null,
      at,
      id,
    );
  }
  for (const [position, item] of input.items.entries()) {
    await db.runAsync(
      `INSERT INTO recipe_item (id, user_id, recipe_id, ingredient_food_id, grams_raw, position,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(now.getTime()),
      userId,
      id,
      item.foodId,
      item.gramsRaw,
      position,
      at,
      at,
    );
  }
}

/** Ricalcola e riscrive i valori di una ricetta; la transazione è di chi chiama. */
async function writeValues(db: SqlDatabase, recipeId: string): Promise<void> {
  const recipe = await db.getFirstAsync<RecipeRow>(
    `SELECT r.yield_mode, r.portions, r.cooked_weight_g
     FROM recipe AS r JOIN food AS f ON f.id = r.food_id
     WHERE r.food_id = ? AND f.deleted_at IS NULL`,
    recipeId,
  );
  if (recipe === null) return;
  // Un ingrediente sparito dal catalogo: i valori di prima restano, non si azzerano.
  const missing = await db.getFirstAsync(
    `SELECT 1 FROM recipe_item AS i
     WHERE i.recipe_id = ? AND i.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM food WHERE id = i.ingredient_food_id)`,
    recipeId,
  );
  if (missing !== null) return;
  // Gli ingredienti si leggono anche se eliminati: la ricetta non perde i valori.
  const rows = await db.getAllAsync<{
    item_id: string;
    grams_raw: number;
    code: string | null;
    amount: number | null;
    confidence: number | null;
  }>(
    `SELECT i.id AS item_id, i.grams_raw, v.nutrient_code AS code, v.amount_per_100 AS amount,
            v.confidence
     FROM recipe_item AS i
     LEFT JOIN nutrient_value AS v ON v.food_id = i.ingredient_food_id
     WHERE i.recipe_id = ? AND i.deleted_at IS NULL
     ORDER BY i.position`,
    recipeId,
  );
  const items = new Map<string, { grams: number; per100: Record<string, number> }>();
  const confidence = new Map<string, number>();
  for (const row of rows) {
    const item = items.get(row.item_id) ?? { grams: row.grams_raw, per100: {} };
    items.set(row.item_id, item);
    if (row.code === null || row.amount === null) continue;
    item.per100[row.code] = row.amount;
    confidence.set(row.code, Math.min(confidence.get(row.code) ?? 1, row.confidence ?? 1));
  }
  const { per100 } = recipeValues([...items.values()], yieldOf(recipe));
  const values = Object.entries(per100).map(([code, amount]) => [
    code,
    amount,
    confidence.get(code) ?? 1,
  ]);
  await db.runAsync('DELETE FROM nutrient_value WHERE food_id = ?', recipeId);
  await db.runAsync(
    `INSERT INTO nutrient_value (food_id, nutrient_code, amount_per_100, provenance, confidence)
     SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), 'estimated',
            json_extract(value, '$[2]')
     FROM json_each(?)`,
    recipeId,
    JSON.stringify(values),
  );
}

async function recipesUsing(db: SqlDatabase, foodIds: readonly string[]): Promise<string[]> {
  const rows = await db.getAllAsync<{ recipe_id: string }>(
    `SELECT DISTINCT recipe_id FROM recipe_item
     WHERE deleted_at IS NULL AND ingredient_food_id IN (SELECT value FROM json_each(?))`,
    JSON.stringify(foodIds),
  );
  return rows.map((row) => row.recipe_id);
}

// Una ricetta dentro un'altra: il ricalcolo risale di livello in livello. Il limite ferma
// anche un eventuale giro (A in B e B in A), che il database non vieta.
const MAX_NESTING = 5;

async function refreshAll(db: SqlDatabase, recipeIds: readonly string[]): Promise<void> {
  let frontier = [...recipeIds];
  for (let depth = 0; depth < MAX_NESTING && frontier.length > 0; depth++) {
    for (const id of frontier) await writeValues(db, id);
    frontier = await recipesUsing(db, frontier);
  }
}

/**
 * Ricalcola le ricette che usano uno di questi alimenti (RF-22), a catena. Dentro la
 * transazione di chi chiama: la usa `updateFood`.
 */
export async function refreshRecipesUsing(
  db: SqlDatabase,
  foodIds: readonly string[],
): Promise<void> {
  await refreshAll(db, await recipesUsing(db, foodIds));
}

/**
 * Ricalcola e riscrive i valori delle ricette indicate, o di tutte quelle non eliminate:
 * provenienza `estimated`, confidenza la minima tra gli ingredienti per quel nutriente.
 */
export async function refreshRecipeValues(
  db: SqlDatabase,
  recipeIds?: readonly string[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const ids =
      recipeIds ??
      (
        await db.getAllAsync<{ food_id: string }>(
          `SELECT r.food_id FROM recipe AS r JOIN food AS f ON f.id = r.food_id
           WHERE f.deleted_at IS NULL`,
        )
      ).map((row) => row.food_id);
    await refreshAll(db, ids);
  });
}

/**
 * Le ricette che contengono questa, direttamente o dentro altre ricette: non si possono
 * offrire come suoi ingredienti, o si chiuderebbe un giro. UNION ferma anche un giro già
 * presente nei dati.
 */
export async function recipesContaining(db: SqlDatabase, recipeId: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(
    `WITH RECURSIVE parents(id) AS (
       SELECT recipe_id FROM recipe_item WHERE ingredient_food_id = ? AND deleted_at IS NULL
       UNION
       SELECT i.recipe_id FROM recipe_item AS i JOIN parents AS p ON i.ingredient_food_id = p.id
       WHERE i.deleted_at IS NULL
     )
     SELECT id FROM parents`,
    recipeId,
  );
  return rows.map((row) => row.id);
}

export async function createRecipe(
  db: SqlDatabase,
  userId: string,
  input: RecipeInput,
  now: Date,
): Promise<string> {
  const id = newId(now.getTime());
  const at = now.toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO food (id, user_id, name, state, base_unit, search_text, source, created_at,
         updated_at)
       VALUES (?, ?, ?, 'not_applicable', 'g', ?, 'recipe', ?, ?)`,
      id,
      userId,
      input.name.trim(),
      searchKey(input.name.trim()),
      at,
      at,
    );
    await insertRecipeRows(db, userId, id, input, now, true);
    await refreshAll(db, [id]);
  });
  return id;
}

/** Sostituisce nome, resa e ingredienti; false se la ricetta non è dell'utente o è eliminata. */
export async function updateRecipe(
  db: SqlDatabase,
  userId: string,
  id: string,
  input: RecipeInput,
  now: Date,
): Promise<boolean> {
  let changed = false;
  const at = now.toISOString();
  await db.withTransactionAsync(async () => {
    const name = input.name.trim();
    const { changes } = await db.runAsync(
      `UPDATE food SET name = ?, search_text = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND source = 'recipe' AND deleted_at IS NULL`,
      name,
      searchKey(name),
      at,
      id,
      userId,
    );
    if (changes === 0) return;
    await db.runAsync(
      `UPDATE recipe_item SET deleted_at = ?, updated_at = ?
       WHERE recipe_id = ? AND user_id = ? AND deleted_at IS NULL`,
      at,
      at,
      id,
      userId,
    );
    await insertRecipeRows(db, userId, id, input, now, false);
    // Il preferito è un rimando, non storia: segue il nome nuovo (il diario no, principio 7).
    await db.runAsync(
      `UPDATE favorite_food SET food_name = ?, updated_at = ?
       WHERE user_id = ? AND food_id = ? AND deleted_at IS NULL`,
      name,
      at,
      userId,
      id,
    );
    await refreshAll(db, [id]);
    changed = true;
  });
  return changed;
}

export async function duplicateRecipe(
  db: SqlDatabase,
  userId: string,
  id: string,
  now: Date,
): Promise<string | null> {
  const detail = await recipeDetail(db, userId, id);
  if (detail === null) return null;
  return createRecipe(
    db,
    userId,
    {
      name: `${detail.name} (copia)`,
      yield: detail.yield,
      items: detail.items.map((item) => ({ foodId: item.foodId, gramsRaw: item.gramsRaw })),
    },
    now,
  );
}

/** Cancellazione logica, preferito compreso: il diario resta com'era, con i suoi valori. */
export async function deleteRecipe(
  db: SqlDatabase,
  userId: string,
  id: string,
  now: Date,
): Promise<void> {
  const at = now.toISOString();
  await db.withTransactionAsync(async () => {
    const { changes } = await db.runAsync(
      `UPDATE food SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND source = 'recipe' AND deleted_at IS NULL`,
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

export async function recipeDetail(
  db: SqlDatabase,
  userId: string,
  id: string,
): Promise<RecipeDetail | null> {
  const recipe = await db.getFirstAsync<RecipeRow & { name: string }>(
    `SELECT f.name, r.yield_mode, r.portions, r.cooked_weight_g
     FROM recipe AS r JOIN food AS f ON f.id = r.food_id
     WHERE r.food_id = ? AND r.user_id = ? AND f.deleted_at IS NULL`,
    id,
    userId,
  );
  if (recipe === null) return null;
  // Gli ingredienti eliminati restano nella scheda, con il loro nome.
  const rows = await db.getAllAsync<{
    id: string;
    food_id: string;
    food_name: string;
    food_state: FoodState;
    grams_raw: number;
  }>(
    `SELECT i.id, i.ingredient_food_id AS food_id,
            coalesce(f.name, 'Alimento non più nel catalogo') AS food_name,
            coalesce(f.state, 'not_applicable') AS food_state, i.grams_raw
     FROM recipe_item AS i LEFT JOIN food AS f ON f.id = i.ingredient_food_id
     WHERE i.recipe_id = ? AND i.user_id = ? AND i.deleted_at IS NULL
     ORDER BY i.position`,
    id,
    userId,
  );
  const recipeYield = yieldOf(recipe);
  const { totalWeightG, servingG } = recipeValues(
    rows.map((row) => ({ grams: row.grams_raw, per100: {} })),
    recipeYield,
  );
  return {
    id,
    name: recipe.name,
    yield: recipeYield,
    items: rows.map((row) => ({
      id: row.id,
      foodId: row.food_id,
      foodName: row.food_name,
      foodState: row.food_state,
      gramsRaw: row.grams_raw,
    })),
    totalWeightG,
    servingG,
  };
}

/** Le ricette dell'utente per la Dispensa, in ordine alfabetico. */
export async function recipes(db: SqlDatabase, userId: string): Promise<RecipeListItem[]> {
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    kcal: number | null;
    yield_mode: 'portions' | 'weight';
    portions: number | null;
    cooked_weight_g: number | null;
    total_raw: number | null;
  }>(
    `SELECT f.id, f.name, r.yield_mode, r.portions, r.cooked_weight_g,
            (SELECT amount_per_100 FROM nutrient_value
             WHERE food_id = f.id AND nutrient_code = 'energy_kcal') AS kcal,
            (SELECT sum(grams_raw) FROM recipe_item
             WHERE recipe_id = f.id AND deleted_at IS NULL) AS total_raw
     FROM food AS f JOIN recipe AS r ON r.food_id = f.id
     WHERE f.user_id = ? AND f.deleted_at IS NULL
     ORDER BY f.name COLLATE NOCASE`,
    userId,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kcalPer100: row.kcal,
    servingG:
      row.yield_mode === 'portions' && row.portions !== null
        ? (row.total_raw ?? 0) / row.portions
        : null,
  }));
}
