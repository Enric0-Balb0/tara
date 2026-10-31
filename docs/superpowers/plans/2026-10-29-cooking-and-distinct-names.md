# Cottura e nomi distinti nel catalogo (prima del gate F0) — piano di implementazione

> **Per chi esegue:** sotto-skill richiesta: superpowers:subagent-driven-development (consigliata) o superpowers:executing-plans, un task alla volta. I passi usano le caselle (`- [ ]`) per tenere traccia.

**Obiettivo:** nel catalogo condiviso nessun alimento è indistinguibile da un altro. La ricerca "broccoli" mostra tre broccoli cotti con la loro cottura ("al vapore", "lessato") invece di tre righe uguali con valori diversi, e i nomi rotti o troppo generici sono corretti.

**Architettura:**
- **Pipeline:** il metodo di cottura è già prodotto dal modello e rivedibile, ma l'export lo scartava. Ora entra nel catalogo, normalizzato: "cotto" come cottura non dice niente.
- **Controlli deterministici:** due controlli nuovi mandano in revisione e bloccano l'export:
  - nome con frammenti della risposta del modello ("Mandorle,state:");
  - stesso nome, stato e cottura.
- **Backend:**
  - colonna `food.cooking` con i suoi vincoli;
  - un vincolo di esclusione differito che vieta due generici con lo stesso nome, stato e cottura;
  - snapshot al formato 3.
- **App:**
  - migrazione v3;
  - cottura in secondo piano nella riga di risultato e nella scheda;
  - cottura cercabile ("patata forno").
- **Correzioni dei nomi:** le propongo io, le conferma Enrico, e si salvano in `data/revisioni.csv` con `translate applica`.

**Tecnologie:**
- Python 3.12 con pydantic-ai (pipeline);
- FastAPI, SQLAlchemy 2.1, Alembic, Postgres 17;
- Expo SDK 58 con expo-sqlite, Vitest e Maestro.

Nessuna dipendenza nativa nuova, quindi nessuna build EAS.

**Spec:**
- `docs/requisiti.md`, riga "Stato e cottura": la cottura è un dettaglio secondario, facoltativo, mai controllato e mostrato in secondo piano; nel nome sono vietati solo "crudo" e "cotto".
- `docs/requisiti.md`, modello dati e principi 1–4.
- `docs/design.md`: riga di risultato e scheda alimento.
- `docs/handoff.md`, step 7: doppioni da sistemare prima del gate.

## Vincoli globali

- La cottura non entra nel nome e non cambia lo stato. Vale solo per i cotti; "cotto" (e le sue forme) come cottura equivale a nessuna cottura.
- I valori nutrizionali non cambiano: si toccano solo nomi, alias e cottura (principio 1).
- Una correzione di nome entra in `data/revisioni.csv`, con origine `reviewed`, solo dopo la conferma di Enrico. Il modello e io proponiamo, la persona conferma.
- Testi per l'utente con il vocabolario di `docs/design.md`.
  - La cottura si mostra così com'è ("al vapore"), in minuscolo, in `textSecondary`.
  - Il lettore dello schermo dice "cotto, al vapore".
- Commit in inglese, Conventional Commits, scope `catalog`, `api`, `mobile` o `docs`; nessun trailer di attribuzione AI.
- Prima di ogni commit si eseguono i controlli del pacchetto toccato:
  - `pipelines/catalog` e `services/api`: ruff, ruff format, mypy e pytest con coverage;
  - `apps/mobile`: typecheck, lint e `test:coverage`.

## Punti da presidiare

1. **Ricaricamento in cui due alimenti si scambiano il nome:** il caricamento riesce, perché il vincolo si controlla al commit (Task 2).
2. **Database locale con il catalogo vecchio, pieno di doppioni, quando arriva la migrazione del vincolo:** la migrazione dà un errore che dice cosa fare, non un errore di vincolo grezzo (Task 2).
3. **Telefono con il catalogo del formato 2, senza cottura, dopo l'aggiornamento:**
   - ricerca e scheda funzionano senza cottura;
   - la cottura arriva al download successivo, perché cambia la versione (Task 3).
4. **Cottura lunga con testo al 130%** ("alla griglia, in padella, fritto"): il nome resta visibile e la cottura va a capo su una riga sua (Task 3).
5. **Revisione che crea un doppione** (un nome corretto uguale a un altro alimento): l'export si ferma e nomina i codici (Task 1).

---

### Task 1: cottura nel catalogo e controlli dei nomi (pipeline)

**Files:**
- Modify:
  - `pipelines/catalog/src/tara_catalog/translation.py`
  - `pipelines/catalog/src/tara_catalog/export.py`
  - `pipelines/catalog/src/tara_catalog/translate.py` (`write_review`)
- Test:
  - `pipelines/catalog/tests/test_translation.py`
  - `pipelines/catalog/tests/test_export.py`
  - `pipelines/catalog/tests/test_translate_cli.py`

**Interfaces:**
- **Produces (in `translation.py`):**
  - `normalize_cooking(cooking: str | None, state: State) -> str | None`:
    - spazi tolti;
    - `None` se lo stato non è `cooked`, se la stringa è vuota o se è una forma di "cotto";
    - `finalize` la usa.
  - `review_issues` aggiunge `frammento della risposta nel nome: 'Mandorle,state:'` quando il nome contiene `state:`, `cooking:`, `part:`, `name_it` o `aliases_it`.
  - `NameKey = tuple[str, str, State, str | None]` (codice, nome, stato, cottura).
  - `same_name_groups(keys: Iterable[NameKey]) -> list[list[str]]`:
    - restituisce i gruppi di almeno due codici con stesso `name.lower()`, stato e cottura (`None` conta come valore);
    - l'ordine segue quello d'ingresso.
- **Produces (in `export.py`):**
  - `catalog_entry` aggiunge `"cooking"`: quella della revisione se c'è, altrimenti quella della traduzione.
  - `DuplicateNamesError(ValueError)`: `export_catalog` la solleva prima di scrivere il file. Il messaggio ha una riga per gruppo, `«Broccoli» (cooked, al vapore): 20304, 20350`.
- **Produces (in `write_review`):** gli alimenti non rivisti di un gruppo ricevono il problema `stesso nome di 20350 (Brocoli, bouilli/cuit à l'eau (aliment moyen))`, uno per ogni altro codice del gruppo. Per il confronto valgono i nomi rivisti.

- [ ] **Passo 1: test che falliscono.**
  - `test_cooking_is_dropped_when_it_only_repeats_the_state`: `normalize_cooking(" cotto ", "cooked") is None` e `normalize_cooking("al vapore ", "cooked") == "al vapore"`; con `"raw"` vale `None`.
  - `test_leaked_response_fragment_is_flagged`: per `"Mandorle,state:"` c'è un problema che contiene `frammento della risposta`.
  - `test_same_name_groups_ignore_case_and_split_on_state_and_cooking`.
  - `test_catalog_entry_carries_cooking` (dalla traduzione e dalla revisione).
  - `test_export_refuses_indistinguishable_foods`: un'unica `DuplicateNamesError` con i due codici, e il file non viene scritto.
  - `test_review_resolves_a_duplicate`: con un nome rivisto l'export riesce.
  - `test_review_file_flags_foods_with_the_same_name`.
- [ ] **Passo 2:** `uv run pytest -q`. Atteso: FAIL su queste funzioni (nomi non definiti, oppure `cooking` assente).
- [ ] **Passo 3:** implementa le interfacce sopra.
- [ ] **Passo 4:** `uv run ruff check .; uv run ruff format --check .; uv run mypy; uv run pytest --cov`. Atteso: verde, coverage ≥ 80%.
- [ ] **Passo 5:** commit `feat(catalog): keep the cooking method and stop indistinguishable names`.

### Task 2: cottura e nomi distinti nel database (backend)

**Files:**
- Create:
  - `services/api/migrations/versions/20261029_<rev>_food_cooking.py`
  - `services/api/migrations/versions/20261029_<rev>_shared_names_distinct.py`
- Modify:
  - `services/api/src/tara_api/db/models.py`
  - `services/api/src/tara_api/catalog_load.py`
  - `services/api/src/tara_api/foods.py`
  - `services/api/postman/tara-api.postman_collection.json`
- Test:
  - `services/api/tests/test_catalog_schema.py`
  - `services/api/tests/test_catalog_load.py`
  - `services/api/tests/test_migrations.py`
  - `services/api/tests/test_foods_api.py`

**Interfaces:**
- **Migrazione `food_cooking`:**
  - `food.cooking TEXT NULL`;
  - `ck_food_cooking_not_blank`: `length(btrim(cooking)) > 0`;
  - `ck_food_cooking_only_cooked`: `cooking IS NULL OR state = 'cooked'`.
- **Migrazione `shared_names_distinct`:**
  - prima conta i gruppi doppi del catalogo condiviso. Se ce ne sono, solleva `RuntimeError` con il messaggio: "il catalogo condiviso ha N gruppi di alimenti con lo stesso nome, stato e cottura: ricarica il catalogo corretto (tara_api.catalog_load) e rilancia alembic upgrade head";
  - poi aggiunge `ex_food_shared_name_state_cooking EXCLUDE USING btree (lower(name) WITH =, state WITH =, coalesce(cooking, '') WITH =) WHERE (user_id IS NULL) DEFERRABLE INITIALLY DEFERRED`.
  - È una migrazione separata, così un database locale con il catalogo vecchio passa da `upgrade <food_cooking>`, poi dal caricamento, poi da `upgrade head`.
- **Model:** `Food.cooking: Mapped[str | None]`, con i due `CheckConstraint` e un `ExcludeConstraint` con lo stesso nome.
- **`CatalogEntry.cooking: Text | None = None`:** il caricatore la scrive in inserimento e in aggiornamento.
- **`foods.py`:**
  - `SNAPSHOT_FORMAT = 3`;
  - `cooking: str | None` in `SnapshotFood`, `FoodHit` e `FoodDetail`;
  - nella ricerca, dopo `Food.name`, l'ordine aggiunge `Food.cooking.nulls_first()`.

- [ ] **Passo 1: test che falliscono.**
  - Vincoli, nominati con `violates(...)`: cottura vuota, cottura su un crudo, due generici uguali. Per l'esclusione serve `SET CONSTRAINTS ALL IMMEDIATE`.
  - Casi permessi: cotture diverse; lo stesso nome nel catalogo personale.
  - `test_reload_can_swap_two_names`.
  - `test_cooking_is_loaded_and_updated`.
  - `test_distinct_names_migration_explains_duplicates`: database temporaneo, `upgrade` a `food_cooking`, due doppioni, poi `upgrade head` deve sollevare un errore che nomina `catalog_load`.
  - `test_snapshot_carries_cooking`.
  - `test_search_hit_has_cooking_and_plain_cooked_first`.
- [ ] **Passo 2:** `uv run pytest -q`. Atteso: FAIL.
- [ ] **Passo 3:** implementa. Le migrazioni si scrivono a mano, perché Alembic non genera i vincoli di esclusione. Poi si rileggono.
- [ ] **Passo 4:** nella collezione Postman, test "ogni alimento ha il campo cottura".
- [ ] **Passo 5:** `uv run ruff check .; uv run ruff format --check .; uv run mypy; uv run pytest --cov`. Atteso: verde, compreso `test_models_match_migrations`.
- [ ] **Passo 6:** commit `feat(api): store the cooking method and keep shared food names distinct`.

### Task 3: cottura sul telefono (app)

**Files:**
- Modify:
  - `apps/mobile/src/data/schema.ts` (v3)
  - `apps/mobile/src/data/catalogStore.ts`
  - `apps/mobile/src/data/testing/snapshot.ts`
  - `apps/mobile/src/domain/food.ts`
  - `apps/mobile/src/components/ResultRow.tsx`
  - `apps/mobile/src/app/cerca.tsx`
  - `apps/mobile/src/app/alimento/[id].tsx`
  - `apps/mobile/src/app/design.tsx`
  - `apps/mobile/.maestro/ricerca.yaml`
  - `docs/design.md`
- Test:
  - `apps/mobile/src/data/schema.test.ts`
  - `apps/mobile/src/data/catalogStore.test.ts`
  - `apps/mobile/src/data/catalogQueries.test.ts`
  - `apps/mobile/src/domain/food.test.ts`

**Interfaces:**
- **Migrazione v3:** `ALTER TABLE food ADD COLUMN cooking TEXT CONSTRAINT food_cooking_valid CHECK (cooking IS NULL OR (length(trim(cooking)) > 0 AND state = 'cooked'))`, con `SCHEMA_VERSION = 3`.
- **Snapshot:** il cibo dello snapshot ha `cooking?: string | null`. Se manca (formato 2) diventa NULL.
- **`search_text`:** include la cottura su una riga sua.
- **`FoodHit.cooking` e `FoodDetail.cooking`:** `string | null`. `searchFoods` ordina dopo il nome con `f.cooking IS NOT NULL, f.cooking`.
- **`stateLabel(state: FoodState, cooking: string | null): string` in `domain/food.ts`:**
  - `'cotto, al vapore'`;
  - `'cotto'`;
  - `''` per crudo e n.a.;
  - serve alle etichette del lettore dello schermo.
- **Componenti:**
  - `ResultRow` riceve `cooking?: string | null` e la mostra sotto il nome in `minimum`/`textSecondary`, su una riga;
  - la scheda la mostra sotto il titolo in `caption`/`textSecondary`.

- [ ] **Passo 1: test che falliscono.**
  - Migrazione da un database v2.
  - `replaceCatalog` salva la cottura, e NULL con uno snapshot del formato 2.
  - Cotture diverse dal crudo rifiutate dal vincolo.
  - `searchFoods("patata forno")` trova la patata al forno; il cotto senza cottura viene prima.
  - `getFood` restituisce `cooking`.
  - `stateLabel`.
- [ ] **Passo 2:** `npm run test -- --run`. Atteso: FAIL.
- [ ] **Passo 3:** implementa. In `docs/design.md`, la riga di risultato e la scheda aggiungono "cottura in secondo piano, se c'è".
- [ ] **Passo 4:** `npm run typecheck; npm run lint; npm run test:coverage`. Atteso: verde.
- [ ] **Passo 5:** commit `feat(mobile): show the cooking method next to cooked foods`.

### Task 4: nomi corretti e verifica sul telefono (dati e documenti)

**Files:**
- Create: `pipelines/catalog/data/revisioni.csv` (versionato).
- Modify:
  - `docs/requisiti.md` (modello dati `food.cooking`; decisione "Stato e cottura": cottura mostrata nella riga e nella scheda; nel catalogo condiviso nome, stato e cottura distinguono ogni alimento);
  - `docs/handoff.md`.

- [ ] **Passo 1:** `uv run python -m tara_catalog.translate revisione`. Leggi le righe con "stesso nome di" o "frammento della risposta".
- [ ] **Passo 2:** per ogni gruppo proponi i nomi:
  - si rinomina l'alimento con il dettaglio in più (Martinica, confezionato, valori medi, età);
  - si corregge chi ha il nome sbagliato (brodo ricostituito, involtino di carta di riso);
  - si mostrano a Enrico originale, macro e proposta.
- [ ] **Passo 3:** con la conferma di Enrico, scrivi le correzioni nelle colonne `nome`/`alias`/`note` di `revisione.csv` ed esegui `uv run python -m tara_catalog.translate applica`. Atteso: `data/revisioni.csv` con le righe confermate.
- [ ] **Passo 4:** `uv run python -m tara_catalog.export ciqual`. Atteso: nessuna `DuplicateNamesError`.
- [ ] **Passo 5:** in `services/api`:
  1. `uv run alembic upgrade <food_cooking>`;
  2. caricamento con `catalog_load`;
  3. `uv run alembic upgrade head`.

  Atteso: zero gruppi doppi in SQL.
- [ ] **Passo 6:** sull'emulatore l'app riscarica il catalogo, e "broccoli" mostra "al vapore" e "lessato". Lancia `npm run e2e`. Atteso: tutti i flussi verdi.
- [ ] **Passo 7:** aggiorna `docs/requisiti.md` e `docs/handoff.md`, comprese le istruzioni per il database locale.
- [ ] **Passo 8:** commit `fix(catalog): give every shared food a distinct name` e `docs: record cooking and distinct names in the catalog`.
