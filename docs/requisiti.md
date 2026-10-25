# Tara — Documento dei requisiti

Bozza v0.2 · 22 ottobre 2026 · Enrico

> Copia nel repository del documento vivo su Claude Docs:
> https://claude.ai/artifact/Ks8ELqYdsPiqUY8gtM2tGg
> Se le due versioni divergono, aggiorna questa copia nello stesso commit della modifica che la rende necessaria.

## Scopo e principi

L'app sostituisce la versione gratuita di FatSecret per il tracciamento della dieta di un bodybuilder. È interamente in italiano, include di base lettura etichette, ricette, pasti salvati e contatore acqua, e usa l'AI solo dove toglie lavoro.

**Utente target.** Chi pesa gli alimenti e conosce le grammature di ciò che mangia. Nella prima fase l'utente è uno solo; in seguito una cerchia ristretta di amici.

**Principi di prodotto**

1. Velocità d'inserimento prima di tutto: registrare un alimento noto richiede meno passaggi che su FatSecret.
2. I valori nutrizionali arrivano sempre da una fonte tabellare (etichetta, Open Food Facts, tabelle di composizione). L'AI trascrive, riconosce e stima quantità, ma non genera valori nutrizionali.
3. Ogni valore nutrizionale ha provenienza e confidenza; un dato mancante non vale zero.
4. L'AI propone, l'utente conferma: nessuna scrittura nel diario senza conferma.
5. Predisposizione multi-utente dal primo giorno, anche con un solo utente.

**Fuori scopo per ora:** funzioni social, piani alimentari generati, tracciamento degli allenamenti, pagamenti, invio di dati a Open Food Facts.

**Notazione.** Ogni requisito ha un ID, una priorità (M indispensabile, S importante, C desiderabile) e la fase della roadmap in cui entra (F0–F5).

## Glossario

| Termine | Definizione |
| --- | --- |
| Alimento generico | Alimento senza marca preso da una tabella di composizione, es. "albume d'uovo crudo". |
| Prodotto di marca | Alimento confezionato, da barcode o etichetta, collegato al suo alimento generico. |
| Ricetta | Alimento composto da ingredienti con grammature a crudo, es. "pancake1". |
| Pasto salvato | Gruppo di voci da registrare insieme, es. "colazione solita". |
| Voce di diario | Un alimento registrato con quantità, data e slot pasto. |
| Slot pasto | Posizione nella giornata (pasto 1…n), con numero e nomi configurabili. |
| Tipo di giornata | Profilo di target nutrizionali e di attività: ON, OFF, High o altri definiti dall'utente. |
| Fase della dieta | Periodo con obiettivo e tasso di variazione del peso: bulk, cut, mantenimento, reverse, mini-cut, diet break. |
| Stack integratori | Integratori in uso, ciascuno con dose, momento della giornata e giorni di assunzione. |
| NEAT | Dispendio da attività non legata all'allenamento, misurato tramite i passi giornalieri. |
| Biofeedback | Valutazione soggettiva giornaliera (1–5) di fame, energia, sonno, digestione, pump e stress. |
| Check-in | Riepilogo settimanale di peso, aderenza, attività, biofeedback, misure e foto. |
| Provenienza | Origine di un valore nutrizionale: etichetta, Open Food Facts, riferimento, stimato, manuale. |
| Copertura | Quota delle kcal registrate per cui un nutriente ha un valore noto. |

## Catalogo alimenti e inserimento prodotti

Un nuovo prodotto entra nel catalogo da barcode, foto dell'etichetta o inserimento manuale, sempre attraverso un form precompilato da confermare.

### Catalogo

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-01 | Catalogo di alimenti generici importato da CIQUAL 2025 (e USDA FoodData Central per i generici mancanti), con nomi in italiano. | M | F0 |
| RF-02 | Prodotti di marca con nome, marca, categoria, barcode, unità base (g o ml), porzione dichiarata e alimento generico di riferimento. | M | F1 |
| RF-03 | Valori nutrizionali salvati per 100 g o 100 ml, un record per nutriente con provenienza e confidenza. | M | F0 |
| RF-04 | Varianti crudo e cotto come alimenti distinti, etichettate nella ricerca; il crudo è la variante predefinita. | M | F1 |
| RF-05 | Categoria scelta da una tassonomia fissa, non testo libero. | M | F1 |
| RF-06 | Correzione di qualsiasi valore; la correzione resta nel catalogo personale e prevale sulla fonte esterna. | M | F1 |
| RF-07 | Ricerca con in testa le marche usate di recente, poi l'alimento generico. | M | F1 |
| RF-08 | Densità opzionale per convertire grammi e millilitri. | C | F1 |

### Barcode

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-10 | Scansione barcode con catena di ricerca: catalogo personale → Open Food Facts → foto etichetta → inserimento manuale. | M | F1 |
| RF-11 | I dati di Open Food Facts arrivano in un form precompilato; alla conferma se ne salva una copia nel catalogo personale. | M | F1 |
| RF-12 | Se mancano kcal, proteine, carboidrati o grassi, l'app apre direttamente l'acquisizione dell'etichetta. | M | F1 |

### Etichetta e inserimento manuale

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-13 | Acquisizione di due foto (fronte e tabella nutrizionale) con estrazione strutturata di nome, marca, categoria proposta, valori per 100, porzione dichiarata e barcode se visibile. | M | F1 |
| RF-14 | Form precompilato con i campi a bassa confidenza evidenziati; ogni campo è modificabile a mano. | M | F1 |
| RF-15 | Controllo di coerenza: kcal dichiarate confrontate con 4 kcal/g per proteine e carboidrati, 9 per i grassi, 2 per le fibre; avviso oltre una tolleranza da tarare (proposta 10%). | M | F1 |
| RF-16 | Conversione del sale in sodio (sodio = sale ÷ 2,5). | M | F1 |
| RF-17 | Proposta automatica dell'alimento generico di riferimento, da confermare. | S | F1 |
| RF-18 | Inserimento manuale completo con gli stessi campi e controlli dell'etichetta. | M | F1 |

## Ricette e pasti salvati

Una ricetta è un alimento composto e si registra come qualsiasi altro alimento; un pasto salvato è un gruppo di voci da registrare insieme.

### Ricette

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-20 | Creazione di una ricetta con nome e ingredienti, ciascuno con grammatura a crudo e riferito a un prodotto specifico del catalogo (marca inclusa). | M | F1 |
| RF-21 | Resa per numero di porzioni (es. pancake1 = 4 pancake) o per peso finale da cotto (es. teglia di meal prep). | M | F1 |
| RF-22 | Valori della ricetta calcolati dagli ingredienti: una correzione su un ingrediente aggiorna la ricetta. | M | F1 |
| RF-23 | Aggiornamento del peso da cotto prima di registrare, perché ogni preparazione cala in modo diverso. | S | F1 |
| RF-24 | Duplica e modifica: pancake2 nasce da pancake1 cambiando un ingrediente. | M | F1 |
| RF-25 | Sostituzione di un ingrediente con un altro prodotto collegato allo stesso alimento generico. | S | F1 |
| RF-26 | Scheda ricetta con valori per porzione e per 100 g. | M | F1 |

### Pasti salvati

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-30 | Pasto salvato con nome e lista di voci (alimenti o ricette con quantità). | M | F1 |
| RF-31 | Registrazione con un tap, con quantità modificabili prima di confermare. | M | F1 |
| RF-32 | Creazione di un pasto salvato a partire da un pasto già registrato nel diario. | S | F1 |

## Diario, obiettivi, acqua e integratori

Il diario è pensato per chi conosce già le grammature: un alimento noto si registra in pochi tap, e copiare conta più che digitare.

### Diario

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-40 | Voci organizzate per data e slot pasto; numero e nomi degli slot configurabili. | M | F1 |
| RF-41 | Quantità in grammi o ml con tastierino numerico in primo piano; porzioni come scorciatoia per alimenti a pezzo e ricette a porzioni. | M | F1 |
| RF-42 | Quantità proposta = ultima usata per quell'alimento nello stesso slot. | M | F1 |
| RF-43 | Snapshot dei valori nutrizionali al momento della registrazione: modifiche successive ad alimenti o ricette non alterano il passato. | M | F1 |
| RF-44 | Preferiti, recenti, copia di un pasto da un altro giorno, copia di una giornata intera. | M | F1 |
| RF-45 | Riepilogo di kcal e macro consumati, target e residuo, per pasto e per giornata. | M | F1 |
| RF-46 | Inserimento testuale rapido ("riso 80 pollo 200 olio 10") con parser deterministico sul catalogo personale; voci ambigue risolte con una scelta. | S | F2 |

### Target, tipi di giornata e fasi della dieta

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-50 | Target di kcal, proteine, carboidrati e grassi per tipo di giornata (es. OFF, ON Upper, ON Lower, High), con nomi e numero di tipi liberi; fibre opzionali. | M | F1 |
| RF-51 | Assegnazione manuale del tipo di giornata a ogni data. | M | F1 |
| RF-52 | Ciclo ricorrente configurabile di tipi di giornata (es. un High ogni N giorni di allenamento), con modifica dei singoli giorni. | S | F1 |
| RF-53 | Storico dei target: cambiare un target non riscrive le giornate passate. | M | F1 |
| RF-54 | Fasi della dieta (bulk, cut, mantenimento, reverse, mini-cut, diet break) con date, peso obiettivo e tasso obiettivo in kg o % a settimana. | S | F2 |
| RF-55 | Progressione pianificata dei target dentro una fase (es. taper o reverse di N kcal ogni N settimane), applicata solo dopo conferma. | C | F2 |
| RF-56 | Suggerimento settimanale di aggiustamento del target in base al tasso reale rispetto a quello della fase (usa RF-71). | S | F2 |
| RF-57 | Proteine mostrate anche in g/kg di peso corporeo (sulla media mobile) e per pasto. | S | F1 |
| RF-58 | Limiti giornalieri opzionali per sodio, potassio e caffeina; caffeina tracciata come nutriente, anche da integratori e bevande. | S | F2 |

### Acqua

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-60 | Contatore acqua con incrementi rapidi configurabili (es. 250 ml, 500 ml, la propria borraccia) e target giornaliero. | M | F1 |
| RF-61 | Target acqua per tipo di giornata (es. più alto nei giorni ON). | S | F1 |
| RF-62 | Opzione per conteggiare nell'acqua le bevande registrate nel diario. | C | F2 |

### Integratori

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-80 | Integratori come prodotti con dose, unità (capsule, g, ml, misurini) e micronutrienti, incluso il sale arricchito di potassio. | M | F2 |
| RF-81 | Stack integratori: per ciascuno momento della giornata (risveglio, con un pasto, pre-workout, post-workout, prima di dormire) e regola sui giorni (tutti, solo ON, esclusi tipi di giornata specifici). | M | F2 |
| RF-82 | Voci proposte in automatico dallo stack e confermate con un tap, anche direttamente dalla notifica. | M | F2 |
| RF-83 | Inventario delle confezioni con consumo calcolato dallo stack e data stimata di esaurimento. | C | F2 |
| RF-84 | Storico dello stack: cosa era in uso in un dato periodo. | C | F2 |

## Fisico, attività e check-in

Peso, misure, attività e sensazioni soggettive stanno insieme perché servono a decidere quando cambiare il target calorico.

### Peso e composizione corporea

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-70 | Peso giornaliero a digiuno con media mobile a 7 giorni e variazione settimanale in kg e in % del peso. | M | F1 |
| RF-71 | Stima del dispendio di mantenimento (TDEE adattivo) dal trend del peso e dalle kcal registrate. | S | F2 |
| RF-72 | Misure corporee (vita, fianchi, petto, braccia, cosce, polpacci) con frequenza configurabile e grafici. | S | F2 |
| RF-73 | Foto progressi con pose standard (fronte, lato, retro), sagoma guida e confronto affiancato tra due date. | S | F2 |
| RF-74 | Percentuale di grasso opzionale, sempre associata al metodo di misura (plicometria, bilancia, DEXA). | C | F2 |

### Cardio e NEAT

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-110 | Registrazione del cardio: tipo (LISS, HIIT, altro), attrezzo, durata, FC media opzionale, momento (post-workout, a digiuno, sessione separata). | M | F2 |
| RF-111 | Target settimanale di cardio (sessioni e minuti) per fase della dieta, con avanzamento visibile. | S | F2 |
| RF-112 | Passi giornalieri con target per tipo di giornata; inserimento manuale. | M | F2 |
| RF-113 | Lettura automatica di passi, peso e sonno da Apple Health o Health Connect. | S | F2 |
| RF-114 | Calorie di cardio e passi mostrate a parte; per impostazione non si aggiungono al budget del giorno. | S | F2 |

### Biofeedback e check-in

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-120 | Biofeedback giornaliero rapido (1–5): fame, energia, qualità del sonno, digestione, pump, stress; ore di sonno. | S | F2 |
| RF-121 | Check-in settimanale automatico: peso medio e variazione, aderenza a kcal e macro, passi e cardio, biofeedback medio, misure e foto della settimana. | M | F2 |
| RF-122 | Export del check-in in PDF o testo da inviare a un coach. | C | F2 |

### Pianificazione e meal prep

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-130 | Giornata pianificata in anticipo, trasformata in diario con un tap pasto per pasto. | S | F2 |
| RF-131 | Pianificazione del meal prep: dalle ricette della settimana, quantità totali da cucinare e lista della spesa. | C | F2 |
| RF-132 | Etichetta di sessione sui giorni ON (es. Upper A, Lower B) per collegare target e allenamento, senza tracciare l'allenamento. | C | F2 |

### Preparazione gara

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-140 | Data della gara con conto alla rovescia in settimane e tasso di perdita necessario per arrivare al peso obiettivo. | C | F3 |
| RF-141 | Peak week come sequenza di tipi di giornata dedicati, con target giornalieri di carboidrati, sodio e acqua. | C | F3 |

## Notifiche e promemoria

Le notifiche sono locali e programmate, attivabili una per una, con una fascia di silenzio.

| ID | Notifica | Quando | Priorità | Fase |
| --- | --- | --- | --- | --- |
| RF-150 | Integratori | Al momento previsto dallo stack, solo nei giorni previsti; azioni "preso" e "posticipa" dalla notifica | M | F2 |
| RF-151 | Acqua | Se si è indietro rispetto al target agli orari configurati | S | F2 |
| RF-152 | Pesata | Al risveglio, nei giorni configurati | S | F2 |
| RF-153 | Pasto non registrato | Se uno slot resta vuoto oltre l'orario previsto | S | F2 |
| RF-154 | Check-in e foto | Nel giorno del check-in settimanale | S | F2 |
| RF-155 | Passi | In serata, se il target non è raggiunto | C | F2 |
| RF-156 | Riordino integratori | Alcuni giorni prima dell'esaurimento stimato (RF-83) | C | F2 |
| RF-157 | Fascia di silenzio e raggruppamento | Notifiche ravvicinate raccolte in una sola | M | F2 |

## Micronutrienti e funzioni AI

Quando l'etichetta non li riporta, i micronutrienti arrivano dall'alimento generico collegato. L'AI resta confinata a trascrizione, comandi vocali e stima dei pasti senza etichetta.

### Micronutrienti

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-90 | Per i prodotti di marca senza micronutrienti in etichetta, valori ereditati dal generico collegato, con provenienza "riferimento". | M | F3 |
| RF-91 | Verifica di coerenza tra i macro del prodotto e quelli del generico; oltre la soglia, confidenza ridotta e segnalazione. | M | F3 |
| RF-92 | Proposta del generico tramite ricerca semantica (embedding + riordino con LLM), confermata dall'utente. | S | F3 |
| RF-93 | Metrica di copertura per nutriente su base settimanale. | M | F3 |
| RF-94 | Dashboard settimanale dei micronutrienti rispetto ai LARN (V revisione) per sesso ed età dell'utente. | M | F3 |
| RF-95 | Avviso di possibile carenza o eccesso sulla media mobile a 7 giorni, solo con copertura sopra soglia (proposta 80% delle kcal). | S | F3 |

### Funzioni AI

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RF-100 | Comando vocale: trascrizione, interpretazione con riferimento a pasti salvati, ricette e catalogo, bozza da confermare (stessa pipeline di RF-46). | S | F3 |
| RF-101 | Stima di un pasto da una o più foto, con descrizione testuale o vocale opzionale: componenti, grammature stimate e range; valori nutrizionali dal catalogo. | S | F4 |
| RF-102 | Correzione delle grammature stimate prima della registrazione; la voce resta marcata come stimata. | M | F4 |
| RF-103 | Server MCP dell'app per registrare e consultare il diario da un assistente esterno. | C | F5 |

## Requisiti non funzionali

I valori di tempo sono obiettivi proposti, da confermare dopo i primi test sul dispositivo.

| ID | Requisito | Priorità | Fase |
| --- | --- | --- | --- |
| RNF-01 | Interfaccia e nomi degli alimenti interamente in italiano. | M | F0 |
| RNF-02 | Alimento noto registrato in ≤ 3 tap; ricerca nel catalogo < 200 ms; barcode già in catalogo → form in < 1 s; estrazione etichetta < 10 s. | M | F1 |
| RNF-03 | Consultazione del catalogo personale e registrazione nel diario anche senza rete (es. sui mezzi), con sincronizzazione al ritorno della connessione. | S | F1 |
| RNF-04 | `user_id` su ogni entità personale e autenticazione attiva anche con un solo utente. | M | F0 |
| RNF-05 | Layer AI indipendente dal provider: output strutturati validati da schema, prompt versionati nel repository. | M | F1 |
| RNF-06 | Costo registrato per ogni chiamata AI; tetto di spesa mensile configurabile per utente. | S | F1 |
| RNF-07 | CI con test automatici; eval set per l'estrazione etichette (accuratezza per campo) e per la stima da foto (errore % su kcal e proteine), eseguiti a ogni cambio di modello o prompt. | M | F1 |
| RNF-08 | Backup giornaliero del database; export completo dei dati dell'utente in CSV o JSON. | M | F1 |
| RNF-09 | Con più utenti: consenso esplicito, export e cancellazione dei dati. Dieta, peso e integratori possono rientrare tra i dati sanitari del GDPR (art. 9). | M | F5 |
| RNF-10 | Rispetto di licenze e attribuzioni delle fonti dati (vedi Fonti dati). | M | F0 |
| RNF-11 | Notifiche programmate sul dispositivo, consegnate anche senza rete e senza dipendere dal backend. | M | F2 |
| RNF-12 | Foto progressi cifrate a riposo, visibili solo all'utente e mai inviate a un modello AI. | M | F2 |
| RNF-13 | Processo da team anche con un solo sviluppatore: ogni modifica passa da PR con CI verde (lint, format, type check `strict`, test con coverage ≥ 80%, scansione dei segreti), Conventional Commits verificati, dipendenze bloccate da lockfile e aggiornate da Dependabot; dettagli in `docs/processo.md`. | M | F0 |
| RNF-14 | Delivery continua: ogni merge su `main` con CI verde produce artefatti versionati e riproducibili (immagine del backend dalla F0; build e aggiornamenti OTA dell'app con EAS dalla F1) e il deploy parte dalla stessa pipeline. | M | F0 |

## Architettura

Tara è un'app Expo local-first con un backend FastAPI. Il catalogo dei generici e le sue traduzioni si preparano una volta, in una pipeline offline, e arrivano sul telefono come snapshot.

```
Pipeline del catalogo (offline):
  Fonti (CIQUAL, USDA) → Traduzione (LLM + glossario) → Validazione (regole + revisione) → Snapshot versionato
                                                                                                        │ import
                                                                                                        ▼
App Expo (telefono)  ── sync ──▶  API FastAPI  ◀──▶  Postgres + pgvector (catalogo e dati utente)
  interfaccia in italiano  ── AI, barcode ─▶  sincronizzazione      ──▶  Object storage (foto delle etichette)
  SQLite: catalogo e diario                   gateway AI (chiavi server) ──▶ Provider modelli AI
  coda di sync, anche offline                 proxy Open Food Facts      ──▶ Open Food Facts
  notifiche locali                            autenticazione
        ▲
        │ passi, peso, sonno
Health Connect · HealthKit (sul telefono)
```

Il telefono non chiama mai direttamente i provider AI né Open Food Facts: passa sempre dal backend, che tiene le chiavi e mette in cache i prodotti. Lo snapshot del catalogo arriva sul telefono con la sincronizzazione.

### Decisioni

| Ambito | Scelta | Motivo | Scartata |
| --- | --- | --- | --- |
| Nome | Tara | Il tasto della bilancia: richiama il peso a crudo; corto e leggibile anche in inglese | — (disponibilità su store e dominio da verificare prima della pubblicazione) |
| Client | Expo (React Native) + TypeScript | Health Connect e HealthKit con librerie mature, aggiornamenti OTA con EAS Update, una sola codebase | PWA: niente dati salute; Flutter: niente OTA, Dart |
| Dati salute | Interfaccia `HealthSource`: Health Connect ora, HealthKit con il primo utente iPhone | Le API di Google Fit sono supportate solo fino a fine 2026; Google Fit scrive comunque in Health Connect | Google Fit REST API |
| Dati sul telefono | SQLite locale con catalogo, diario e impostazioni; coda di sincronizzazione con UUIDv7 e last-write-wins per riga | Ricerca istantanea e uso offline sui mezzi | Solo online |
| Backend | FastAPI (Python) | Sincronizzazione, gateway AI con chiavi lato server, proxy Open Food Facts con cache; stesso linguaggio di pipeline ed eval | Logica AI sul client |
| Database | Postgres + pgvector, foto in object storage | Catalogo, dati utente e matching dei generici in un solo posto | Database vettoriale separato |
| Hosting | Servizio gestito con Postgres, autenticazione e storage (es. Supabase); tutto containerizzato | Avvio rapido, migrazione su AWS possibile | Infrastruttura gestita a mano |
| Notifiche | Locali, programmate dall'app dallo stack integratori | Funzionano offline, nessun server di push | Push da backend |
| Distribuzione Android | APK, poi test interno di Google Play | La verifica sviluppatori per il sideloading parte il 30/09/2026 in alcuni Paesi e si estende nel 2027 | — |
| Catalogo dei generici | CIQUAL 2025 in XML; proteine ed energia secondo il Reg. UE 1169/2011 (azoto × 6,25); "traces" e "< x" = 0 con confidenza dimezzata; `-` = nessun valore; confidenza dai codici A–D (energia: dal macronutriente misurato meno affidabile) | Coerenza con le etichette (RF-91) e con il principio "un dato mancante non vale zero"; regole in `pipelines/catalog/data/mappatura_ciqual.toml` | CALNUT (solo versione 2020, allineata alla tabella precedente); proteine N × fattore di Jones |
| Stato e cottura | Lo stato (crudo, cotto, n.a.) è il dato che conta per registrare: si pesa a crudo. "n.a." vale per tutto ciò che si pesa come venduto, compresi i prodotti pronti da scaldare e i surgelati precotti, anche se il nome originale cita una cottura. Il metodo di cottura è un dettaglio secondario, facoltativo, mai controllato e mostrato in secondo piano; nel nome restano vietati solo "crudo" e "cotto" ("Patatine fritte" è il nome del prodotto) | Un bodybuilder pesa a crudo e non usa il metodo di cottura; segnalare la cottura produceva quasi solo falsi allarmi | Metodo di cottura obbligatorio o controllato |
| Processo e CI/CD | GitHub Actions con job per pacchetto e un controllo aggregato; uv e lockfile, mypy `strict`, pre-commit; immagine del backend su GHCR; EAS per build e OTA dell'app | Build riproducibili e regole applicate dagli strumenti anche con un solo sviluppatore (RNF-13, RNF-14) | pip senza lockfile; build dell'app su GitHub Actions al posto di EAS |
| Costi e fornitori | Zero costi finché l'app la usa solo Enrico: piani gratuiti o esecuzione locale. Ogni fornitore sta dietro una variabile d'ambiente o un'interfaccia standard (Docker, Postgres + Alembic, JWT con JWKS) | Passare a un piano a pagamento (modello migliore, hosting senza sospensioni) cambia la configurazione, non il codice | Servizi a pagamento come default |
| Modelli AI | Layer multi-provider (Pydantic AI): il modello si sceglie con `TARA_AI_MODEL` (`google:…`, `ollama:…`, `anthropic:…`); prompt e schemi versionati, scelta del modello con la valutazione su un set di riferimento (storico in `docs/valutazioni.md`); per la traduzione dei nomi `gemini-3.1-flash-lite` a temperatura 0 con il prompt `traduzione-v3` | Gemini con chiave di AI Studio senza fatturazione Cloud (piano gratuito) o modello locale con Ollama; a pagamento basta cambiare la variabile | Un solo provider cablato nel codice; l'abbonamento Google AI Pro, che non copre le chiamate API |

### Layer di traduzione

Si traduce una volta, nella pipeline del catalogo; il risultato è un dato versionato, mai una traduzione a runtime.

1. Traduzione strutturata: dal nome originale (CIQUAL in francese e inglese insieme) il modello restituisce nome italiano, alias, stato (crudo, cotto, n.a.), metodo di cottura, taglio o parte.
2. Glossario controllato per i termini ricorrenti (raw → crudo, boiled → lessato, drained → sgocciolato); validatori deterministici mandano in revisione le righe incoerenti, es. "raw" nell'originale e stato diverso da crudo.
3. Meno testo da tradurre: CIQUAL è il catalogo principale, USDA solo per i generici mancanti e mai la sezione Branded; da Open Food Facts si usa il nome italiano quando c'è; le marche non si traducono.
4. Ricerca su nomi e alias italiani con indice full-text, embedding multilingua come rete di sicurezza.
5. Revisione manuale dei 200–300 generici più usati prima dell'MVP; ogni rinomina nell'app diventa la traduzione canonica; un set di traduzioni verificate gira in CI.
6. Nutrienti, unità e categorie: tabelle piccole scritte a mano, senza LLM.

Il peso predefinito è a crudo: lo stato è un campo, la ricerca propone prima la variante cruda, gli ingredienti delle ricette sono a crudo e il cotto entra solo come peso finale della ricetta o come scelta esplicita.

## Modello dati

Lo schema di partenza ruota attorno a `food`: generici, prodotti di marca e ricette sono tutti alimenti, e i nutrienti stanno in una tabella a righe con la loro provenienza.

```
-- Utenti
app_user             id, created_at

-- Catalogo
food                 id, user_id (null = catalogo condiviso), name, brand, category_code,
                     barcode, base_unit (g|ml), density_g_ml, serving_size,
                     state (raw|cooked|not_applicable), parent_food_id,
                     source (ciqual|usda|open_food_facts|label|manual|recipe), created_at, updated_at
food_name            id, food_id, lang (it|fr|en), name, origin (source|llm|reviewed|user)
category             code, name_it, parent_code
nutrient             code, name_it, unit, display_order
nutrient_value       food_id, nutrient_code, amount_per_100, provenance
                     (label|open_food_facts|reference|estimated|manual), confidence (0–1)
recipe               food_id, yield_mode (portions|weight), portions, cooked_weight_g
recipe_item          recipe_id, ingredient_food_id, grams_raw
saved_meal           id, user_id, name
saved_meal_item      saved_meal_id, food_id, quantity, unit
label_scan           id, user_id, image_refs, extraction_json, model, prompt_version, cost, created_at

-- Diario e obiettivi
meal_slot            id, user_id, name, position, expected_time
diary_entry          id, user_id, date, meal_slot_id, food_id, quantity, unit,
                     nutrients_snapshot (jsonb), is_estimated, is_planned, created_at
diet_phase           id, user_id, kind (bulk|cut|maintenance|reverse|minicut|diet_break),
                     start_date, end_date, goal_weight_kg, target_rate_pct_week, cardio_target_json
day_type             id, user_id, name, session_label
day_type_target      day_type_id, valid_from, kcal, protein_g, carbs_g, fat_g, fiber_g,
                     sodium_mg, potassium_mg, caffeine_mg, water_ml, steps
day_plan             user_id, date, day_type_id
water_entry          id, user_id, date, ml, created_at

-- Integratori
supplement_stack_item  id, user_id, food_id, dose, unit, moment, day_rule, valid_from, valid_to
supplement_stock       id, user_id, food_id, units_left, purchased_at

-- Fisico e attività
weight_entry         id, user_id, date, kg, source (manual|health)
body_measurement     id, user_id, date, site, cm
body_fat_entry       id, user_id, date, pct, method
progress_photo       id, user_id, date, pose, blob_ref (cifrato)
cardio_session       id, user_id, date, kind, equipment, minutes, avg_hr, moment
steps_entry          user_id, date, steps, source (manual|health)
biofeedback_entry    user_id, date, hunger, energy, sleep_quality, sleep_hours,
                     digestion, pump, stress
competition          id, user_id, date, goal_weight_kg

-- Notifiche
notification_rule    id, user_id, kind, schedule_json, enabled, quiet_hours_json
```

- `user_id` nullo indica il catalogo condiviso dei generici importati; valorizzato, il catalogo personale. Il catalogo condiviso accetta solo le tabelle di composizione (CIQUAL, USDA).
- Le tabelle del catalogo esistono dalla F0 (migrazione `services/api/migrations`); le regole sono vincoli del database. Le altre tabelle entrano con le loro fasi.
- I valori fissi (stato, fonte, provenienza, lingua, origine del nome) sono in inglese nel database e nel codice; le etichette in italiano appartengono all'interfaccia.
- `food.name` è il nome canonico in italiano mostrato nell'app; `food_name` contiene i nomi alternativi usati nella ricerca: originali delle fonti e alias italiani, unici per lingua senza distinguere maiuscole.
- Un nutriente senza valore noto non ha riga in `nutrient_value`: un dato mancante non vale zero.
- Identificativi UUIDv7, generati dall'applicazione anche sul telefono offline; il barcode è unico per catalogo.
- `parent_food_id` collega un prodotto di marca al suo generico: serve per ricerca, sostituzioni nelle ricette ed eredità dei micronutrienti.
- `nutrients_snapshot` rende il diario immutabile (RF-43); `day_type_target.valid_from` fa lo stesso per i target (RF-53).
- `label_scan` conserva immagini ed estrazioni: diventa il dataset dell'eval set per la lettura etichette (RNF-07).

## Fonti dati e licenze

Per la fase personale bastano fonti gratuite; la BDA dell'IEO ha condizioni da rivedere se l'app esce dalla cerchia di amici.

| Fonte | Uso nell'app | Accesso | Condizioni |
| --- | --- | --- | --- |
| [Open Food Facts](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/finding-healthy-cereals/) | Barcode e prodotti di marca | API senza autenticazione con User-Agent dell'app; dump completi in CSV e Parquet | [Dati aperti](https://data.europa.eu/it/publications/use-cases/open-food-facts-una-banca-dati-aperta-e-collaborativa-sui-prodotti), riutilizzabili per qualsiasi scopo con attribuzione |
| [CIQUAL 2025](https://doi.org/10.57745/RDMHWY) (Anses, 19/11/2025) | Generici con micronutrienti: 3.484 alimenti, 74 componenti, codice di affidabilità per ogni valore | Download gratuito in XML ed Excel da recherche.data.gouv.fr; `tara_catalog.fetch` verifica l'MD5 | Licence Ouverte / Etalab 2.0: citare "Anses. 2025. Table de composition nutritionnelle des aliments Ciqual" con la versione, senza alterarne il senso; nomi in francese e inglese da tradurre |
| USDA FoodData Central | Generici con micronutrienti dettagliati | Download gratuito | Pubblico dominio; nomi in inglese da tradurre |
| [BDA dell'IEO](https://www.fondazioneieomonzino.it/?p=31728) | Alimenti tipici italiani | Consultazione online gratuita; Excel completo con donazione minima di 50 € | Uso commerciale solo con [autorizzazione scritta](https://bda.ieo.it/?p=53); citazione obbligatoria |
| [Tabelle CREA](https://qds.it/un-portale-per-fare-scelte-consapevoli-nellaquisto-di-prodotti-agroalimentari/) | Riscontro sugli alimenti italiani | Consultazione online, dati aggiornati al 2019 | Nessun download ufficiale in blocco trovato |
| [LARN, V revisione](https://sinu.it/larn/) (SINU, 2024) | Valori di riferimento per dashboard e avvisi | Pubblicazione SINU | Valori da trascrivere con citazione |

## Roadmap

Fasi in sequenza: ognuna parte solo quando la precedente supera il suo gate. Nessuna funzione AI extra prima di due settimane di uso reale dell'MVP.

1. **F0 · Fondamenta** — repo, CI/CD, schema dati, autenticazione, backend online; import di CIQUAL 2025 (e USDA per i generici mancanti) con nomi tradotti in italiano.
   *Gate:* la ricerca di un generico restituisce valori corretti.
2. **F1 · MVP «disinstallo FatSecret»** — catalogo, barcode con Open Food Facts, lettura etichetta, inserimento manuale; ricette, pasti salvati, diario con copia, preferiti e recenti; target per tipo di giornata, contatore acqua, peso con media mobile.
   *Gate (vincolante):* due settimane di uso esclusivo, senza FatSecret.
3. **F2 · Routine del bodybuilder** — stack integratori con notifiche, cardio e passi, fasi della dieta e TDEE adattivo; misure, foto progressi, biofeedback e check-in settimanale; inserimento testuale rapido e pianificazione dei pasti.
   *Gate:* routine completa gestita senza altre app.
4. **F3 · Micronutrienti e voce** — collegamento ai generici, micronutrienti ereditati, metrica di copertura; dashboard settimanale e avvisi rispetto ai LARN; comando vocale su pasti salvati e ricette; modalità gara.
   *Gate:* stima validata su prodotti con etichetta completa.
5. **F4 · Pasti fuori casa** — stima da foto con range e correzione delle grammature; eval set costruito con i pasti pesati a casa.
   *Gate:* errore su kcal e proteine misurato e accettato.
6. **F5 · Amici** — account multipli, tetto di spesa AI per utente, adempimenti GDPR; distribuzione.

La lettura etichette entra già nell'MVP perché è il modo base di inserire un prodotto nuovo, mentre voce, micronutrienti e stima da foto aspettano due settimane di uso reale.

## Questioni aperte e rischi

L'hosting del backend va scelto entro la fine della fase F0, perché da lui dipendono il backend online e l'autenticazione; le altre scelte servono entro F1 o più avanti.

### Questioni aperte

- [ ] Verifica della disponibilità del nome Tara su Google Play, App Store e dominio prima della pubblicazione.
- [ ] Modello AI per l'estrazione etichette, da scegliere con un confronto su 30–50 etichette reali.
- [x] Provider di hosting del backend: Supabase Free (Postgres + pgvector, Auth, regione UE) e Render Free (Francoforte) per il container dell'API, finché l'uso è personale; upgrade ai piani a pagamento senza cambiare codice.
- [ ] Piano GitHub per proteggere `main` sul repository privato (GitHub Pro, anche tramite Student Developer Pack) oppure repository pubblico.
- [x] Account Expo per attivare EAS Build, EAS Update e il server MCP di Expo: progetto `@enricobalbo/tara`, prima development build Android il 22/10/2026.
- [ ] Acquisto della BDA dell'IEO per gli alimenti tipici italiani.
- [ ] Tassonomia delle categorie: riuso di quella di Open Food Facts o una versione ridotta.
- [ ] Peso da cotto per singola preparazione o solo a livello di ricetta.
- [ ] Livello di supporto offline già nell'MVP.
- [ ] Archiviazione delle foto progressi: solo sul dispositivo o anche sul backend, cifrate.
- [ ] Apple Developer Program, solo quando entra il primo utente iPhone.

### Rischi

| Rischio | Impatto | Mitigazione |
| --- | --- | --- |
| Dati Open Food Facts incompleti o errati | Valori sbagliati nel diario | Form di conferma, controllo 4/4/9, copia personale correggibile |
| Nomi delle tabelle in francese e inglese | Ricerca poco usabile | Traduzione e alias in italiano, revisione manuale dei generici più usati |
| Errore alto nella stima da foto | Perdita di fiducia nell'app | Range invece di valore puntuale, correzione manuale, funzione nell'ultima fase |
| Costi AI con più utenti | Spesa fuori controllo | Tetto per utente, riuso delle estrazioni già fatte per lo stesso barcode |
| Ambito che cresce prima dell'MVP | MVP mai concluso | Gate di F1 vincolante prima di qualsiasi funzione AI extra |
