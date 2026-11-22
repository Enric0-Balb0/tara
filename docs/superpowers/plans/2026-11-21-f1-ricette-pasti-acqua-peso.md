# F1, passi 7 e 8: ricette, pasti salvati, acqua e peso

**Spec:** `docs/requisiti.md` (RF-20…26, RF-30…32, RF-60, RF-61, RF-70, RF-57), principi in `CLAUDE.md`, stile in `docs/design.md`. Stato del lavoro in `docs/handoff.md`, "Riprendere il lavoro".

**Obiettivo:** completare l'MVP lato interfaccia (F1) con ricette, pasti salvati, contatore dell'acqua e peso con media mobile, tutto sul telefono (SQLite) e pronto per la sincronizzazione.

## Global Constraints

Valgono per ogni task. Il pacchetto è `apps/mobile` (Expo SDK 58, expo-router in `src/app`, expo-sqlite).

- **Principi:** i valori nutrizionali vengono solo da fonti tabellari o da calcoli deterministici su di esse; un dato mancante non vale zero (manca, non si somma come 0); nessuna scrittura nel diario senza un gesto di conferma dell'utente; le voci di diario hanno lo snapshot dei valori (modificare un alimento o una ricetta non riscrive il passato); `user_id` su ogni entità personale.
- **Dati sincronizzabili:** ogni tabella nuova personale ha `id TEXT PRIMARY KEY` (UUIDv7 da `newId(now.getTime())` di `src/domain/ids.ts`), `user_id TEXT NOT NULL`, `created_at`/`updated_at TEXT NOT NULL` (ISO 8601), `deleted_at TEXT` (cancellazione logica), tabelle `STRICT`. Ogni lettura filtra `deleted_at IS NULL` e l'utente. Ogni scrittura su una riga esistente verifica che sia dell'utente.
- **Migrazioni:** si aggiunge una stringa in fondo a `MIGRATIONS` di `src/data/schema.ts` (mai modificare le precedenti); `schema.test.ts` aggiorna `SCHEMA_VERSION` atteso e l'elenco delle tabelle. Ogni regola di dominio importante è un vincolo con nome (`CONSTRAINT nome CHECK (...)` o indice unico parziale) e ha un test che si aspetta quel nome nell'errore.
- **Scritture di più istruzioni:** `db.withTransactionAsync(async () => …)` (connessione principale, con foreign_keys e busy_timeout). Non usare `withExclusiveTransactionAsync` fuori dal catalogo.
- **Test:** TDD con vitest e `openTestDatabase()` di `src/data/testing/nodeDatabase.ts` (`node:sqlite` in memoria) per gli store; funzioni pure in `src/domain` con i loro test. Ogni test ha un nome italiano che descrive il comportamento. Coverage ≥ 80% (oggi ~99%: non deve scendere sensibilmente).
- **Comandi prima di dichiarare finito**, da `apps/mobile`: `npm run typecheck`, `npm run lint`, `npm run test:coverage`. Formattazione: `npx prettier --single-quote --print-width 100 --write <file>` sui file toccati (il repository non ha una configurazione prettier: senza quei flag escono le virgolette doppie).
- **Lingua:** codice, identificatori e commenti tecnici in inglese **o** italiano come nel file che tocchi (i file esistenti hanno commenti in italiano: seguili); testi dell'interfaccia sempre in italiano, numeri all'italiana con `formatNumber`/`formatAmount` di `src/domain/format.ts` (niente `Intl`, niente `toLocale*`: Hermes non ha i dati italiani).
- **Interfaccia:** solo i componenti e i token esistenti (`src/components`, `src/theme`: `TaraText`, `Button`, `PressableScale`, `TextField`, `Segmented`, `Icon`, `GramSheet`, `NutritionLabel`, `MealSection`, `QuickRow`, colori da `useTheme()`, spazi da `space`, `touch`, `radius`). Nessun colore scritto a mano. Tocchi ≥ 44×44. Ogni controllo ha un `accessibilityLabel` italiano. Nessuna dipendenza nuova (react-native-svg 15 c'è già).
- **Tastiera su Android:** una schermata con campi in basso usa `KeyboardAvoidingView behavior="padding"`, intestazione propria (`headerShown: false` nello Stack di `src/app/_layout.tsx`, barra con `Icon chevronLeft` "Indietro" e titolo `TaraText variant="section"`, `paddingTop: insets.top`), come `src/app/nuovo-alimento.tsx`.
- **Flussi Maestro:** ogni task con interfaccia aggiunge un flusso in `apps/mobile/.maestro/<nome>.yaml` sul modello di `.maestro/alimenti-personali.yaml` (tag `api`, `subflows/avvio.yaml`, `subflows/accedi.yaml`, scrittura con `subflows/scrivi.yaml`/`subflows/etichetta.yaml`, `testID` sui campi). **Non eseguire Maestro né l'emulatore**: li esegue il controller.
- **Git:** commit piccoli in Conventional Commits, messaggio in inglese all'imperativo, scope `mobile` (o `docs`). Nessun trailer `Co-Authored-By`, nessun riferimento a Claude/AI (un hook li rifiuta). Non fare push, non aprire PR, non cambiare branch.
- **Documenti:** se una scelta restringe o cambia un requisito, aggiorna `docs/requisiti.md` nello stesso commit; le scelte visive in `docs/design.md`.

---

## Task 1: Ricette, modello dati e calcolo dei valori

**Requisiti:** RF-20, RF-21, RF-22, RF-24 (dati), RF-26 (dati).

Una ricetta è un alimento personale (`food` con `user_id`, `source = 'recipe'`, `state = 'not_applicable'`, `base_unit = 'g'`), così ricerca, scheda, diario, piano e preferiti la trattano come gli altri alimenti. I suoi valori per 100 g sono **materializzati** in `nutrient_value` e ricalcolati quando cambia la ricetta o un suo ingrediente.

**Migrazione (nuova versione):**

```sql
CREATE TABLE recipe (
  food_id TEXT PRIMARY KEY NOT NULL REFERENCES food (id),
  user_id TEXT NOT NULL,
  yield_mode TEXT NOT NULL CONSTRAINT recipe_yield_mode_valid CHECK (yield_mode IN ('portions', 'weight')),
  portions REAL,
  cooked_weight_g REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT recipe_yield_complete CHECK (
    (yield_mode = 'portions' AND portions > 0 AND cooked_weight_g IS NULL) OR
    (yield_mode = 'weight' AND cooked_weight_g > 0 AND portions IS NULL))
) STRICT;

CREATE TABLE recipe_item (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL REFERENCES recipe (food_id),
  ingredient_food_id TEXT NOT NULL REFERENCES food (id),
  grams_raw REAL NOT NULL CONSTRAINT recipe_item_grams_positive CHECK (grams_raw > 0),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CONSTRAINT recipe_item_not_itself CHECK (ingredient_food_id <> recipe_id)
) STRICT;
```

(La ricetta eliminata usa `food.deleted_at`; `recipe` non ha un suo `deleted_at`.)

**Calcolo (`src/domain/recipe.ts`, puro):** `recipeValues(items, yield)` dove `items: { grams: number; per100: Record<string, number | undefined> }[]`, `yield: { mode: 'portions'; portions: number } | { mode: 'weight'; cookedWeightG: number }`. Restituisce `{ totalWeightG, servingG, per100: Record<string, number>, perServing: Record<string, number> | null }`:
- totale di un nutriente = Σ per100 × grams / 100; un nutriente entra **solo se tutti gli ingredienti lo hanno** (altrimenti manca: principio 2);
- peso finale = `cookedWeightG` in modalità peso, somma dei grammi a crudo in modalità porzioni;
- per100 = totale × 100 / peso finale; servingG = peso finale / porzioni (porzioni) o null (peso), perServing di conseguenza (null in modalità peso);
- ricetta senza ingredienti: per100 vuoto, totalWeightG 0.
Test: pancake con albume 200 g (per100 protein 10,9…), avena 50 g, una banana senza `fiber_g` → la fibra manca; modalità peso con 1000 g crudi e 800 g cotti alza i valori per 100 del 25%; 4 porzioni → servingG = totale/4.

**Store (`src/data/recipesStore.ts`):**
- `RecipeInput = { name: string; yield: … ; items: { foodId: string; gramsRaw: number }[] }`.
- `createRecipe(db, userId, input, now): Promise<string>` → crea `food` (source `recipe`, `search_text` = `searchKey(name)`, date), `recipe`, `recipe_item` (position = indice), poi i valori. Tutto in una transazione.
- `updateRecipe(db, userId, id, input, now): Promise<boolean>` → sostituisce nome, resa e ingredienti (i vecchi `recipe_item` in cancellazione logica), ricalcola; false se la ricetta non è dell'utente o è eliminata. Aggiorna anche nome e stato del preferito come fa `updateFood` in `src/data/foodsStore.ts`.
- `duplicateRecipe(db, userId, id, now): Promise<string | null>` → copia con nome `"<nome> (copia)"`.
- `deleteRecipe(db, userId, id, now)` → `food.deleted_at` e preferito come `deleteFood`.
- `recipeDetail(db, userId, id): Promise<RecipeDetail | null>` con `name`, `yield`, `items` (`{ id, foodId, foodName, foodState, gramsRaw }` in ordine di posizione, anche se l'ingrediente è stato eliminato), `totalWeightG`, `servingG`.
- `recipes(db, userId)` → elenco per la Dispensa: `{ id, name, kcalPer100, servingG }` in ordine alfabetico (`COLLATE NOCASE`).
- `refreshRecipeValues(db, recipeIds?: string[])` → ricalcola e riscrive `nutrient_value` delle ricette indicate (tutte le ricette non eliminate se assente): provenienza `'estimated'`, confidenza = la minima tra i valori degli ingredienti per quel nutriente. Gli ingredienti si leggono anche se eliminati (la ricetta non perde i valori).
- Integrazioni: `updateFood` di `foodsStore.ts` ricalcola le ricette che usano quell'alimento (RF-22); `replaceCatalog` di `src/data/catalogStore.ts` ricalcola tutte le ricette **dopo** la transazione del catalogo (con `refreshRecipeValues(db)` sulla connessione principale).
- Una ricetta non può essere ingrediente di sé stessa (vincolo); una ricetta come ingrediente di un'altra è ammessa (il calcolo legge i suoi valori materializzati).

**Test richiesti (store):** creazione e lettura; valori materializzati per 100 g e provenienza `estimated`; modifica di un ingrediente personale con `updateFood` → valori della ricetta aggiornati; voce di diario registrata prima resta uguale (snapshot); isolamento tra utenti (update/delete di un altro utente → false/nessun effetto); duplicazione; eliminazione; vincoli `recipe_yield_complete`, `recipe_item_grams_positive`, `recipe_item_not_itself`; `replaceCatalog` seguito dal ricalcolo; `searchFoods(db, 'pancake', userId)` trova la ricetta.

---

## Task 2: Ricette, editor e scelta degli ingredienti

**Requisiti:** RF-20, RF-21, RF-24 (interfaccia).

**Bozza in memoria (`src/data/recipeDraft.ts`):** un piccolo store a modulo con `subscribe`, letto con `useSyncExternalStore` (hook `useRecipeDraft()`): `{ recipeId: string | null; name: string; yield: …; items: { key: string; foodId: string; foodName: string; foodState: FoodState; gramsRaw: number }[] }`, con `startDraft(initial)`, `setName`, `setYield`, `addItem(food, grams)`, `setItemGrams(key, grams)`, `removeItem(key)`, `clearDraft()`. Test unitari della bozza.

**Schermata `src/app/ricetta.tsx`** (intestazione propria; titolo "Nuova ricetta" o "Modifica ricetta" con parametro `id`; con `id` la bozza si carica da `recipeDetail`):
- `TextField` "Nome" (`testID="campo-nome-ricetta"`).
- `Segmented` "Resa": "Porzioni" / "Peso da cotto"; sotto un `TextField` numerico "Porzioni" (`testID="campo-porzioni"`) o "Peso da cotto (g)" (`testID="campo-peso-cotto"`).
- Elenco ingredienti: nome, stato (`StateTag`), grammi a crudo; tocco → `GramSheet` con `startGrams`, `confirmVerb="Salva"` e `onDelete` per togliere l'ingrediente.
- "Aggiungi ingrediente" → `router.push({ pathname: '/cerca', params: { ricetta: '1' } })`.
- Anteprima: `NutritionLabel` per 100 g calcolata con `recipeValues` dai valori degli ingredienti (letti con `getFood`), e se in porzioni "1 porzione = N g".
- "Salva la ricetta" (`testID="salva-ricetta"`), abilitato con nome, almeno un ingrediente e resa valida → `createRecipe`/`updateRecipe`, `clearDraft()`, `router.back()`. Errori di validazione come in `nuovo-alimento.tsx` (dopo il primo tentativo).

**Scelta degli ingredienti:** `src/app/cerca.tsx` e `src/app/alimento/[id].tsx` accettano il parametro `ricetta=1` e lo inoltrano come fanno con `plan`. Nella scheda, con `ricetta=1`, niente selettore del pasto: il pulsante principale diventa "Aggiungi alla ricetta", il `GramSheet` (verbo "Aggiungi", niente "Aggiungi e continua") chiama `addItem` della bozza e poi `router.dismissTo('/ricetta')`. Nella ricerca con `ricetta=1` la riga "Crea «…»" resta (inoltrando `ricetta`) e le ricette stesse sono ammesse come ingredienti tranne quella in modifica.

**Rotte:** `ricetta` nello Stack con `headerShown: false`.

**Test:** bozza (unitari). Il flusso Maestro arriva con il Task 3.

---

## Task 3: Ricette, scheda, Dispensa e porzioni nel foglio dei grammi

**Requisiti:** RF-24 (duplica), RF-26, RF-23, RF-21 (registrare a porzioni), chiude il limite noto dei grammi per le voci in ml.

- **Dispensa** (`src/app/(tabs)/dispensa.tsx`): sotto i pulsanti, due pulsanti "Nuovo alimento" e "Nuova ricetta" affiancati (il secondo apre `/ricetta` dopo `startDraft` vuoto); sezioni "Ricette" (da `recipes`) e "I tuoi alimenti" (`personalFoods` deve escludere `source = 'recipe'`: aggiungi il filtro e il test). Riga ricetta: nome, kcal/100 g, "porzione N g" se ha porzioni.
- **Scheda** (`src/app/alimento/[id].tsx`) per una ricetta (`food.source === 'recipe'`): sotto il titolo gli ingredienti (nome e grammi a crudo); due etichette `NutritionLabel`: "per porzione" (se porzioni, con `grams = servingG`) e per 100 g; azioni "Modifica" (apre `/ricetta?id=…` dopo aver caricato la bozza) e "Duplica" (`duplicateRecipe`, poi apre `/ricetta?id=<nuovo>`); in modalità peso un campo "Peso da cotto di oggi (g)" (RF-23) che aggiorna `cooked_weight_g` con `updateRecipe` e ricalcola (le voci già registrate non cambiano).
- **Foglio dei grammi** (`src/components/GramSheet.tsx`): nuova prop `shortcuts?: { label: string; grams: number }[]` mostrata come scorciatoie accanto a "Ultima volta" (es. "1 porzione · 85 g", "2 porzioni · 170 g"); la scheda della ricetta passa 1 e 2 porzioni. Nuova prop `unit?: 'g' | 'ml'` (predefinita `'g'`): con `'ml'` lettura, etichette e testo accessibile dicono "ml"/"millilitri"; la scheda la passa da `food.baseUnit` e Oggi da `entry.unit` (chiude il limite annotato in `docs/handoff.md`; togli la nota).
- **Flusso Maestro `ricette.yaml`:** Dispensa → Nuova ricetta "Pancake" → aggiungi due ingredienti dalla ricerca (es. "albume" 200 g e "avena" 50 g, attendendo il catalogo come in `velocita.yaml`) → 4 porzioni → Salva → la ricetta compare in Dispensa → scheda con "per porzione" → registra "1 porzione" a Pranzo dal foglio → in Oggi c'è la voce "Pancake". Poi Duplica e verifica "Pancake (copia)".
- Aggiorna `docs/handoff.md` (passo 7, ricette) e `docs/design.md` se introduci scelte visive.

---

## Task 4: Pasti salvati, modello dati

**Requisiti:** RF-30, RF-31, RF-32 (dati).

**Migrazione:**

```sql
CREATE TABLE saved_meal (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CONSTRAINT saved_meal_name_not_blank CHECK (trim(name) <> ''),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;

CREATE TABLE saved_meal_item (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  saved_meal_id TEXT NOT NULL REFERENCES saved_meal (id),
  food_id TEXT NOT NULL,
  food_name TEXT NOT NULL,
  food_state TEXT NOT NULL CONSTRAINT saved_meal_item_state_valid
    CHECK (food_state IN ('raw', 'cooked', 'not_applicable')),
  quantity REAL NOT NULL CONSTRAINT saved_meal_item_quantity_positive CHECK (quantity > 0),
  unit TEXT NOT NULL CONSTRAINT saved_meal_item_unit_valid CHECK (unit IN ('g', 'ml')),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;
```

**Store (`src/data/savedMealsStore.ts`):**
- `saveMealFromDiary(db, { userId, name, date, mealSlotId, now }): Promise<string | null>` → dalle voci non eliminate di quel giorno e pasto (ordine del diario), null se non ce ne sono (RF-32).
- `createSavedMeal(db, userId, name, items: { foodId; foodName; foodState; quantity; unit }[], now)`.
- `savedMeals(db, userId)` → `{ id, name, itemCount }[]` alfabetico.
- `savedMealItems(db, userId, id)` → voci in ordine.
- `renameSavedMeal`, `deleteSavedMeal` (logica), `updateSavedMealItem(quantity)`, `removeSavedMealItem` (logica), tutti con verifica dell'utente.
- `logSavedMeal(db, { userId, savedMealId, date, mealSlotId, quantities: Record<itemId, number>, now }): Promise<number>` → per ogni voce legge l'alimento attuale con `getFood` e chiama la logica di `addEntry` di `src/data/diaryStore.ts` (snapshot dei valori di adesso), con la quantità sovrascritta se data; salta (e conta a parte) le voci il cui alimento non c'è più; tutto in una transazione; restituisce quante voci ha registrato. Ordine delle voci nel diario uguale a quello del pasto salvato (un millisecondo in più per voce, come `copyEntries` in `src/data/quickStore.ts`).

**Test:** salvataggio da diario, elenco, isolamento tra utenti, rinomina, eliminazione, registrazione con quantità cambiate (snapshot dei valori attuali; modificare poi l'alimento non cambia la voce), alimento eliminato saltato, vincoli con nome.

---

## Task 5: Pasti salvati, interfaccia

**Requisiti:** RF-30, RF-31, RF-32.

- **Oggi** (`src/app/(tabs)/index.tsx` e `src/components/MealSection.tsx`): su un pasto con voci un'azione "Salva come pasto" (`accessibilityLabel` "Salva come pasto: Pranzo") che chiede il nome con un `Modal` (campo `testID="campo-nome-pasto"`, proposto "Pranzo del 21 novembre" con `dayLabel` senza il giorno della settimana) e chiama `saveMealFromDiary`.
- **Registrazione con un tocco (RF-31):** nella ricerca a campo vuoto (`src/app/cerca.tsx`), sopra "Preferiti", la sezione "Pasti salvati" (solo se ce ne sono e se la ricerca arriva da un pasto di Oggi, cioè con `slot`; non con `plan` né `ricetta`). Tocco → foglio (`Modal`) "Registra «nome»" con l'elenco delle voci e i grammi modificabili (tocco su una voce → `GramSheet` con `startGrams`), pulsante "Registra a <pasto>" → `logSavedMeal` → `router.dismissTo('/')`.
- **Dispensa:** sezione "Pasti salvati" con righe (nome, "N alimenti"); tocco → schermata `src/app/pasto/[id].tsx` con nome modificabile, voci con grammi modificabili e rimovibili, "Elimina pasto salvato" (con conferma `Alert`).
- **Flusso Maestro `pasti-salvati.yaml`:** registra albume 200 g a Pranzo → "Salva come pasto" con nome "Pranzo leggero" → torna a ieri (o domani) → "Aggiungi a Pranzo" → nella ricerca vuota "Pasti salvati" → "Pranzo leggero" → cambia i grammi a 150 → "Registra a Pranzo" → in quel giorno c'è "Albume d'uovo, 150 grammi…". Poi Dispensa → il pasto salvato c'è.
- Aggiorna `docs/handoff.md` (passo 7 completo).

---

## Task 6: Acqua

**Requisiti:** RF-60, RF-61.

**Migrazione:**

```sql
CREATE TABLE water_entry (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL CONSTRAINT water_entry_date_valid
    CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  ml REAL NOT NULL CONSTRAINT water_entry_ml_positive CHECK (ml > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;

CREATE TABLE day_type_water (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  day_type_id TEXT NOT NULL REFERENCES day_type (id),
  ml REAL NOT NULL CONSTRAINT day_type_water_ml_positive CHECK (ml > 0),
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;
CREATE UNIQUE INDEX day_type_water_once ON day_type_water (day_type_id) WHERE deleted_at IS NULL;

CREATE TABLE user_setting (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
) STRICT;
```

**Store (`src/data/waterStore.ts`):** `addWater(db, userId, date, ml, now)`, `undoLastWater(db, userId, date, now)` (cancella logicamente l'ultima del giorno), `waterOn(db, userId, date)` → ml totali, `setWaterTarget(db, userId, dayTypeId, ml | null, now)` (null cancella), `waterTarget(db, userId, dayTypeId)`, `waterIncrements(db, userId)` → `number[]` (predefiniti `[250, 500]`, da `user_setting` chiave `water_increments`, JSON), `setWaterIncrements(db, userId, increments, now)` (1–3 valori tra 50 e 2000 ml, altrimenti errore). Test con verifica dell'utente e dei vincoli.

**Interfaccia:**
- **Oggi:** sotto gli obiettivi una riga "Acqua" con "1,25 di 3 l" (litri con due decimali via `formatNumber`; senza target solo "1,25 l"), una barra (`ProgressTrack`), un pulsante per ogni incremento ("+250 ml", `accessibilityLabel` "Aggiungi 250 millilitri d'acqua") e "Annulla" per l'ultima aggiunta del giorno (solo se ce n'è una). `testID="acqua"` sul contenitore.
- **Piano:** nella scheda del tipo di giornata (`src/components/DayTypeCard.tsx`) un quinto campo "Acqua (ml)" (`testID="<prefisso>-acqua"`) salvato con `setWaterTarget` insieme ai target (RF-61); e sotto le schede un'impostazione "Incrementi dell'acqua" con fino a tre campi ml.
- **Flusso Maestro `acqua.yaml`:** imposta 3000 ml per Allenamento nel Piano → in Oggi "0 di 3 l" → +500 due volte → "1 di 3 l" → Annulla → "0,5 di 3 l".
- Aggiorna `docs/handoff.md` (passo 8, acqua).

---

## Task 7: Peso con media mobile e proteine in g/kg

**Requisiti:** RF-70, RF-57.

**Migrazione:**

```sql
CREATE TABLE weight_entry (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL CONSTRAINT weight_entry_date_valid
    CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  kg REAL NOT NULL CONSTRAINT weight_entry_kg_range CHECK (kg BETWEEN 20 AND 400),
  source TEXT NOT NULL DEFAULT 'manual' CONSTRAINT weight_entry_source_valid CHECK (source IN ('manual', 'health')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;
CREATE UNIQUE INDEX weight_entry_one_per_day ON weight_entry (user_id, date) WHERE deleted_at IS NULL;
```

**Dominio (`src/domain/weight.ts`, puro):** `movingAverage(entries: { date; kg }[], date, days = 7)` → media dei pesi nei 7 giorni di calendario che finiscono a `date` (solo i giorni con una pesata; null se nessuna); `weeklyChange(entries, date)` → `{ kg, percent }` tra la media a `date` e la media a `date − 7`, null se manca una delle due; `proteinPerKg(proteinG, averageKg)`. Test con giorni mancanti, una sola pesata, variazione negativa.

**Store (`src/data/weightStore.ts`):** `setWeight(db, userId, date, kg, now)` (sostituisce la pesata del giorno: aggiorna la riga esistente), `deleteWeight(db, userId, date, now)`, `weights(db, userId, fromDate, toDate)` in ordine di data. Test con vincoli con nome e utente.

**Interfaccia:**
- **Andamento** (`src/app/(tabs)/andamento.tsx`, oggi un segnaposto): "Peso di oggi" con il valore o "Pesati" (apre un foglio con il tastierino: riusa `Keypad` di `src/components/Keypad.tsx` con un decimale, `testID` dei tasti come nel foglio dei grammi; conferma "Salva 82,4 kg"); sotto "Media 7 giorni 82,1 kg" e "−0,4 kg (−0,5%) in una settimana"; un grafico SVG (react-native-svg) degli ultimi 30 giorni con i punti delle pesate (`textSecondary`) e la linea della media (`text`), senza librerie nuove; l'elenco delle ultime 14 pesate (data con `dayLabel`, kg), con tocco per modificare o eliminare.
- **Oggi:** in `src/components/DayGoals.tsx`, accanto alle proteine, "2,1 g/kg" calcolato sulla media mobile di oggi (RF-57); niente se non ci sono pesate.
- **Flusso Maestro `peso.yaml`:** Andamento → Pesati → 82,4 → Salva → "Media 7 giorni 82,4 kg" → in Oggi, dopo aver registrato albume 200 g, compare "g/kg".
- Aggiorna `docs/handoff.md` (passo 8 completo) e `docs/design.md` (grafico del peso).
