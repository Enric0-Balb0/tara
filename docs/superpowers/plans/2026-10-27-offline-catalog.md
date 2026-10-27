# Catalogo sul telefono (step 6 della demo F0) — piano di implementazione

> **Per chi esegue:** sotto-skill richiesta: superpowers:subagent-driven-development (consigliata) o superpowers:executing-plans, un task alla volta. I passi usano le caselle (`- [ ]`) per tenere traccia.

**Obiettivo:** l'app tiene in SQLite il catalogo condiviso dei generici, lo scarica da `GET /v1/catalog` del backend con l'ETag e lo consulta anche senza rete: ricerca e scheda leggono solo dal telefono.

**Architettura:** lo strato dati sta in `src/data/`, in TypeScript puro, e parla con il database attraverso un'interfaccia minima (`SqlDatabase`) che `SQLiteDatabase` di expo-sqlite soddisfa così com'è. Nei test Vitest la stessa interfaccia è implementata con `node:sqlite` in memoria, quindi schema, sostituzione del catalogo, ricerca e sincronizzazione si provano in Node con SQL vero. All'avvio `SQLiteProvider` apre `tara.db` ed esegue le migrazioni; un `CatalogProvider` controlla subito il catalogo con il server e tiene lo stato, che il menu Sviluppo del profilo mostra con un pulsante "Aggiorna catalogo".

**Tecnologie:** Expo SDK 58, expo-sqlite (nuova development build EAS), `node:sqlite` di Node 22 per i test, Vitest, Maestro.

**Spec:** approvato in chat da Enrico il 27/10/2026 (proposta dello step 6). Contesto: `docs/requisiti.md` (architettura local-first, RF-01, RF-03, RNF-03), `docs/handoff.md` (passo 7), contratto dello snapshot in `services/api/src/tara_api/foods.py` (`CatalogSnapshot`).

## Vincoli globali

- Lo snapshot ha la forma di `CatalogSnapshot`: `{ version, nutrients: [{code, name, unit}], foods: [{id, name, state, base_unit, names, values: {<code>: {amount, provenance, confidence}}}] }`; `nutrients` è già nell'ordine di visualizzazione.
- Un nutriente assente dallo snapshot resta assente sul telefono: mai salvato o mostrato come 0 (principio 2).
- Stati ammessi `raw`, `cooked`, `not_applicable`; unità base `g`, `ml`; provenienze `label`, `open_food_facts`, `reference`, `estimated`, `manual`; confidenza tra 0 e 1.
- Il catalogo condiviso ha `user_id` NULL: sostituirlo non tocca mai righe con `user_id` (principio 6, i cataloghi personali arrivano in F1).
- Indirizzo dell'API da `process.env.EXPO_PUBLIC_API_URL`, default `http://10.0.2.2:8000` (il PC visto dall'emulatore Android).
- Nessun SQL che dipenda da `PRAGMA foreign_keys` dentro una transazione: `withExclusiveTransactionAsync` di expo-sqlite apre una connessione nuova, dove le pragma della connessione principale non valgono. Le cancellazioni a cascata si scrivono esplicite.
- Tabelle `STRICT`: un valore del tipo sbagliato fallisce invece di finire salvato come testo.
- Dipendenze solo con `npx expo install`; lockfile committato. Nuova development build su EAS approvata da Enrico (una).
- Commit in inglese, Conventional Commits, scope `mobile` o `docs`; nessun trailer di attribuzione AI.
- Prima di ogni commit, in `apps/mobile`: `npm run typecheck`, `npm run lint`, `npm run test:coverage` (soglia 80%).

## Punti da presidiare

1. **Snapshot rifiutato a metà** (un alimento con stato non valido): il catalogo di prima resta intero, con versione e conteggio di prima (Task 3).
2. **Server che risponde 200 con la stessa versione** (cache di iOS o un proxy che ignora `If-None-Match`): niente riscrittura, risultato "già aggiornato" (Task 5).
3. **Server spento o che non risponde**: dopo il timeout il risultato è "offline" e il catalogo sul telefono resta consultabile (Task 5).
4. **Ricerca con caratteri speciali** (`%`, `_`, apostrofo di "d'uovo", accenti): corrispondenza letterale, nessun errore SQL (Task 4).
5. **Alimenti personali presenti** quando arriva un nuovo catalogo: restano tutti (Task 3).

---

### Task 1: expo-sqlite e nuova development build

**Files:**
- Modify: `apps/mobile/package.json`, `apps/mobile/package-lock.json`, `apps/mobile/app.json` (plugin `expo-sqlite`, se `expo install` non lo aggiunge)

- [ ] **Passo 1:** `git switch -c feat/rf-01-catalogo-sul-telefono` da `main` aggiornato.
- [ ] **Passo 2:** in `apps/mobile`: `npx expo install expo-sqlite`; `"expo-sqlite"` in `plugins` di `app.json`.
- [ ] **Passo 3:** `npm run typecheck; npm run lint; npm run doctor`. Atteso: tutto verde.
- [ ] **Passo 4:** commit `build(mobile): add expo-sqlite for the on-device catalog`.
- [ ] **Passo 5:** avvia la build senza aspettarla: `npx eas-cli@latest build -p android --profile development --non-interactive --no-wait`. Atteso: URL della build su expo.dev. Si installa nel Task 6.

### Task 2: interfaccia SQL, adattatore per i test e schema

**Files:**
- Create: `apps/mobile/src/data/sql.ts`, `apps/mobile/src/data/schema.ts`, `apps/mobile/src/data/testing/nodeDatabase.ts`
- Modify: `apps/mobile/vitest.config.mts` (coverage include `src/data/**/*.ts`, exclude `src/data/testing/**`)
- Test: `apps/mobile/src/data/schema.test.ts`

**Interfaces:**
- Produces:
  - `type SqlValue = string | number | null`
  - `interface SqlDatabase { execAsync(source: string): Promise<void>; runAsync(source: string, ...params: SqlValue[]): Promise<{ changes: number }>; getAllAsync<T>(source: string, ...params: SqlValue[]): Promise<T[]>; getFirstAsync<T>(source: string, ...params: SqlValue[]): Promise<T | null>; withExclusiveTransactionAsync(task: (txn: SqlDatabase) => Promise<void>): Promise<void> }`
  - `openTestDatabase(): SqlDatabase` (`DatabaseSync(':memory:')`; la transazione è `BEGIN` / `COMMIT`, `ROLLBACK` e rilancio dell'errore)
  - `SCHEMA_VERSION = 1`, `initDatabase(db: SqlDatabase): Promise<void>`: imposta `journal_mode = WAL` e `foreign_keys = ON`, poi applica in una transazione ciascuna le migrazioni oltre `PRAGMA user_version`, aggiornandolo.
- Schema v1 (tutte `STRICT`):
  - `nutrient(code TEXT PK, name TEXT NOT NULL, unit TEXT NOT NULL, display_order INTEGER NOT NULL)`
  - `food(id TEXT PK, user_id TEXT NULL, name TEXT NOT NULL, state TEXT NOT NULL CONSTRAINT food_state_valid CHECK (state IN ('raw','cooked','not_applicable')), base_unit TEXT NOT NULL CONSTRAINT food_base_unit_valid CHECK (base_unit IN ('g','ml')), search_text TEXT NOT NULL)`
  - `nutrient_value(food_id TEXT NOT NULL REFERENCES food(id), nutrient_code TEXT NOT NULL REFERENCES nutrient(code), amount_per_100 REAL NOT NULL CONSTRAINT nutrient_value_amount_non_negative CHECK (amount_per_100 >= 0), provenance TEXT NOT NULL CONSTRAINT nutrient_value_provenance_valid CHECK (provenance IN ('label','open_food_facts','reference','estimated','manual')), confidence REAL NOT NULL CONSTRAINT nutrient_value_confidence_range CHECK (confidence BETWEEN 0 AND 1), PRIMARY KEY (food_id, nutrient_code)) WITHOUT ROWID`
  - `sync_state(key TEXT PK, value TEXT NOT NULL)`

- [ ] **Passo 1: test che falliscono** in `schema.test.ts`:
  - `crea le tabelle e porta user_version a SCHEMA_VERSION`: `sqlite_master` contiene `food`, `nutrient`, `nutrient_value`, `sync_state`; `PRAGMA user_version` = 1.
  - `rieseguita non tocca i dati`: un `nutrient` inserito resta dopo una seconda `initDatabase`.
  - `rifiuta uno stato non previsto`: insert con `state = 'boiled'` rigettato con un messaggio che contiene `food_state_valid`.
  - `rifiuta un valore che non è un numero`: `amount_per_100 = 'abc'` rigettato (tabella `STRICT`).
  - `rifiuta una confidenza fuori da 0..1`: messaggio con `nutrient_value_confidence_range`.
- [ ] **Passo 2:** `npx vitest run src/data/schema.test.ts`. Atteso: FAIL, modulo `./schema` inesistente.
- [ ] **Passo 3:** implementa `sql.ts`, `testing/nodeDatabase.ts`, `schema.ts` e la coverage in `vitest.config.mts`.
- [ ] **Passo 4:** stesso comando. Atteso: PASS 5/5; `npm run test:coverage` verde.
- [ ] **Passo 5:** commit `feat(mobile): add the on-device database schema`.

### Task 3: chiave di ricerca e sostituzione del catalogo

**Files:**
- Create: `apps/mobile/src/domain/search.ts`, `apps/mobile/src/data/catalogStore.ts`, `apps/mobile/src/data/testing/snapshot.ts`
- Test: `apps/mobile/src/domain/search.test.ts`, `apps/mobile/src/data/catalogStore.test.ts`

**Interfaces:**
- Consumes: `SqlDatabase`, `openTestDatabase`, `initDatabase` (Task 2).
- Produces:
  - `searchKey(text: string): string`: NFD, rimozione dei segni `[̀-ͯ]` (non `\p{M}`: Hermes), minuscole, spazi compressi, trim.
  - `searchWords(query: string): string[]`: parole di `searchKey(query)`.
  - `class SnapshotError extends Error`
  - `replaceCatalog(db: SqlDatabase, snapshotText: string, meta: { etag: string | null; syncedAt: string }): Promise<{ version: string; foodCount: number }>`
  - `catalogInfo(db: SqlDatabase): Promise<CatalogInfo>`, con `interface CatalogInfo { foodCount: number; version: string | null; etag: string | null; syncedAt: string | null; checkedAt: string | null }`
  - `markChecked(db: SqlDatabase, checkedAt: string): Promise<void>`
  - Chiavi di `sync_state`: `catalog_version`, `catalog_etag`, `catalog_synced_at`, `catalog_checked_at`.
  - Per i test: `TEST_FOODS: TestFood[]` (`TestFood` ha la forma di un alimento dello snapshot) e `snapshotText(foods = TEST_FOODS, version = 'v1'): string`. `TEST_FOODS` contiene l'albume crudo e cotto di CIQUAL (nome `Albume d'uovo` per entrambi, 48,1 e 47,3 kcal; proteine 10,9 e 10,3; carboidrati 0,73 e 1,12; grassi 0,17; zuccheri assenti; provenienza `reference`) e `Caffè espresso` (`not_applicable`, `names: ["Caffè espresso", "Espresso"]`, il canonico per primo come nell'API).
- Approccio di `replaceCatalog`: `JSON.parse` e controllo della forma esterna (`version` stringa non vuota, `nutrients` e `foods` array), altrimenti `SnapshotError`. In `withExclusiveTransactionAsync`: cancella prima `nutrient_value` e poi `food` delle sole righe con `user_id IS NULL`; inserisce o aggiorna `nutrient` (`display_order` = indice); inserisce `food` con `search_text` = chiavi distinte di `[name, ...names]` unite da `\n`; inserisce `nutrient_value` con un solo `INSERT … SELECT` su `json_each(?, '$.foods')` × `json_each(food.value, '$.values')` sul testo originale, senza un `runAsync` per ogni riga (sono circa 90 000); scrive le quattro chiavi di `sync_state` (`checked_at` = `syncedAt`).

- [ ] **Passo 1: test che falliscono.**
  - `search.test.ts`: `searchKey("Caffè")` → `caffe`; `searchKey("WÜRSTEL")` → `wurstel`; `searchKey("  Petto   di POLLO ")` → `petto di pollo`; `searchKey("Albume d'uovo")` → `albume d'uovo`; `searchWords(" albume  crudo ")` → `["albume", "crudo"]`; `searchWords("")` → `[]`.
  - `catalogStore.test.ts`:
    - `salva alimenti, nomi per la ricerca e valori con provenienza`: dopo `replaceCatalog`, `catalogInfo` dà `foodCount` 3, versione ed ETag dello snapshot; il `search_text` del caffè è `caffe espresso\nespresso`; l'albume crudo ha `protein_g` 10,9, `reference`, confidenza come nello snapshot.
    - `un nutriente assente non diventa zero`: nessuna riga `sugars_g` per l'albume.
    - `un catalogo nuovo sostituisce il vecchio`: un secondo snapshot senza il caffè lo fa sparire, con i suoi valori.
    - `uno snapshot rifiutato lascia intatto il catalogo di prima` (punto 1): secondo snapshot con un alimento `state: 'boiled'` → `replaceCatalog` rigetta; `catalogInfo` uguale a prima, valori dell'albume presenti.
    - `testo non JSON o senza foods dà SnapshotError`: `'<html>'` e `'{"version":"x"}'`.
    - `non tocca gli alimenti personali` (punto 5): un `food` con `user_id = 'u1'` e un suo valore restano dopo `replaceCatalog`.
    - `markChecked aggiorna solo l'ora del controllo`.
- [ ] **Passo 2:** `npx vitest run src/domain/search.test.ts src/data/catalogStore.test.ts`. Atteso: FAIL, moduli inesistenti.
- [ ] **Passo 3:** implementa `search.ts`, `testing/snapshot.ts`, `catalogStore.ts`.
- [ ] **Passo 4:** stesso comando. Atteso: PASS; `npm run test:coverage` verde.
- [ ] **Passo 5:** commit `feat(mobile): store the shared catalog snapshot in SQLite`.

### Task 4: ricerca e scheda dal telefono

**Files:**
- Modify: `apps/mobile/src/data/catalogStore.ts`
- Test: `apps/mobile/src/data/catalogQueries.test.ts`

**Interfaces:**
- Consumes: `replaceCatalog`, `snapshotText`, `searchWords` (Task 3).
- Produces:
  - `searchFoods(db: SqlDatabase, query: string, limit?: number): Promise<FoodHit[]>`, default 20, con `interface FoodHit { id: string; name: string; state: FoodState; baseUnit: 'g' | 'ml'; per100: { energy_kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } }`
  - `getFood(db: SqlDatabase, id: string): Promise<FoodDetail | null>`, con `interface FoodDetail { id: string; name: string; state: FoodState; baseUnit: 'g' | 'ml'; nutrients: { code: string; name: string; unit: string; amountPer100: number; provenance: string; confidence: number }[] }` nell'ordine di `display_order`.
- Regole della ricerca, come il backend (`search_foods`) senza la somiglianza a trigrammi: ogni parola compare in `search_text` (`LIKE '%parola%' ESCAPE '\'`, con `%`, `_` e `\` protetti); prima i nomi che iniziano con la ricerca (`'\n' || search_text LIKE '%\n' || chiave || '%'`), poi il crudo, poi il nome più corto, poi il nome. Nessuna parola, o ricerca più corta di 2 caratteri dopo `searchKey`: `[]`. Solo il catalogo condiviso e quello dell'utente in futuro: per ora nessun filtro su `user_id`.

- [ ] **Passo 1: test che falliscono** in `catalogQueries.test.ts`:
  - `trova l'albume e mette il crudo prima del cotto`: `searchFoods(db, 'albume')` → due risultati, `state` `raw` poi `cooked`, `per100.protein_g` 10,9 e 10,3.
  - `ignora accenti e maiuscole`: `searchFoods(db, 'CAFFE')` e `searchFoods(db, 'caffè')` trovano `Caffè espresso`.
  - `cerca anche nei nomi aggiuntivi`: `searchFoods(db, 'espresso')` lo trova.
  - `ogni parola deve comparire`: `searchFoods(db, 'albume caffè')` → `[]`.
  - `prima i nomi che iniziano con la ricerca`: con un alimento `Uovo intero` e l'albume (`Albume d'uovo`), `searchFoods(db, 'uovo')` dà `Uovo intero` per primo.
  - `i caratteri speciali valgono alla lettera` (punto 4): `searchFoods(db, "d'uovo")` trova l'albume; `searchFoods(db, '%')` e `searchFoods(db, '_a')` → `[]` senza errori.
  - `una ricerca di un carattere non restituisce nulla`: `searchFoods(db, 'a')` → `[]`.
  - `rispetta il limite`: `searchFoods(db, 'albume', 1)` → un risultato.
  - `la scheda ha i nutrienti presenti nell'ordine dell'etichetta`: `getFood` dell'albume crudo ha `energy_kcal` prima di `protein_g` (ordine dello snapshot), nessun `sugars_g`, provenienza e confidenza; `getFood(db, 'inesistente')` → `null`.
- [ ] **Passo 2:** `npx vitest run src/data/catalogQueries.test.ts`. Atteso: FAIL, `searchFoods` non esportata.
- [ ] **Passo 3:** implementa `searchFoods` e `getFood`.
- [ ] **Passo 4:** stesso comando. Atteso: PASS; `npm run test:coverage` verde.
- [ ] **Passo 5:** commit `feat(mobile): search the catalog on the phone`.

### Task 5: sincronizzazione con il server

**Files:**
- Create: `apps/mobile/src/data/catalogSync.ts`
- Test: `apps/mobile/src/data/catalogSync.test.ts`

**Interfaces:**
- Consumes: `replaceCatalog`, `catalogInfo`, `markChecked`, `SnapshotError` (Task 3).
- Produces:
  - `type SyncResult = { kind: 'updated'; version: string; foodCount: number } | { kind: 'unchanged' } | { kind: 'failed'; reason: 'offline' | 'server' | 'invalid' }`
  - `syncCatalog(db: SqlDatabase, options: { apiUrl: string; fetch?: typeof fetch; now?: () => Date; timeoutMs?: number }): Promise<SyncResult>`, default `globalThis.fetch`, `() => new Date()`, 30 000 ms.
- Comportamento: `GET {apiUrl senza / finale}/v1/catalog` con `Accept: application/json` e, se il telefono ha già alimenti e un ETag, `If-None-Match: <etag>`. `304` → `markChecked`, `unchanged`. `200` → se la `version` del corpo è quella salvata, `markChecked` e `unchanged`; altrimenti `replaceCatalog` con l'header `ETag` e `syncedAt` = `now().toISOString()`, `updated`. Altri stati → `failed/server`. Errore di rete o timeout (`AbortController` + `setTimeout`, sempre ripulito) → `failed/offline`. `SnapshotError` o errore del database durante la sostituzione → `failed/invalid`. Nei casi `failed` il database non cambia.

- [ ] **Passo 1: test che falliscono** in `catalogSync.test.ts`, con un `fetch` finto che registra URL e header e risponde con `new Response(...)`:
  - `al primo avvio scarica il catalogo`: telefono vuoto, 200 con ETag `"v1"` → `updated` con `foodCount` 3; nessun `If-None-Match` inviato; URL `http://api.test/v1/catalog` anche con `apiUrl` `http://api.test/`.
  - `con il catalogo già scaricato chiede solo se è cambiato`: secondo giro → header `If-None-Match: "v1"`; 304 → `unchanged`, `checkedAt` = ora finta, alimenti intatti.
  - `stessa versione con 200 non riscrive` (punto 2): 200 con la stessa `version` → `unchanged`, `syncedAt` invariato.
  - `una versione nuova sostituisce il catalogo`: 200 con versione `v2` senza il caffè → `updated`, il caffè non c'è più.
  - `server spento: offline e catalogo intatto`: `fetch` che rigetta `TypeError('Network request failed')` → `failed/offline`, `catalogInfo` invariato.
  - `server che non risponde: offline dopo il timeout` (punto 3): `fetch` che resta in attesa finché il segnale non viene annullato, `timeoutMs: 10` → `failed/offline`.
  - `errore del server` → 500 → `failed/server`.
  - `corpo non valido` → 200 con `'<html>'` → `failed/invalid`, catalogo di prima intatto.
- [ ] **Passo 2:** `npx vitest run src/data/catalogSync.test.ts`. Atteso: FAIL, modulo inesistente.
- [ ] **Passo 3:** implementa `catalogSync.ts`.
- [ ] **Passo 4:** stesso comando. Atteso: PASS; `npm run test:coverage` verde.
- [ ] **Passo 5:** commit `feat(mobile): sync the catalog with the server using the ETag`.

### Task 6: avvio, stato nel menu Sviluppo, verifica sull'emulatore e documentazione

**Files:**
- Create: `apps/mobile/src/config.ts`, `apps/mobile/src/data/CatalogProvider.tsx`, `apps/mobile/src/data/catalogStatus.ts`, `apps/mobile/.env.example`, `apps/mobile/.maestro/catalogo.yaml`
- Modify: `apps/mobile/src/domain/format.ts` (`formatDate`, `formatTime`), `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/app/profilo.tsx`, `apps/mobile/scripts/e2e.mjs`, `apps/mobile/CLAUDE.md`, `docs/handoff.md`
- Test: `apps/mobile/src/domain/format.test.ts`, `apps/mobile/src/data/catalogStatus.test.ts`

**Interfaces:**
- Consumes: `initDatabase` (Task 2), `catalogInfo` (Task 3), `syncCatalog`, `SyncResult` (Task 5).
- Produces:
  - `API_URL: string` in `src/config.ts` (lettura statica di `process.env.EXPO_PUBLIC_API_URL`, poi il default).
  - `formatDate(date: Date): string` → `27/10/2026`; `formatTime(date: Date): string` → `15:42` (ora locale, zeri a sinistra, senza `Intl`).
  - `describeCatalog(info: CatalogInfo | null, last: SyncResult | null, syncing: boolean): { title: string; detail: string }`
  - `CatalogProvider` (dentro `SQLiteProvider`): legge `catalogInfo`, lancia `syncCatalog` al montaggio, rilegge `catalogInfo` a fine giro; `useCatalog(): { info: CatalogInfo | null; last: SyncResult | null; syncing: boolean; refresh: () => void }`; `refresh` non avvia un secondo giro se uno è in corso.
- Testi di `describeCatalog` (titolo / dettaglio):
  - titolo: `3484 alimenti` (con `formatNumber`), `Catalogo vuoto` se 0, `Catalogo` se `info` è null;
  - dettaglio, nell'ordine: `syncing` → `Controllo aggiornamenti…`; `failed/offline` → `Server non raggiungibile: uso la copia sul telefono` (o `Server non raggiungibile: avvia il backend e riprova` con 0 alimenti); `failed/server` → `Il server ha risposto con un errore`; `failed/invalid` → `Catalogo ricevuto non valido: tengo quello di prima`; `unchanged` → `Già aggiornato, controllato il 27/10/2026 alle 15:42`; con `syncedAt` → `Scaricato il 27/10/2026 alle 15:42`; altrimenti `Mai scaricato`.

- [ ] **Passo 1: test che falliscono.** `format.test.ts`: `formatDate(new Date(2026, 0, 5, 9, 3))` → `05/01/2026`, `formatTime` della stessa data → `09:03`. `catalogStatus.test.ts`: un caso per ogni riga di testo sopra, con date costruite in ora locale.
- [ ] **Passo 2:** `npx vitest run src/domain/format.test.ts src/data/catalogStatus.test.ts`. Atteso: FAIL.
- [ ] **Passo 3:** implementa `formatDate`, `formatTime`, `describeCatalog`; poi `config.ts`, `.env.example` (`EXPO_PUBLIC_API_URL=http://10.0.2.2:8000`, con il commento su `.env.local` e sull'IP del PC per un telefono vero), `CatalogProvider.tsx`; in `_layout.tsx` `SQLiteProvider databaseName="tara.db" onInit={initDatabase}` attorno a `CatalogProvider` e allo `Stack`; in `profilo.tsx`, sezione Sviluppo, il blocco Catalogo con titolo, dettaglio e il pulsante `Aggiorna catalogo` (stesso stile della riga esistente, disattivato mentre `syncing`). Il tipo di `useSQLiteContext()` assegnato a `SqlDatabase` senza cast: è la prova che expo-sqlite soddisfa l'interfaccia.
- [ ] **Passo 4:** `npm run typecheck; npm run lint; npm run test:coverage; npm run doctor`. Atteso: tutto verde.
- [ ] **Passo 5: flusso Maestro** `catalogo.yaml`, tag `api`: avvio, Profilo, attende `\d+ alimenti`, tocca `Aggiorna catalogo`, attende `Già aggiornato, controllato il .*`. In `e2e.mjs`: se `http://localhost:8000/health` non risponde entro 2 s, escludi il tag `api` e scrivilo in console.
- [ ] **Passo 6: verifica sull'emulatore.** Postgres (`docker compose -f infra/docker-compose.yml up -d`), migrazioni e catalogo caricato, `uv run uvicorn tara_api.main:app`; build del Task 1 installata con `npx eas-cli@latest build:run -p android --latest`; `npx expo start --dev-client`; `npm run e2e:dev`. Atteso: 3 flussi su 3. Poi, a mano:
  - screenshot del profilo con il catalogo scaricato;
  - API spenta e "Aggiorna catalogo": compare "Server non raggiungibile: uso la copia sul telefono" e il conteggio resta;
  - copia di `tara.db` (con `-wal`) dal telefono con `adb exec-out run-as com.enricobalbo.tara cat files/SQLite/tara.db` e lettura con `node:sqlite`: `search_text` del caffè senza accento. Prova che la normalizzazione funziona anche con Hermes.
- [ ] **Passo 7: documentazione.** `apps/mobile/CLAUDE.md`: `src/data/` nella struttura, `EXPO_PUBLIC_API_URL`, backend acceso per il primo download, test SQL con `node:sqlite`. `docs/handoff.md`, passo 7: SQLite e snapshot fatti (sostituzione in una transazione, ricerca locale con `LIKE` su testo senza accenti, ETag), resta la schermata di ricerca; compromesso: le build preview bloccano l'HTTP in chiaro, quindi per provarle con il backend locale serve `expo-build-properties` o il backend online.
- [ ] **Passo 8:** commit `feat(mobile): download the catalog at startup and show its status in the dev menu`, poi `docs: record the on-device catalog in the handoff` se separato; push e PR.
