# Handoff: dalla progettazione allo sviluppo

Questo file riassume la conversazione di progettazione del 22 ottobre 2026 (claude.ai) da cui nasce il repository, così che una nuova sessione di Claude Code possa ripartire senza perdere contesto.

## Riprendere il lavoro (aggiornato all'08/11/2026)

- **Fase:** F0, passo 8 (backend online), seconda metà. Dettagli e passi esatti in "Prossimi passi", punto 8.
- **Branch:** `feat/rnf-14-deploy`, partito da `main` (`64a9f99`, PR #32). La seconda PR del passo 8 è scritta qui: deploy verificato in `cd.yml`, `keepalive.yml`, URL nei profili EAS con il test, ambiente Postman di Render, documenti. PR #33, in bozza. Servizio: `https://tara-api-eu.onrender.com`.
- **Stato dell'08/11 sera:** il backend online funziona. `/ready` risponde `ok` e Newman passa sull'URL di Render (9 richieste, 22 controlli). Backend e migrazioni usano il ruolo `tara` (vedi "Supabase" al punto 8).
- **In attesa di Enrico:**
  - cancellare il servizio `tara-api` in Oregon (`srv-dbnho4s9v7es73cq9oc0`), oggi solo sospeso: il controllo dei permessi blocca la cancellazione fatta da Claude;
  - revocare l'access token Supabase usato per il ruolo `tara`, quando non serve più;
  - aprire un ticket al supporto di Supabase: il reset della password dal pannello non arriva al ruolo `postgres` (dettagli al punto 8).
- **Poi:**
  - la CI della PR #33 è rossa solo per `expo-doctor` (patch di Expo, issue #24): prima una PR con `npx expo install --fix`, poi rebase della #33, merge con CI verde e controllo del primo run del CD;
  - passo 9 (gate F0): Enrico rivede i nomi della sua dieta e dà l'ok per una build preview EAS, chiedendo prima di usare la quota.
- **Note pratiche su questa macchina:**
  - Dopo un riavvio Docker Desktop è spento: `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`, poi `docker compose -f infra/docker-compose.yml up -d`. Senza, i test del backend falliscono alla connessione.
  - Le azioni che creano, cancellano o pagano qualcosa nei pannelli di Render, Supabase e GitHub le fa Enrico, salvo autorizzazione esplicita. L'08/11, con l'autorizzazione, Claude ha creato un servizio Render dal Chrome "Browser 2", dove Enrico ha la sessione di Render; il controllo dei permessi ha comunque bloccato la cancellazione, che resta a Enrico. Le letture sono possibili: MCP di Supabase per SQL, log e advisor; `gh` per PR, run e nomi dei segreti.
  - Gli agenti in background dei workflow si sono bloccati per ore sulle ricerche (ricognizione del 01/11). Per lavori brevi conviene procedere direttamente.

## Da dove nasce

Enrico è un AI engineer e un appassionato di bodybuilding. Usa la versione gratuita di FatSecret e la trova limitante: contatore acqua, scanner di etichette, pasti personalizzati e altre funzioni utili sono a pagamento. Vuole un'app sua, in italiano, che copra le esigenze di un bodybuilder e usi l'AI per togliere lavoro ricorrente. All'inizio la usa solo lui; se funziona, la installeranno anche alcuni amici, e servirà un'infrastruttura web.

## Cosa ha chiesto, in ordine

1. **Brainstorming e piano incrementale**, con priorità ai requisiti più importanti. Idee AI iniziali: stima dei macro da foto o video per i pasti fuori casa, comandi vocali che si riferiscono ai pasti salvati, avvisi di carenze di micronutrienti, stima dei micronutrienti che l'etichetta non riporta (es. il potassio di un albume).
2. **L'AI è un plus.** Serve come stima solo quando non c'è la tabella nutrizionale. Il flusso base per un alimento nuovo è la lettura dell'etichetta con la fotocamera (macro, nome, categoria, con campi correggibili a mano) oppure il barcode se le informazioni sono pubbliche. Deve poter salvare ricette, es. "pancake1" con albume, avena ecc.
3. **L'utente target pesa tutto.** Un bodybuilder conosce le grammature degli alimenti della sua dieta: il logging va ottimizzato per i grammi.
4. **Distinzione per marca** quando serve.
5. **Funzioni da bodybuilder**: monitoraggio del peso, target calorico, cardio, NEAT, giorni ON e OFF, acqua con target, notifiche per gli integratori dello stack, "e tutto quello che può tornare utile a un bodybuilder".
6. **Scelte architetturali**: nome originale scelto da Claude; usa Android con Google Fit ma vuole poter supportare Apple; lingua italiana con dati che arrivano in inglese, quindi attenzione al layer di traduzione; peso a crudo di default.
7. Creare lo scheletro del progetto, primo commit, e continuare lo sviluppo da Claude Code con Remote Control.

## Decisioni prese

| Tema | Decisione | Perché |
| --- | --- | --- |
| Nome | **Tara** | Il tasto della bilancia, il gesto prima di ogni pesata; richiama il peso a crudo. Esiste un'app di pilates "CORE Tara": verificare gli store prima di pubblicare. |
| Ruolo dell'AI | Trascrive, riconosce, stima quantità; i valori arrivano dal database | Gli studi su LLM e foto di cibo mostrano errori del 40% circa su peso ed energia e oltre il 60% sulle proteine. Separare "cosa c'è nel piatto" dal calcolo nutrizionale migliora l'affidabilità. |
| Micronutrienti mancanti | Ereditati dall'alimento generico collegato (`parent_food_id`), con verifica di coerenza sui macro e metrica di copertura | Esempio guida: l'albume in brick ha solo i macro in etichetta; potassio e sodio arrivano da "albume d'uovo crudo". |
| Client | Expo + TypeScript | Health Connect (Android) e HealthKit (iOS) con librerie mature, OTA con EAS Update. Una PWA non legge i dati salute. |
| Google Fit | Non si integra direttamente: si legge Health Connect | Le API di Google Fit sono supportate fino a fine 2026; Google Fit scrive in Health Connect. |
| Dati sul telefono | Local-first con SQLite e coda di sync | Ricerca istantanea, uso offline sui mezzi. |
| Backend | FastAPI + Postgres/pgvector; chiavi AI solo lato server | Stesso linguaggio di pipeline ed eval. |
| Traduzione | Una volta, nella pipeline, come dato versionato; glossario + validatori deterministici | Vedi `docs/requisiti.md`, sezione "Layer di traduzione". |
| Catalogo | CIQUAL 2025 al posto di CIQUAL 2020 + CALNUT; proteine ed energia come in etichetta (N × 6,25); tracce e "< x" = 0 con confidenza ridotta | Versione più recente (19/11/2025); generici e prodotti di marca confrontabili; un valore trascurabile non è un valore mancante. |
| Notifiche | Locali, programmate dall'app | Funzionano offline, nessun server di push. |
| MVP | Fase F1, senza AI oltre alla lettura etichette; gate: due settimane senza FatSecret | Se il logging base non è più veloce di FatSecret, l'AI non lo salva. |

## Casi d'uso reali da tenere presenti

- Carb cycling: tipi di giornata con target diversi (OFF, ON per sessione Upper/Lower, giorno High), con proteine costanti.
- Sale arricchito di potassio pesato in bustine: va registrato come alimento con i suoi micronutrienti, altrimenti sodio e potassio risultano sbagliati.
- Meal prep nei giorni di riposo, con 5–6 pasti pronti portati al lavoro: ricette in teglia con peso da cotto, pasti salvati, copia della giornata.
- Integratori assunti a orari diversi e solo in certi giorni (es. solo nei giorni di allenamento, o esclusi in un tipo di sessione): servono regole sui tipi di giornata.
- Fasi della dieta (cut, reverse, bulk) con tasso settimanale e aggiustamento del target dal trend del peso.

## Stato del repository

Scheletro più processo di sviluppo completo; ancora nessuna funzione di prodotto.

- `apps/mobile`: Expo SDK 58 con Expo Router e quattro tab segnaposto (Oggi, Alimenti, Progressi, Profilo). `src/domain/nutrition.ts` contiene il controllo kcal 4/4/9/2 (RF-15) e la conversione sale → sodio (RF-16), con test Vitest. Verificati typecheck, lint, test e bundle Android.
- `services/api`: FastAPI con `/health`, configurazione da variabili `TARA_*`, test.
- `pipelines/catalog`: glossario (`data/glossario.toml`), tabella dei nutrienti in italiano (`data/nutrienti.csv`), validatore di coerenza dello stato crudo/cotto, test.
- `infra/docker-compose.yml`: Postgres 17 con pgvector; con `--profile api` anche il backend in container.
- Processo e CI/CD (`docs/processo.md`, RNF-13 e RNF-14):
  - uv con lockfile e Python 3.12 fissato; mypy `strict`; coverage minima dell'80% su backend, pipeline e `src/domain`; lint dell'app con zero warning; `expo-doctor` in CI.
  - Hook pre-commit, commit-msg e pre-push, con gitleaks, actionlint e Conventional Commits.
  - `ci.yml` con job per pacchetto, scansione dei segreti, build e smoke test dell'immagine dell'API e il controllo aggregato "CI passata"; `pr.yml` controlla il titolo della PR; `cd.yml` pubblica l'immagine su GHCR quando `main` è verde.
  - Dependabot, modelli di PR e issue.
- `docs/strumenti.md`: ricerca su plugin, skill, MCP e librerie, con l'ordine di adozione.
- Test dell'interfaccia (`docs/processo.md`): progetto EAS `@enricobalbo/tara` con `expo-dev-client` e profili `development`, `preview` e `production`; prima development build Android installata sull'emulatore `Pixel_6a`; flusso Maestro di navigazione tra le tab (`npm run e2e:dev`).

### Problemi noti dell'interfaccia

Trovati con la prima verifica sull'emulatore, da risolvere con il design system (F0, passo 5):

- Le tab non hanno icone: compare un `?` al posto del glifo, perché lo scheletro non definisce `tabBarIcon`.
- Quel `?` entra nell'etichetta di accessibilità ("?, Alimenti").
- Manca `expo-splash-screen`: il dev launcher registra `ClassNotFoundException: SplashScreenManager`. Non blocca nulla, ma va aggiunto con la prossima build nativa.

### Azioni manuali in sospeso

Non si possono fare dal repository; dettagli in `docs/processo.md`:

1. Ruleset su `main` (PR obbligatoria, controlli "CI passata" e "Titolo Conventional Commits", squash merge). Sul repository privato serve GitHub Pro (Student Developer Pack) oppure il repository pubblico.
2. ~~`gh`, plugin `expo` e `pyright-lsp`, impostazioni di merge del repository~~: fatti.
3. ~~Scegliere l'hosting~~: Supabase Free + Render Free (vedi `docs/requisiti.md`). Progetto Supabase `tara` creato (`eu-central-1`); restano l'account Render e i segreti (passo 8).

## Prossimi passi (fase F0)

1. ~~**Schema del database**~~: fatto. Tabelle del catalogo e utenti con i vincoli di dominio, migrazione Alembic con i 25 nutrienti, test di integrazione su Postgres (`services/api/migrations`, `tara_api/db`).
2. ~~**Import CIQUAL**~~: fatto con CIQUAL 2025. Download verificato (`tara_catalog.fetch`), mappatura sui 24 nutrienti di Tara che CIQUAL copre (`data/mappatura_ciqual.toml`), snapshot normalizzato con provenienza e confidenza (`tara_catalog.build` → `data/build/ciqual-2025/`). La pipeline usa ora i valori di stato del database (`raw`/`cooked`/`not_applicable`). Il caricamento nel database avviene dopo la traduzione, perché `food.name` richiede il nome italiano.
3. ~~**Traduzione**~~: fatta per tutti i 3.484 alimenti di CIQUAL; layer multi-provider con Pydantic AI, prompt `prompts/traduzione-v3.md`, controlli deterministici sulle sole contraddizioni crudo/cotto, set di valutazione di 53 alimenti, traduzione a lotti con ripresa (`python -m tara_catalog.translate eval|ciqual`). Modello: `gemini-3.1-flash-lite` (vedi `docs/valutazioni.md`). Revisione: `translate revisione` scrive `data/build/ciqual-2025/revisione.csv` per Excel (in alto gli alimenti della dieta); `translate applica` salva le correzioni in `data/revisioni.csv`, versionato, che prevale sulle traduzioni del modello. Le traduzioni sono caricate come `llm` (non riviste) finché Enrico non le rivede. `export ciqual` scrive `data/build/ciqual-2025/catalogo.jsonl`, il contratto con il caricatore del backend.
4. ~~**Caricamento del catalogo**~~: fatto; migrazione `source_code` (unico per fonte, obbligatorio per i generici condivisi) e `python -m tara_api.catalog_load`, che legge `catalogo.jsonl` e inserisce o aggiorna in una transazione; 3.484 alimenti in circa 4 secondi.
5. **API di ricerca**: fatte `GET /v1/foods/search` (sottostringa senza accenti con indice a trigrammi, ogni parola deve comparire, crudo prima del cotto; circa 3 ms sul catalogo reale), `GET /v1/foods/{id}` (scheda con provenienza e confidenza) e `GET /v1/catalog` (snapshot per l'app: 5,5 MB in JSON, 382 KB compresso, ETag per non riscaricarlo). Prove a mano: Swagger su `/docs` e la collezione Postman in `services/api/postman/`. L'autenticazione arriva dopo il gate (passo 10).
6. ~~**Design system**~~: fatto. Stile "Bilancia" con i colori dei dischi e l'etichetta (`docs/design.md`); token in `apps/mobile/src/theme`, logica in `src/domain`, componenti in `src/components`, tab Oggi, Piano, Dispensa, Andamento; catalogo dei componenti solo in sviluppo (`tara://design`, flusso Maestro `design.yaml`). La development build si fa con EAS: in locale su Windows Reanimated supera il limite dei percorsi di CMake. Da riprendere: il foglio dei grammi è un overlay della schermata (l'intestazione resta visibile): quando lo userà la scheda alimento, valutare un modal di Expo Router a tutta finestra; caratteri da incorporare in build con il plugin `expo-font` invece di `useFonts`; i minori rimandati dalla revisione finale (lettore dello schermo che legge "g" e "–", separatore delle migliaia non presente in Archivo, alcuni valori visivi ancora scritti a mano).
7. **App**: fatti SQLite e snapshot del catalogo (`apps/mobile/src/data`).
   - All'avvio l'app scarica `GET /v1/catalog` e lo sostituisce in una transazione: se arriva rotto resta quello di prima, e gli alimenti personali non si toccano.
   - Dopo il primo download chiede solo se il catalogo è cambiato (ETag); senza server usa la copia sul telefono.
   - Ricerca e scheda leggono da SQLite con le regole del backend (senza accenti, ogni parola deve comparire, crudo prima), tranne la somiglianza a trigrammi.
   - Stato e "Aggiorna catalogo" nel menu Sviluppo del profilo; flusso Maestro `catalogo.yaml` (tag `api`, serve il backend acceso).
   - Compromesso: le build preview bloccano l'HTTP in chiaro, quindi per provarle con il backend locale serve `expo-build-properties` (`usesCleartextTraffic`) oppure il backend online.
   - Fatte anche ricerca e scheda alimento:
     - la barra "Cerca un alimento" sta sopra le tab; lo scanner è nascosto fino alla F1;
     - la ricerca cerca a ogni lettera sul telefono (circa 1 ms per query sul catalogo reale) e tratta l'apostrofo tipografico e le legature come `unaccent`;
     - la scheda mostra l'etichetta per 100 g e la fonte (lo snapshot è al formato 2, con `source`; sul telefono è la migrazione v2);
     - il foglio dei grammi, per decisione di Enrico, in F0 **calcola soltanto**: "Usa 200 g" riporta l'etichetta a 200 g, e dallo stesso foglio si passa alla variante cruda o cotta. Il diario arriva in F1.
   - Attribuzione di CIQUAL (RNF-10) nel profilo, sezione "Fonti dei dati".
   - Doppioni del catalogo risolti: la cottura arriva dalla traduzione fino all'app (food.cooking, snapshot formato 3, migrazione v3 sul telefono) e 47 correzioni rivedute da Enrico stanno in pipelines/catalog/data/revisioni.csv. L'export si ferma se due alimenti sembrerebbero uguali nell'app (stessi nome e cottura, entrambi cotti o entrambi no: crudo e n.a. non hanno etichetta); il vincolo ex_food_shared_name_state_cooking fa lo stesso nel database, al commit. Su un database locale con il catalogo vecchio: alembic upgrade 6794f1e91aaf, poi catalog_load, poi alembic upgrade head.
   - Flusso Maestro `ricerca.yaml` (tag `api`). Sull'emulatore Gboard propone a volte la prova della penna e si prende il testo digitato: i flussi la chiudono e riscrivono.
Ordine approvato da Enrico il 31/10/2026 per chiudere la F0: prima il backend online, poi il gate sul telefono, poi l'autenticazione. USDA è rimandato a quando manca un generico della dieta reale.

8. **Backend online** (in corso). Supabase Free per Postgres e Render Free per l'API, con i vincoli verificati in `docs/requisiti.md`; procedura e segreti in `docs/processo.md`, "Delivery" e "Segreti".
   - **Fatto, PR #32 (`64a9f99`):**
     - sicurezza per riga su tutte le tabelle, imposta da un test;
     - ID stabili (uuid5 da fonte e codice) per i generici;
     - `/ready` che interroga il database e `release` (SHA dell'immagine) in `/health`;
     - pool adatto al pooler di Supabase;
     - ETag che regge i proxy (`W/`, liste, `*`);
     - nell'app, attesa del risveglio di Render al primo download (90 s, poi nuovi tentativi per circa un minuto);
     - documenti e `infra/supabase/bootstrap.sql`.
   - **Supabase, fatto e verificato il 07/11/2026.** Progetto `tara`, ref `fbwlepzrrvtngvbyktiv`, `eu-central-1`, piano Free.
     - Estensioni `unaccent` e `pg_trgm` nello schema `extensions`.
     - Schema alla revisione `3cf402a41280`.
     - Catalogo caricato: 3.484 alimenti, 13.438 nomi, 68.817 valori, tutti con ID stabile.
     - Data API spenta: nei log di PostgREST compare `db-schemas=pg_pgrst_no_exposed_schemas` e le richieste ricevono 503 `PGRST002`, che è l'effetto atteso.
     - Advisor di sicurezza: solo l'avviso informativo `rls_enabled_no_policy`, voluto.
     - Connessione: *session pooler* `aws-1-eu-central-1.pooler.supabase.com:5432`, utente `tara.fbwlepzrrvtngvbyktiv`, database `postgres`, con `?sslmode=require`. L'host `aws-0-…` non conosce il progetto.
     - **Ruolo `tara`, dall'08/11.** Due reset della password di `postgres` dal pannello e un riavvio del progetto non hanno cambiato l'impronta in `pg_authid`, e l'editor SQL del pannello ha cominciato a dare 28P01. La causa: su Postgres 17 `postgres` è membro di `supabase_privileged_role`, e `ALTER ROLE postgres` dà «Only superusers can alter privileged roles». Da allora:
       - `tara` possiede le 7 tabelle e `tara_search_text` e ha USAGE su `extensions` (senza, la ricerca dava 500);
       - `postgres` ha i permessi su tabelle presenti e future;
       - la password di `tara` esiste solo nel segreto GitHub e su Render, e si cambia con `python -m tara_api.db_role`;
       - un progetto nuovo crea il ruolo con `infra/supabase/bootstrap.sql`.
     - La password di `postgres` è probabilmente ancora quella originale, e un suo frammento è finito nell'output di una sessione di Claude dell'08/11. Tara non la usa più, ma va cambiata dal supporto di Supabase. Nel ticket: impronta invariata dopo i reset, editor SQL in 28P01, errore di `ALTER ROLE` e `release_channel: withdrawn`.
     - Il progetto riporta `release_channel: withdrawn` e una data di creazione anteriore alla creazione vera. Causa non trovata; finora nessun effetto.
   - **Render.**
     - Account creato, con la credenziale del registry `ghcr-tara`: token GitHub *classic* con solo `read:packages`, scadenza un anno. Render scarica l'immagine privata.
     - **Servizio buono: `tara-api-eu`**, `srv-dbnsfkou01pc73dkc95g`, `https://tara-api-eu.onrender.com`, Frankfurt (EU Central), piano Free, progetto `tara-api` / Production. Creato da Claude l'08/11 con l'autorizzazione di Enrico, con `PORT=8000` e health check `/health`. Il primo deploy è andato online in 20 s; `/health` risponde in circa 90 ms contro i 250 ms del servizio in Oregon.
     - Il nome `tara-api` è ancora preso dal servizio in Oregon. Il modulo propone come nome il riferimento dell'immagine (`tara-api:latest`): da lì veniva l'URL `tara-api-latest`. Il *Pre-Deploy Command* è bloccato sul piano Free.
     - Servizio da cancellare: `tara-api` in **Oregon**, `https://tara-api-latest.onrender.com`, `srv-dbnho4s9v7es73cq9oc0`, oggi sospeso (*Settings → Delete Web Service*).
     - Segreti GitHub: `RENDER_DEPLOY_HOOK_URL` con l'hook di `tara-api-eu` dall'08/11 alle 11:25 UTC; `TARA_DATABASE_URL` con il ruolo `tara` dalle 15:18 UTC, lo stesso valore impostato su Render.
   - **Seconda PR del passo 8** (branch `feat/rnf-14-deploy`, PR #33 in bozza): scritta l'08/11. Procedura in `docs/processo.md`, "Delivery". Il polling di `/health` è provato in Git Bash contro il servizio in Oregon: release giusta con `/ready` a 503, release diversa e servizio inesistente fanno tutti fallire il job. Cosa contiene:
     - in `cd.yml`, un job dopo la pubblicazione dell'immagine:
       - controlla che i segreti non siano vuoti;
       - esegue `docker run --rm -e TARA_DATABASE_URL "$IMAGE:$SHA" alembic upgrade head`;
       - chiama l'hook con `curl -fsS -G --data-urlencode "imgURL=$IMAGE:$SHA"`, perché l'URL dell'hook contiene già `?key=`;
       - fa polling di `/health` finché `release` coincide con lo SHA, con timeout di 10 minuti e 503 tollerati, poi chiama `/ready`;
       - espone i segreti solo negli `env:` degli step che li usano;
     - un workflow a cron due volte al giorno che chiama `/ready` con nuovi tentativi (`curl --retry 8 --retry-all-errors --retry-delay 15 --max-time 90`), contro la pausa di Supabase dopo 7 giorni senza attività;
     - `EXPO_PUBLIC_API_URL` con l'URL https di Render nei profili `preview` e `production` di `apps/mobile/eas.json`, con un test che lo imponga https: senza, `src/config.ts` ripiega in silenzio sull'emulatore;
     - un ambiente Postman per l'URL di Render, e Newman sulla collezione `services/api/postman/` in un terzo job del CD, senza segreti né token. Lanciato a mano l'08/11 sull'URL online: 22 controlli su 22, ETag compreso;
     - ruolo `tara`: `tara_api.db_role` con i suoi test e `infra/supabase/bootstrap.sql`, provato due volte su un Postgres 17 locale configurato come Supabase;
     - prova a freddo, l'08/11 alle 20:22 UTC dopo 22 minuti senza richieste: la prima `GET /v1/catalog` risponde 200 in 33,7 s, risveglio compreso, entro i 90 s che l'app concede al primo download; a caldo 9,7 s;
     - intestazione di `cd.yml` e `docs/processo.md` aggiornate.
   - Misure con 0,1 CPU e database locale, prima del deploy: snapshot in circa 10 s, 304 in meno di 0,05 s, picco di memoria intorno ai 220 MiB (390 MiB con quattro download insieme). Su Render l'08/11 lo snapshot (5,6 MB, circa 430 kB compressi) richiede 9,7 s a caldo e 33,7 s a freddo; la memoria si legge nelle metriche del servizio.
9. **Gate F0**: la ricerca di un generico restituisce valori corretti. Percorso della demo: "cerco albume, vedo i valori giusti, inserisco i grammi, funziona offline", da provare dall'inizio su un telefono con una build preview che parla con il backend online, dopo almeno 20 minuti di inattività del server, e poi senza rete. Prima, Enrico rivede i nomi degli alimenti della sua dieta.
10. **Autenticazione** con codice via email (Supabase Auth).
11. **Chiusura della F0**:
    - ruleset su `main`;
    - PR di Dependabot e patch di Expo;
    - aggiornamento di questo documento.
    - Minori rimandati dei passi 6 e 7:
      - nella scheda alimento non c'è «Indietro» durante il caricamento e `getFood` non gestisce gli errori;
      - «Torna a 100 g» resta visibile dopo «Usa 100 g»;
      - «Usa» fa partire la vibrazione di successo;
      - «Indietro» non fa nulla se si arriva da un deep link;
      - in `SearchField` la dimensione dell'icona è scritta a mano (20);
      - nel profilo la dicitura «dei generici»;
      - `CatalogProvider` non gestisce gli errori;
      - SQLite senza `busy_timeout`;
      - nutrienti orfani;
      - nessun confronto di versione oltre all'ETag.
    - Restano per la F1:
      - backup pianificati del database prima dei diari reali;
      - un ruolo del database per l'API senza permessi sullo schema, distinto da `tara` che resta alle migrazioni (con le policy di sicurezza per riga che gli servono);
      - una cache dello snapshot, se le misure su Render la chiederanno.

Prima di toccare API di Expo, leggere `apps/mobile/CLAUDE.md`: Expo cambia a ogni SDK.

## Riferimenti

- Documento vivo dei requisiti: https://claude.ai/artifact/Ks8ELqYdsPiqUY8gtM2tGg
- Fonti dati e licenze: `docs/requisiti.md`, sezione "Fonti dati e licenze". L'attribuzione di CIQUAL (Etalab 2.0) è nel profilo, sezione "Fonti dei dati" (RNF-10).
