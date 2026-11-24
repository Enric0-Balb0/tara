# F1, passi 9 e 6b: pasti configurabili, porzioni, rifiniture, barcode e immagine della giornata

**Spec:** `docs/requisiti.md` (RF-40, RF-02, RF-41, RF-59, RF-10, RF-11, RF-12, RF-47, RNF-02), principi in `CLAUDE.md`, stile in `docs/design.md`. Stato e rimandati in `docs/handoff.md`, "Riprendere il lavoro" (passo 9, "Rimandati dal peso").

**Obiettivo:** chiudere l'MVP della F1 lato interfaccia. Prima i lavori solo JavaScript (Task 1–3), poi il proxy di Open Food Facts nel backend (Task 4), poi le due funzioni con moduli nativi (Task 5–6) verificate con un'unica development build locale.

## Global Constraints

Valgono per ogni task.

- **Principi e dati:** come nel piano precedente (`docs/superpowers/plans/2026-11-21-f1-ricette-pasti-acqua-peso.md`, "Global Constraints"): valori solo da fonti tabellari o calcoli deterministici; dato mancante ≠ zero; nessuna scrittura nel diario senza conferma; snapshot nel diario; `user_id`, UUIDv7, `created_at`/`updated_at`/`deleted_at`, tabelle `STRICT`, vincoli con nome e test che li nominano, migrazioni solo in coda a `MIGRATIONS` (versione attuale 12), `withTransactionAsync` per scritture multiple.
- **Test e comandi:** TDD con vitest (`openTestDatabase()` per gli store); da `apps/mobile` `npm run typecheck`, `npm run lint`, `npm run test:coverage`; prettier `--single-quote --print-width 100`. Backend da `services/api`: `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy`, `uv run pytest --cov` (Postgres del docker-compose su 55432).
- **Interfaccia:** solo componenti e token esistenti, testi italiani, numeri con `formatNumber`/`formatAmount` (niente `Intl`/`toLocale*`), tocchi ≥ 44×44, etichette accessibili italiane, guardie contro il doppio tocco su ogni scrittura. Schermate con campi in basso: `KeyboardAvoidingView behavior="padding"` con intestazione propria (o offset misurato come nel Piano).
- **Dipendenze:** solo con `npx expo install` (app) o `uv add` (backend); i moduli nativi solo nei Task 5 e 6.
- **Flussi Maestro:** ogni task con interfaccia aggiunge o aggiorna un flusso in `apps/mobile/.maestro/`; tocchi per testID o etichetta accessibile, mai su testo presente anche in un campo; in Oggi usare `subflows/tocca.yaml`/`subflows/vedi.yaml` (ELEMENTO) per ciò che può stare sotto il bordo. **Non eseguire Maestro né l'emulatore**: li esegue il controller.
- **Modifiche:** sostituzioni puntuali su porzioni esatte appena lette (niente riscritture con regex di file lunghi).
- **Git:** Conventional Commits in inglese, scope `mobile`/`api`/`docs`, nessun trailer o riferimento AI; niente push, PR o cambi di branch.
- **Documenti:** una scelta che restringe un requisito va in `docs/requisiti.md` nello stesso commit; scelte visive in `docs/design.md`; avanzamento in `docs/handoff.md`.

---

## Task 1: Pasti configurabili

**Requisiti:** RF-40 ("numero e nomi degli slot configurabili").

Oggi `meal_slot` ha `name`, `position`, `expected_time`, `deleted_at`; `ensureMealSlots` crea i cinque predefiniti. Nessuna migrazione serve.

- **Store** (`src/data/diaryStore.ts` o un nuovo `src/data/mealSlotsStore.ts`): `addMealSlot(db, userId, name, expectedTime | null, now)` (in coda), `renameMealSlot`, `setMealSlotTime` ("HH:MM" o null), `moveMealSlot(db, userId, id, direction: 'up' | 'down', now)` (scambia le posizioni con il vicino, atomico), `deleteMealSlot(db, userId, id, now)` che **rifiuta** (errore chiaro, nessuna scrittura) un pasto con voci di diario o voci di piano non eliminate, e l'ultimo pasto rimasto. Verifica dell'utente ovunque. Test per ognuna, compresi i rifiuti.
- **Interfaccia:** nel Profilo una riga "Pasti della giornata" che apre `src/app/pasti.tsx` (intestazione propria): elenco dei pasti con nome modificabile, orario facoltativo (campo "HH:MM", usato per proporre il pasto in base all'ora), frecce su/giù, elimina con conferma (e messaggio se rifiutato: "Il pasto ha voci nel diario o nel piano: non si può eliminare"), "Aggiungi un pasto". Oggi, Piano, scheda alimento e ricerca riflettono subito i cambiamenti (rileggono al focus).
- **Flusso Maestro `pasti-giornata.yaml`:** Profilo → Pasti della giornata → rinomina "Merenda" in "Pre-workout" → aggiungi "Post-workout" → sposta in su → in Oggi compaiono "Pre-workout" e "Post-workout" nell'ordine giusto.
- `docs/handoff.md` (passo 9: pasti configurabili).

## Task 2: Porzione dichiarata e scorciatoie per gli alimenti a pezzo

**Requisiti:** RF-02 (porzione dichiarata), RF-41 (porzioni come scorciatoia per alimenti a pezzo).

- **Migrazione (versione 14; la 13 è l'archiviazione dei pasti del Task 1):** `ALTER TABLE food ADD COLUMN serving_g REAL CONSTRAINT food_serving_positive CHECK (serving_g IS NULL OR serving_g > 0)` e `ADD COLUMN serving_name TEXT CONSTRAINT food_serving_name_needs_grams CHECK (serving_name IS NULL OR serving_g IS NOT NULL)` (es. "vasetto", "uovo", "fetta"): i grammi senza nome sono ammessi (la scorciatoia dice "porzione"), il nome senza grammi no. Test che nominano i vincoli.
- **Store:** `createFood`/`updateFood` (`src/data/foodsStore.ts`) salvano porzione e nome; `getFood` li restituisce (`FoodDetail.serving`).
- **Form** `src/app/nuovo-alimento.tsx`: sezione "Porzione (facoltativa)" con "Nome" (es. "vasetto") e "Grammi" (o ml secondo l'unità), validazione (> 0, nome senza grammi non valido).
- **Foglio dei grammi:** per un alimento con porzione la scheda passa a `GramSheet` le scorciatoie "1 vasetto · 150 g" e "2 vasetti · 300 g" (etichetta accessibile in "grammi"/"millilitri"); plurale italiano con un helper puro testato: si pluralizza solo la prima parola ("fetta di pane"→"fette di pane"); una piccola tabella di irregolari ("uovo"→"uova", "paio"→"paia") e le regole regolari (-o→-i, -a→-e, -e→-i, -io atono→-i: "cucchiaio"→"cucchiai"); parole che finiscono in consonante o accento restano invariate ("yogurt", "caffè"); senza nome la scorciatoia è "1 porzione · 150 g" / "2 porzioni · 300 g". Le ricette a porzioni restano come sono.
- **Flusso Maestro:** estendi `alimenti-personali.yaml` (porzione "vasetto" 170 g sullo skyr → nella scheda "1 vasetto · 170 g" registra 170 g).
- `docs/requisiti.md`: annota che categoria (RF-05) e generico di riferimento (RF-17) restano da fare.

## Task 3: Rifiniture (peso, grafico, scrim, acqua)

**Requisiti:** i rimandati del passo 9 in `docs/handoff.md`.

- **Pesata per un giorno passato:** in Andamento "Aggiungi una pesata" apre il foglio del peso con la scelta del giorno (oggi e i 13 giorni prima, selettore semplice a frecce "Giorno precedente/successivo"; nessun giorno futuro); `setWeight` sostituisce la pesata di quel giorno. Media, variazione e g/kg sono calcolati alla lettura, quindi si aggiornano da soli (verificalo con un test: una pesata aggiunta ieri cambia la media di oggi).
- **Grafico del peso:** la linea della media si spezza dove gli indici della media saltano (vuoti oltre 7 giorni); sotto il grafico i riferimenti "30 giorni fa" e "oggi".
- **Token scrim:** un token di colore `scrim` (tema chiaro e scuro, in `src/theme/colors.ts` con il test) usato da tutti i fogli al posto di `'black'` (GramSheet, WeightSheet, SavedMealSheet, dialogo "Salva come pasto").
- **Riga dell'acqua compatta:** a 360–412 dp una sola riga con "Acqua 1 di 3 l" a sinistra e i pulsanti a destra; la barra come sottolineatura sottile sotto la riga; "Annulla +500" resta un pulsante, ma con target e annulla la scheda non supera due righe a 412 dp. Il controller lo verifica con lo screenshot del flusso `acqua.yaml`.
- **Flussi Maestro:** aggiorna `acqua.yaml` e `peso.yaml` se cambiano testi; aggiungi a `peso.yaml` una pesata di ieri.
- `docs/design.md` (scrim, riga acqua) e `docs/handoff.md` (rimandati chiusi).

## Task 3b: Colori dei macro

**Requisiti:** RF-59 (priorità C: se il tempo stringe si rimanda, con una riga nel handoff).

- Tutti i colori dei macro passano già da `useTheme()` (`colors.protein`, `carbs`, `fat`, `fiber`): la scelta dell'utente si applica lì, in un unico punto (provider o hook che legge `user_setting`), senza toccare i componenti uno per uno; verifica con una ricerca che nessun componente usi il colore del macro scritto a mano.
- **Colori dei macro (RF-59):** nel Profilo "Colori dei macro": per proteine, carboidrati, grassi e fibre una tavolozza di 6–8 colori (più il predefinito) per ciascuno; il colore scelto si applica a tutta l'app (testo, barre, righello), per tema chiaro e scuro; se un colore ha contrasto < 4,5:1 sullo sfondo del tema, si corregge automaticamente scurendo/schiarendo (usa `src/domain/contrast.ts`) e lo si dice ("corretto per la leggibilità"). Preferenza in `user_setting` (chiave `macro_colors`, JSON). Test della correzione del contrasto.
- **Flusso Maestro:** nuovo `colori.yaml` (Profilo → Colori dei macro → scegli un colore per le proteine → torna e riapri: la scelta resta selezionata).
- `docs/design.md` (colori personalizzati) e `docs/handoff.md`.

## Task 4: Proxy di Open Food Facts nel backend

**Requisiti:** RF-10 (catena: catalogo personale → Open Food Facts → …), RF-11, RNF-02 (barcode → form < 1 s quando già noto).

- **Endpoint** `GET /v1/products/{barcode}` in `services/api/src/tara_api/` (nuovo modulo `products.py`, router incluso in `main.py`), **con autenticazione** come gli altri endpoint personali (vedi `auth.py`, `users.py`). Il barcode è validato (8–14 cifre, altrimenti 422).
- Chiama l'API v2 di Open Food Facts (`https://world.openfoodfacts.org/api/v2/product/{barcode}.json` con i campi utili e lo user agent `off_user_agent` di `config.py`), con `httpx2` già nelle dipendenze, timeout breve (es. 4 s) e una cache in memoria con scadenza: 24 h per i prodotti trovati, 1 h per i non trovati (cache negativa). Lo user agent resta quello di configurazione (`off_user_agent`, sostituibile da variabile d'ambiente); niente email nel codice: un contatto lo aggiunge Enrico via variabile se Open Food Facts lo chiede.
- Barcode: normalizza un UPC-A di 12 cifre nell'EAN-13 con lo zero davanti (stesso prodotto); la risposta riporta il barcode normalizzato.
- Risposta: `{ barcode, name, brand, base_unit ('ml' solo se `product_quantity_unit` è "ml" o `quantity` finisce con "ml", "cl" o "l"; altrimenti 'g'), serving_g (se presente, da `serving_quantity` con unità g/ml), values: { code: amount } per 100 g/ml }` solo per i nutrienti presenti (energia kcal e kJ, grassi, saturi, carboidrati, zuccheri, fibre, proteine, sale, sodio), con `provenance = 'open_food_facts'`, e `missing_macros: string[]` per kcal/proteine/carboidrati/grassi assenti (RF-12). Mai inventare un valore: un campo assente manca. Nome italiano se c'è (`product_name_it`), altrimenti `product_name`.
- Errori: prodotto inesistente → 404; Open Food Facts non raggiungibile o lento → 503 con messaggio; nessun 500.
- **Test** con le risposte di Open Food Facts simulate (fixture JSON nel repository, nessuna chiamata di rete nei test): mappatura dei campi, valori mancanti assenti, sale/sodio, unità ml, 404, timeout → 503, cache, autenticazione richiesta, barcode non valido. Aggiorna la collezione in `services/api/postman/` se esiste per gli altri endpoint.
- Documenta l'endpoint in `docs/requisiti.md` (sezione API) se c'è un elenco degli endpoint.

## Task 5: Scansione del barcode nell'app

**Requisiti:** RF-10 (senza la foto dell'etichetta, che arriva con l'AI), RF-11, RF-12, RF-02 (barcode), RNF-02.

- **Migrazione (versione 15):** `ALTER TABLE food ADD COLUMN barcode TEXT` con indice unico parziale `food_barcode_once` su `(user_id, barcode)` per gli alimenti personali non eliminati e con barcode; test che nomina l'indice. Il barcode si salva normalizzato come nel backend (UPC-A di 12 cifre → EAN-13 con lo zero davanti), e la ricerca nel catalogo personale usa la stessa normalizzazione.
- **Rete:** il backend su Render Free può impiegare ~50 s a svegliarsi: la chiamata dall'app mostra "Cerco il prodotto…" con un timeout di 20 s e poi il form vuoto con il barcode e il messaggio "Open Food Facts non risponde: inserisci i valori dall'etichetta". Serve la sessione (endpoint autenticato), come gli altri.
- **Provenienze nel form:** `nuovo-alimento.tsx` tiene traccia, per campo, se il valore viene da Open Food Facts e non è stato toccato (provenienza `open_food_facts`) o è stato scritto/corretto (provenienza `manual`); i valori ricavati restano `estimated`. `createFood` accetta la provenienza per codice. Una porzione da Open Food Facts senza nome si salva senza nome (la scorciatoia dice "porzione").
- **Dipendenza nativa:** `npx expo install expo-camera` (con il plugin in `app.json` e il testo del permesso in italiano: "Tara usa la fotocamera per leggere i codici a barre").
- **Scanner** `src/app/scansiona.tsx`: fotocamera a tutto schermo con mirino, lettura EAN-13/EAN-8/UPC-A/UPC-E, una sola lettura per volta, vibrazione leggera alla lettura, permesso negato → messaggio con "Apri le impostazioni" e "Inserisci il codice a mano" (campo numerico). Accessibile dalla barra di ricerca (icona `scan` già esistente in `Icon`) e da "Aggiungi il codice a barre" nel form del nuovo alimento.
- **Catena (RF-10):** 1) alimento personale con quel barcode → si apre la sua scheda (in < 1 s, nessuna rete); 2) altrimenti `GET /v1/products/{barcode}` → form "Nuovo alimento" precompilato (nome, marca, unità, porzione, valori) con la provenienza `open_food_facts` sui valori non toccati e `manual` su quelli corretti dall'utente (RF-11), barcode salvato; 3) se mancano kcal/proteine/carboidrati/grassi (RF-12) il form si apre con quei campi evidenziati e il messaggio "Open Food Facts non ha tutti i valori: copiali dall'etichetta" (la foto dell'etichetta arriverà con l'AI); 4) prodotto non trovato o rete assente → form vuoto con il barcode già scritto e il messaggio adatto.
- Dal form, "Aggiungi il codice a barre" collega un barcode a un alimento esistente o nuovo (rifiuta un barcode già usato da un altro alimento dell'utente, con messaggio).
- La logica (catena, mappatura della risposta nei campi del form, provenienze) sta in moduli puri/store testati; lo scanner è sottile.
- **Flusso Maestro `barcode.yaml`:** senza fotocamera (emulatore): "Inserisci il codice a mano" con un barcode di test noto di Open Food Facts (scegline uno stabile, es. un prodotto italiano molto diffuso, e documentalo nel flusso) → form precompilato → salva → la scheda si apre; seconda lettura dello stesso codice → apre direttamente la scheda. Il controller lo esegue dopo la development build.
- `docs/handoff.md` (6b fatto; resta la foto dell'etichetta con l'AI) e `docs/design.md` (scanner).

## Task 6: Immagine della giornata da condividere

**Requisiti:** RF-47.

- **Dipendenze native:** `npx expo install react-native-view-shot expo-sharing`.
- **Componente** `src/components/DayImage.tsx`: una "etichetta della giornata" in stile `NutritionLabel` (carta bianca, inchiostro nero, larghezza fissa per l'immagine): data, tipo di giornata, totali contro il target/piano (kcal e macro con "≥" se incompleti), pasti con voci e grammi, acqua se c'è, attribuzione delle fonti presenti (CIQUAL con la citazione di `CIQUAL_ATTRIBUTION`, Open Food Facts "© Open Food Facts contributors, ODbL" se un valore viene da lì, "Inserito a mano"). La costruzione del contenuto (righe, totali, fonti) in un modulo puro testato. Le fonti si ricavano dalla provenienza salvata nello snapshot di ogni valore (`reference` → CIQUAL, `open_food_facts`, `manual`/`label` → "Inserito a mano", `estimated` → "Calcolato da ricette"). Totali incompleti con "≥" come in Oggi. Nell'immagine nessun dato personale (niente email o nome utente).
- **Oggi:** azione "Condividi la giornata" (nell'intestazione o in fondo) che rende il componente in una vista montata ma nascosta (`collapsable={false}`, fuori dall'area visibile, caratteri già caricati), cattura un PNG con `react-native-view-shot` e apre il foglio di condivisione di sistema; disabilitata su un giorno vuoto.
- **Flusso Maestro:** in `diario.yaml` o nuovo `condividi.yaml`, tocca "Condividi la giornata" e verifica che compaia il foglio di sistema (poi `back`).
- `docs/design.md` (immagine della giornata), `docs/handoff.md` (passo 9 chiuso salvo build e gate).
