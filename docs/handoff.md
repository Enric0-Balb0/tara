# Handoff: dalla progettazione allo sviluppo

Questo file riassume la conversazione di progettazione del 22 ottobre 2026 (claude.ai) da cui nasce il repository, così che una nuova sessione di Claude Code possa ripartire senza perdere contesto.

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
3. ~~Scegliere l'hosting~~: Supabase Free + Render Free (vedi `docs/requisiti.md`). Restano da creare gli account e da aggiungere il job di deploy a `cd.yml`.

## Prossimi passi (fase F0)

1. ~~**Schema del database**~~: fatto. Tabelle del catalogo e utenti con i vincoli di dominio, migrazione Alembic con i 25 nutrienti, test di integrazione su Postgres (`services/api/migrations`, `tara_api/db`).
2. ~~**Import CIQUAL**~~: fatto con CIQUAL 2025. Download verificato (`tara_catalog.fetch`), mappatura sui 24 nutrienti di Tara che CIQUAL copre (`data/mappatura_ciqual.toml`), snapshot normalizzato con provenienza e confidenza (`tara_catalog.build` → `data/build/ciqual-2025/`). La pipeline usa ora i valori di stato del database (`raw`/`cooked`/`not_applicable`). Il caricamento nel database avviene dopo la traduzione, perché `food.name` richiede il nome italiano.
3. ~~**Traduzione**~~: fatta per tutti i 3.484 alimenti di CIQUAL; layer multi-provider con Pydantic AI, prompt `prompts/traduzione-v3.md`, controlli deterministici sulle sole contraddizioni crudo/cotto, set di valutazione di 53 alimenti, traduzione a lotti con ripresa (`python -m tara_catalog.translate eval|ciqual`). Modello: `gemini-3.1-flash-lite` (vedi `docs/valutazioni.md`). Revisione: `translate revisione` scrive `data/build/ciqual-2025/revisione.csv` per Excel (in alto gli alimenti della dieta); `translate applica` salva le correzioni in `data/revisioni.csv`, versionato, che prevale sulle traduzioni del modello. Le traduzioni sono caricate come `llm` (non riviste) finché Enrico non le rivede. `export ciqual` scrive `data/build/ciqual-2025/catalogo.jsonl`, il contratto con il caricatore del backend.
4. ~~**Caricamento del catalogo**~~: fatto; migrazione `source_code` (unico per fonte, obbligatorio per i generici condivisi) e `python -m tara_api.catalog_load`, che legge `catalogo.jsonl` e inserisce o aggiorna in una transazione; 3.484 alimenti in circa 4 secondi.
5. **API di ricerca**: fatte `GET /v1/foods/search` (sottostringa senza accenti con indice a trigrammi, ogni parola deve comparire, crudo prima del cotto; circa 3 ms sul catalogo reale), `GET /v1/foods/{id}` (scheda con provenienza e confidenza) e `GET /v1/catalog` (snapshot per l'app: 5,5 MB in JSON, 382 KB compresso, ETag per non riscaricarlo). Prove a mano: Swagger su `/docs` e la collezione Postman in `services/api/postman/`. Da fare: autenticazione, insieme agli account Supabase.
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
   - Doppioni del catalogo risolti: la cottura arriva dalla traduzione fino all'app (food.cooking, snapshot formato 3, migrazione v3 sul telefono) e 43 nomi rivisti da Enrico stanno in pipelines/catalog/data/revisioni.csv. L'export si ferma se due alimenti hanno stesso nome, stato e cottura; il vincolo ex_food_shared_name_state_cooking fa lo stesso nel database, al commit. Su un database locale con il catalogo vecchio: alembic upgrade 6794f1e91aaf, poi catalog_load, poi alembic upgrade head.
   - Flusso Maestro `ricerca.yaml` (tag `api`). Sull'emulatore Gboard propone a volte la prova della penna e si prende il testo digitato: i flussi la chiudono e riscrivono.
8. **Gate F0**: la ricerca di un generico restituisce valori corretti. Percorso della demo: "cerco albume, vedo i valori giusti, inserisco i grammi, funziona offline", da provare dall'inizio su un telefono con il catalogo scaricato e poi senza rete. Dopo il gate restano in F0 l'autenticazione e il backend online.

Prima di toccare API di Expo, leggere `apps/mobile/CLAUDE.md`: Expo cambia a ogni SDK.

## Riferimenti

- Documento vivo dei requisiti: https://claude.ai/artifact/Ks8ELqYdsPiqUY8gtM2tGg
- Fonti dati e licenze: `docs/requisiti.md`, sezione "Fonti dati e licenze". L'attribuzione di CIQUAL (Etalab 2.0) è nel profilo, sezione "Fonti dei dati" (RNF-10).
