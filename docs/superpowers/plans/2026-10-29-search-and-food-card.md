# Ricerca, scheda alimento e grammi (step 7 della demo F0) — piano di implementazione

> **Per chi esegue:** sotto-skill richiesta: superpowers:subagent-driven-development (consigliata) o superpowers:executing-plans, un task alla volta. I passi usano le caselle (`- [ ]`) per tenere traccia.

**Obiettivo:** dal catalogo sul telefono, "Cerca un alimento" trova l'albume, la scheda mostra l'etichetta per 100 g con la fonte, e il foglio dei grammi riporta i valori alla quantità pesata, anche offline.

**Architettura:** la ricerca e la scheda leggono da SQLite (`searchFoods`, `getFood` dello step 6). Lo snapshot del backend porta ora la fonte di ogni alimento (formato 2), che il telefono salva con una migrazione v2. Le schermate sono sottili: i testi e le regole stanno in funzioni pure testate con Vitest; le schermate si verificano sull'emulatore con Maestro.

**Tecnologie:** Expo SDK 58, Expo Router (Stack e Tabs con `BottomTabBar` da `expo-router/tabs`), expo-sqlite, FastAPI, Vitest, pytest, Maestro. Nessuna dipendenza nativa nuova: nessuna build EAS.

**Spec:** `docs/design.md` (componenti, schermate, linguaggio, accessibilità) e il gate della demo "cerco albume, vedo i valori giusti, inserisco i grammi, funziona offline". Decisione di Enrico del 29/10/2026: in F0 il foglio dei grammi **solo calcola** (il diario, RF-40…45, resta in F1). Rimandati della revisione dello step 6 che toccano la ricerca: `.superpowers/sdd/2026-10-27-offline-catalog/progress.md` (righe `minor (deferred)`).

## Vincoli globali

- Nessuna scrittura nel diario: il foglio riporta la quantità sulla scheda, l'azione principale si chiama "Usa 500 g".
- Stato: nell'interfaccia compare solo "cotto"; crudo e n.a. senza etichetta. Un valore mancante si mostra `–`, mai `0`.
- Testi in italiano con il vocabolario di `docs/design.md` ("Cerca un alimento", grammi, crudo, cotto); niente "database" o "catalogo" nei testi per l'utente finale (fuori dal menu Sviluppo).
- Valori visivi solo dai token di `src/theme`; tocchi ≥ 44; etichette per il lettore dello schermo in italiano, numeri con l'unità ("200 grammi").
- Attribuzione CIQUAL (RNF-10): "Anses. 2025. Table de composition nutritionnelle des aliments Ciqual", Licence Ouverte / Etalab 2.0, con la nota che i nomi sono tradotti in italiano.
- Dipendenze solo con `npx expo install` / `uv add`; commit in inglese, Conventional Commits, scope `api`, `mobile` o `docs`; nessun trailer di attribuzione AI.
- Prima di ogni commit nel pacchetto toccato: in `apps/mobile` typecheck, lint, `test:coverage`; in `services/api` ruff, ruff format, mypy, `pytest --cov`.

## Punti da presidiare

1. **Apostrofo tipografico** digitato dalla tastiera iOS ("albume d’uovo"): trova l'albume come l'apostrofo dritto (Task 2).
2. **Catalogo non ancora sul telefono** (primo avvio senza rete): la ricerca lo dice e non mostra "nessun risultato" (Task 3).
3. **Alimento senza variante cruda o cotta**: il foglio non mostra il selettore crudo/cotto, invece di un tasto che non fa nulla (Task 2, Task 4).
4. **Ricerche che arrivano fuori ordine** mentre si digita: si mostrano solo i risultati dell'ultima ricerca (Task 5).
5. **Telefono con il catalogo del formato 1** (senza fonte) dopo l'aggiornamento dell'app: la scheda non si rompe e la fonte compare al primo download del formato 2 (Task 2).

---

### Task 1: fonte di ogni alimento nello snapshot (backend)

**Files:**
- Modify: `services/api/src/tara_api/foods.py` (`SnapshotFood.source: FoodSource`, `SNAPSHOT_FORMAT = 2`), `services/api/postman/tara-api.postman_collection.json` (controllo `source` sul catalogo)
- Test: `services/api/tests/test_foods_api.py`

- [ ] **Passo 1:** `git switch -c feat/rf-01-ricerca-e-scheda` da `main` aggiornato; avvia Postgres (`docker compose -f infra/docker-compose.yml up -d`).
- [ ] **Passo 2: test che fallisce** `test_snapshot_says_where_each_food_comes_from`: nel catalogo di prova ogni alimento dello snapshot ha `source == "ciqual"`.
- [ ] **Passo 3:** `uv run pytest tests/test_foods_api.py -k source`. Atteso: FAIL (`KeyError: 'source'`).
- [ ] **Passo 4:** aggiungi `source` a `SnapshotFood` e a `build_snapshot`; `SNAPSHOT_FORMAT = 2` (cambia la versione, quindi l'ETag: i telefoni riscaricano). Nella collezione Postman, test "ogni alimento ha la sua fonte".
- [ ] **Passo 5:** `uv run ruff check .; uv run ruff format --check .; uv run mypy; uv run pytest --cov`. Atteso: verde.
- [ ] **Passo 6:** commit `feat(api): say where each food in the catalog snapshot comes from`.

### Task 2: dati sul telefono — fonte, varianti e chiave di ricerca

**Files:**
- Modify: `apps/mobile/src/data/schema.ts` (migrazione v2), `apps/mobile/src/data/catalogStore.ts`, `apps/mobile/src/data/testing/snapshot.ts`, `apps/mobile/src/domain/search.ts`, `apps/mobile/src/domain/food.ts`
- Test: `apps/mobile/src/data/schema.test.ts`, `apps/mobile/src/data/catalogStore.test.ts`, `apps/mobile/src/data/catalogQueries.test.ts`, `apps/mobile/src/domain/search.test.ts`

**Interfaces:**
- Produces:
  - `type FoodSource = 'ciqual' | 'usda' | 'open_food_facts' | 'label' | 'manual' | 'recipe'` in `src/domain/food.ts`.
  - Migrazione v2: `ALTER TABLE food ADD COLUMN source TEXT CONSTRAINT food_source_valid CHECK (source IN (...))`, nullable (catalogo del formato 1); `SCHEMA_VERSION = 2`.
  - `replaceCatalog` salva `source` (NULL se lo snapshot non lo porta).
  - `FoodDetail.source: FoodSource | null`.
  - `getVariant(db: SqlDatabase, food: { name: string; state: FoodState }, state: 'raw' | 'cooked'): Promise<string | null>`: id dell'alimento condiviso con lo stesso nome e l'altro stato.
  - `searchKey`: oltre agli accenti, `’ ‘ ʼ` → `'`, `œ` → `oe`, `æ` → `ae`, `ß` → `ss`, `ø` → `o`; i segni combinanti scritti `/[̀-ͯ]/g` con le sequenze di escape, non con i caratteri.
  - `searchFoods` divide la chiave con `searchWords`.
  - `TEST_FOODS` con `source: 'ciqual'`.

- [ ] **Passo 1: test che falliscono.**
  - `schema.test.ts`: `SCHEMA_VERSION` 2; `migra un database della versione 1 senza perdere il catalogo` (crea v1 con le sole istruzioni della migrazione 0 e un alimento, poi `initDatabase`: l'alimento c'è con `source` NULL); `rifiuta una fonte sconosciuta` (messaggio con `food_source_valid`).
  - `catalogStore.test.ts`: `salva la fonte di ogni alimento`; `uno snapshot senza fonte lascia la fonte vuota` (punto 5).
  - `catalogQueries.test.ts`: `la scheda dice da dove vengono i valori` (`getFood(...).source` = `ciqual`); `trova la variante cotta e quella cruda` (`getVariant` albume crudo → `albume-cotto` e viceversa); `senza variante non c'è niente da cambiare` (caffè → `null`); `l'apostrofo tipografico trova l'albume` (punto 1: `searchFoods(db, 'albume d’uovo')` dà i due albumi).
  - `search.test.ts`: `searchKey('d’uovo')` → `d'uovo`; `searchKey('Œuf')` → `oeuf`; `searchKey('Straße')` → `strasse`.
- [ ] **Passo 2:** `npx vitest run src/data src/domain/search.test.ts`. Atteso: FAIL sui test nuovi.
- [ ] **Passo 3:** implementa migrazione, `source`, `getVariant`, `searchKey`, `searchWords` in `searchFoods`; correggi il commento "Circa 90 000 valori" (sono circa 69 000).
- [ ] **Passo 4:** stesso comando, poi `npm run typecheck; npm run lint; npm run test:coverage`. Atteso: verde.
- [ ] **Passo 5:** commit `feat(mobile): keep each food's source and its raw or cooked variant on the phone`.

### Task 3: testi della ricerca e delle fonti

**Files:**
- Create: `apps/mobile/src/domain/sources.ts`, `apps/mobile/src/domain/searchStatus.ts`
- Test: `apps/mobile/src/domain/sources.test.ts`, `apps/mobile/src/domain/searchStatus.test.ts`

**Interfaces:**
- Produces:
  - `sourceLabel(source: FoodSource | null): string | null`: `ciqual` → `CIQUAL 2025 (Anses)`, `usda` → `USDA FoodData Central`, `open_food_facts` → `Open Food Facts`, `label` → `Etichetta`, `manual` → `Inserito a mano`, `recipe` → `Ricetta`; `null` → `null`.
  - `CIQUAL_ATTRIBUTION: string` = `Anses. 2025. Table de composition nutritionnelle des aliments Ciqual. Licence Ouverte / Etalab 2.0. Nomi tradotti in italiano da Tara.`
  - `searchStatus(query: string, resultCount: number, catalogSize: number): { kind: 'hint' | 'empty-catalog' | 'no-results' | 'results'; message: string | null }`, in quest'ordine: catalogo vuoto → `Gli alimenti si scaricano al primo avvio con la connessione: riprova tra poco.`; ricerca sotto i 2 caratteri dopo `searchKey` → `Scrivi almeno due lettere, per esempio «albume».`; nessun risultato → `Nessun alimento per «<ricerca ripulita>».`; altrimenti `results` senza messaggio.

- [ ] **Passo 1: test che falliscono** per ogni riga sopra (punto 2: con catalogo vuoto e una ricerca valida il tipo è `empty-catalog`, non `no-results`).
- [ ] **Passo 2:** `npx vitest run src/domain/sources.test.ts src/domain/searchStatus.test.ts`. Atteso: FAIL.
- [ ] **Passo 3:** implementa.
- [ ] **Passo 4:** stesso comando e `npm run test:coverage`. Atteso: verde.
- [ ] **Passo 5:** commit `feat(mobile): add search and data source wording`.

### Task 4: componenti — campo di ricerca, barra e foglio in modalità calcolo

**Files:**
- Create: `apps/mobile/src/components/SearchField.tsx`
- Modify: `apps/mobile/src/components/SearchDock.tsx` (`onScan` facoltativo: senza, niente pulsante scanner), `apps/mobile/src/components/GramSheet.tsx`, `apps/mobile/src/app/design.tsx`, `apps/mobile/.maestro/design.yaml`

**Interfaces:**
- Produces:
  - `SearchField({ value, onChangeText, autoFocus? })`: `TextInput` con icona di ricerca e tasto "Cancella" (≥ 44), segnaposto `Cerca un alimento`, `returnKeyType="search"`, colori dai token, `accessibilityLabel="Cerca un alimento"`.
  - `GramSheet` props: `mealName?: string` (senza: niente pastiglia del pasto, e la scorciatoia dice `Ultima quantità: 500 g`); `confirmVerb?: string` (default `Aggiungi`: il pulsante principale dice `<verbo> 500 g`); `onConfirm(grams)` al posto di `onAdd`; `onConfirmAndContinue?(grams)` al posto di `onAddAndContinue`, e senza di lui il pulsante secondario non c'è; il selettore crudo/cotto compare solo se c'è `onChangeState` (punto 3).
- Il catalogo dei componenti (`design.tsx`) usa le nuove props come oggi (pasto "Cena", Aggiungi e continua): `design.yaml` resta verde senza cambiare le asserzioni, più una sezione con il foglio in modalità calcolo ("Usa 200 g", nessun "Aggiungi e continua").

- [ ] **Passo 1:** implementa i tre componenti e aggiorna `design.tsx` con un secondo pulsante "Foglio solo calcolo".
- [ ] **Passo 2:** `npm run typecheck; npm run lint`. Atteso: verde.
- [ ] **Passo 3:** in `design.yaml` aggiungi: apre il foglio solo calcolo, digita 2, 0, 0, vede `Usa 200 g` e non vede `Aggiungi e continua`. Si esegue nel Task 5 con l'app.
- [ ] **Passo 4:** commit `feat(mobile): add the search field and a calculate-only gram sheet`.

### Task 5: schermate — barra sopra le tab, ricerca, scheda e fonti

**Files:**
- Create: `apps/mobile/src/app/cerca.tsx`, `apps/mobile/src/app/alimento/[id].tsx`, `apps/mobile/.maestro/ricerca.yaml`
- Modify: `apps/mobile/src/app/(tabs)/_layout.tsx` (`tabBar`: `SearchDock` sopra `BottomTabBar`), `apps/mobile/src/app/_layout.tsx` (schermate `cerca` e `alimento/[id]`), `apps/mobile/src/app/profilo.tsx` (sezione "Fonti dei dati" sempre visibile), `apps/mobile/CLAUDE.md`, `docs/handoff.md`, `docs/design.md` (sezione Implementazione: step 7 e foglio solo calcolo in F0)

**Interfaces:**
- Consumes: `searchFoods`, `getFood`, `getVariant`, `useCatalog` (`info.foodCount`), `searchStatus`, `sourceLabel`, `CIQUAL_ATTRIBUTION`, `SearchField`, `ResultRow`, `NutritionLabel`, `GramSheet`.
- Comportamento:
  - **Barra**: in tutte le tab, sopra le tab; tocco → `/cerca`.
  - **Ricerca** (`/cerca`, titolo "Cerca un alimento"): campo in alto con la tastiera aperta; a ogni carattere `searchFoods` sul database del telefono; un contatore di richiesta scarta i risultati vecchi (punto 4); elenco di `ResultRow` (kcal e proteine per 100 g, "cotto" se serve) con `keyboardShouldPersistTaps="handled"`; sotto, il messaggio di `searchStatus`. Tocco → `/alimento/<id>`.
  - **Scheda** (`/alimento/[id]`, intestazione nativa nascosta perché il foglio la copra; barra in alto con "Indietro" ≥ 44): nome, "cotto" se serve, quantità attiva ("per 100 g" o "per 200 g", con "Torna a 100 g" quando diversa), `NutritionLabel` con quei grammi, riga `Fonte: CIQUAL 2025 (Anses)` se nota, pulsante principale `Calcola per i tuoi grammi`. Il foglio parte dall'ultima quantità usata nella scheda, senza pasto, con `confirmVerb="Usa"`, senza "Aggiungi e continua"; `onChangeState` solo se `getVariant` trova l'altra variante, e cambia alimento tenendo il foglio aperto. Alimento inesistente: `Alimento non trovato` e "Torna alla ricerca".
  - **Profilo**: sezione "Fonti dei dati" con `CIQUAL_ATTRIBUTION` (fuori da `__DEV__`).
- Flusso `ricerca.yaml` (tag `api`: serve il primo download): avvio, tocco "Cerca un alimento", digita `albume`, attende `Albume d'uovo` (due risultati, il secondo con `cotto`), tocca il primo, vede `per 100 g`, `Proteine` con `10,9 g` e `Fonte: CIQUAL 2025 (Anses)`; `Calcola per i tuoi grammi`, digita 2, 0, 0, `Usa 200 g`, vede `per 200 g` e `21,8 g`; indietro, cancella, digita `baba` e vede `Babà al rum`.

- [ ] **Passo 1:** implementa le schermate e il profilo.
- [ ] **Passo 2:** `npm run typecheck; npm run lint; npm run test:coverage; npm run doctor`. Atteso: verde.
- [ ] **Passo 3: verifica sull'emulatore.** Backend con il catalogo (Task 1 incluso), Metro, `npm run e2e:dev`. Atteso: 4 flussi su 4. Poi a mano:
  - screenshot di ricerca, scheda e foglio in tema scuro e chiaro;
  - testo al 130%;
  - lettore dello schermo: le etichette di campo e righe;
  - con l'API spenta e il catalogo già scaricato, ricerca e scheda funzionano (anticipo del gate);
  - tempo della ricerca: `searchFoods` sul database copiato dal telefono con `node:sqlite` per `albume`, `pollo petto`, `a b`, sotto 200 ms (RNF-02).
- [ ] **Passo 4: documentazione.** `docs/handoff.md` passo 7 fatto e passo 8 (gate) come prossimo; `docs/design.md` sezione Implementazione; `apps/mobile/CLAUDE.md` se cambia qualcosa per chi lavora sull'app.
- [ ] **Passo 5:** commit `feat(mobile): search the catalog and calculate grams from the food card`, poi `docs: …` se separato; push e PR.
