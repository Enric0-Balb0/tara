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
| Notifiche | Locali, programmate dall'app | Funzionano offline, nessun server di push. |
| MVP | Fase F1, senza AI oltre alla lettura etichette; gate: due settimane senza FatSecret | Se il logging base non è più veloce di FatSecret, l'AI non lo salva. |

## Casi d'uso reali da tenere presenti

- Carb cycling: tipi di giornata con target diversi (OFF, ON per sessione Upper/Lower, giorno High), con proteine costanti.
- Sale arricchito di potassio pesato in bustine: va registrato come alimento con i suoi micronutrienti, altrimenti sodio e potassio risultano sbagliati.
- Meal prep nei giorni di riposo, con 5–6 pasti pronti portati al lavoro: ricette in teglia con peso da cotto, pasti salvati, copia della giornata.
- Integratori assunti a orari diversi e solo in certi giorni (es. solo nei giorni di allenamento, o esclusi in un tipo di sessione): servono regole sui tipi di giornata.
- Fasi della dieta (cut, reverse, bulk) con tasso settimanale e aggiustamento del target dal trend del peso.

## Stato del repository

Primo commit: solo scheletro, nessuna funzione di prodotto.

- `apps/mobile`: Expo SDK 58 con Expo Router e quattro tab segnaposto (Oggi, Alimenti, Progressi, Profilo). `src/domain/nutrition.ts` contiene il controllo kcal 4/4/9/2 (RF-15) e la conversione sale → sodio (RF-16), con test Vitest. Verificati typecheck, lint, test e bundle Android.
- `services/api`: FastAPI con `/health`, configurazione da variabili `TARA_*`, test.
- `pipelines/catalog`: glossario (`data/glossario.toml`), tabella dei nutrienti in italiano (`data/nutrienti.csv`), validatore di coerenza dello stato crudo/cotto, test.
- `infra/docker-compose.yml`: Postgres 17 con pgvector.
- `.github/workflows/ci.yml`: lint e test dei tre pacchetti; parte quando il repository è su GitHub.

## Prossimi passi (fase F0)

1. **Schema del database**: migrazioni (Alembic) per `food`, `food_name`, `category`, `nutrient`, `nutrient_value` e utenti; seed dei nutrienti da `pipelines/catalog/data/nutrienti.csv`.
2. **Import CIQUAL/CALNUT**: scaricare l'Excel da ciqual.anses.fr (i file grezzi vanno in `pipelines/catalog/data/raw/`, ignorata da git), parser, mappatura dei codici nutriente.
3. **Traduzione**: modulo con output strutturato (nome, alias, stato, cottura, parte), suggerimenti dal glossario, `check_state` sulle uscite, CSV di revisione per i generici più usati.
4. **API di ricerca** dei generici su nomi e alias italiani (full-text) e autenticazione.
5. **App**: SQLite locale (`npx expo install expo-sqlite`), snapshot del catalogo, schermata di ricerca.
6. **Gate F0**: la ricerca di un generico restituisce valori corretti.

Prima di toccare API di Expo, leggere `apps/mobile/CLAUDE.md`: Expo cambia a ogni SDK.

## Riferimenti

- Documento vivo dei requisiti: https://claude.ai/artifact/Ks8ELqYdsPiqUY8gtM2tGg
- Fonti dati e licenze: `docs/requisiti.md`, sezione "Fonti dati e licenze".
