# Design di Tara

Documento del design system e dello stile dell'app. Nasce da una sessione di brainstorming con Enrico del 26 ottobre 2026, sugli screen reali di FatSecret che usa oggi. Le bozze visive sono sul canvas [Tara · direzioni visive](https://claude.ai/artifact/97KcVYbKiDR1ARVRtK3zby): le righe "Proposta: Bilancia con il piano" e "Colori dei dischi ed etichetta da compilare" sono il riferimento. Le altre righe sono le direzioni scartate. Dove canvas e documento divergono, vale il documento.

Le decisioni prese da Enrico sono indicate come tali. Il resto è una proposta di progetto, segnata *(scelta di progetto)*, che si può cambiare senza riaprire la discussione.

## Perché

FatSecret è fatta per chiunque voglia mangiare meglio. Tara è fatta per un bodybuilder che pesa tutto, ragiona in grammi di proteine e segue un piano. Dagli screen e dalle parole di Enrico:

- troppi tocchi per ripetere ogni giorno le stesse azioni;
- scanner del codice a barre e riepilogo della giornata o della settimana difficili da raggiungere;
- solo 4 pasti fissi (colazione, pranzo, cena, snack), con gli integratori del pre e post allenamento ammassati negli snack;
- obiettivi in percentuale (60/20/20), mentre lui ragiona in grammi (240 g di proteine);
- riepilogo sparso tra il fondo del diario, tre tab di report e la pagina obiettivi;
- grafico del peso illeggibile: scala che parte da lontano, riempimento rosso, pesate schiacciate in una riga, i 13,5 kg persi non si vedono;
- tab Community mai usata;
- tendine dei pasti scomode, soprattutto per fare lo screen della giornata, visto che non si può esportare.

E sul modo di usarla: **pesa un ingrediente alla volta e lo registra subito**, poi passa al successivo. Ogni giorno segue un **piano**, con pasti, alimenti e grammi decisi e diversi tra giorno di allenamento e di riposo.

### Obiettivi

1. **Il piano al centro.** La giornata parte già compilata dal piano del tipo di giornata; registrare vuol dire confermare, non cercare e digitare.
2. **Il ciclo pesa-registra-continua** in pochissimi tocchi: tastierino dei grammi in primo piano, ultima quantità proposta, "Aggiungi e continua".
3. **Tutto a un tocco**: ricerca e scanner sempre in basso; il riepilogo è la prima cosa che si vede.
4. **Personalizzazione fino ai dettagli**: numero e nomi dei pasti, tipi di giornata, obiettivi in grammi, colori dei macro.
5. **Una giornata leggibile in un colpo d'occhio**, e condivisibile come immagine.

### Non obiettivi

- Funzioni social o community.
- Gamification: serie, traguardi, badge.
- Piani alimentari generati dall'app: il piano lo scrive l'utente (o il suo coach).

### Anti-obiettivi

Cose che renderebbero il design un fallimento anche se funziona:

- **Sembrare una delle tante app fatte con l'AI e poco sforzo**: schede tutte uguali con la stessa ombra, sfumature decorative, nero con un solo verde acido, emoji al posto delle icone (decisione di Enrico).
- **Transizioni lente o scattose, disordine visivo**: Enrico nota subito la mancanza di cura (decisione di Enrico).
- Numeri che "ballano" quando cambiano, colonne non allineate.
- Un dato mancante mostrato come zero (principio 2 dei requisiti).

## Identità

**Bilancia, con i colori dei dischi e l'etichetta.** Tara è uno strumento di misura: il nome è la tara della bilancia. Tre segni la rendono riconoscibile, e il resto è silenzioso:

1. **Numeri da display**: cifre larghe (Archivo Expanded) e sempre a larghezza fissa, incolonnate. Un grammo che cambia non sposta niente.
2. **Barre graduate**: gli obiettivi sono righelli con tacche ogni 10% e un segno al traguardo, non anelli né torte.
3. **I colori dei dischi olimpici per i macro**: rosso per le proteine, blu per i carboidrati, giallo per i grassi, verde per le fibre, come i dischi da 25, 20, 15 e 10 kg. È una scelta di Enrico tra le varianti del canvas.

E un oggetto ricorrente: **l'etichetta nutrizionale**, sempre bianca con inchiostro nero anche nel tema scuro, come un foglio appoggiato sull'app. Serve per leggere i valori di un alimento, per inserirli a mano e per condividere la giornata.

Principi per ogni schermata:

- **I grammi prima di tutto.** Il peso è il dato più grande della riga; calorie e proteine seguono.
- **Allineato o niente.** Colonne fisse per peso, kcal e proteine, uguali in ogni lista.
- **Un colore significa qualcosa.** I colori servono solo ai macro e agli stati; le azioni sono bianco gesso nel tema scuro e inchiostro in quello chiaro.
- **Ogni animazione risponde a un gesto** e dice cosa è cambiato. Nessuna animazione decorativa.
- **Mai solo il colore.** Ogni macro ha anche la sua etichetta; ogni stato ha anche un segno (testo, bordo, icona).

## Token

I token vivono in un solo file del codice (`src/theme/`, vedi Implementazione) e nessun componente usa valori scritti a mano.

### Colori

Il tema scuro è il predefinito; il chiaro segue l'impostazione del telefono o la scelta dell'utente *(scelta di progetto)*. I contrasti sono calcolati sul colore della superficie: testo e macro ≥ 4,5:1.

| Token | Scuro | Chiaro | Uso |
| --- | --- | --- | --- |
| `fondo` | `#15191C` | `#F3F5F7` | sfondo delle schermate |
| `superficie` | `#1E2328` | `#FFFFFF` | pannelli, foglio di inserimento |
| `rialzo` | `#283037` | `#E8ECEF` | tasti, selezioni, campi |
| `bordo` | `#2C343A` | `#D5DBE0` | separatori leggeri |
| `bordoForte` | `#39424A` | `#B8C1C8` | contorni, linea di base delle barre (decorativa) |
| `testo` | `#ECEFF1` | `#14191D` | testo principale, numeri |
| `testoSecondario` | `#A3ADB5` | `#4D5860` | unità, didascalie, valori secondari, tacche delle barre |
| `testoSpento` | `#5E6A73` | `#8A949C` | solo elementi disattivati, mai informazioni |
| `azione` | `#ECEFF1` | `#14191D` | pulsanti principali (testo `fondo`) |
| `proteine` | `#FF6B70` | `#D7263D` | |
| `carboidrati` | `#6CB0FF` | `#1A5CC8` | |
| `grassi` | `#FFC93C` | `#8C6200` | |
| `fibre` | `#3DC47E` | `#187A45` | |
| `daControllare` | `#FFB224` | `#8F5E00` | campi a bassa confidenza, valori da verificare |
| `errore` | `#FF9466` | `#B5470F` | sempre con icona e testo |

Le proteine, i carboidrati e i grassi hanno luminosità diverse (non solo tinte diverse), così restano distinguibili anche per chi non vede bene i colori. Sulle tavole del canvas il blu è `#4C9AFF`: il valore corretto è quello della tabella.

**Etichetta** (uguale nei due temi): carta `#FFFFFF`, inchiostro `#000000`, testo secondario `#4D545A`, righe nere da 1, 3 e 6–8 px come sulle etichette vere.

**Colori personalizzabili** (decisione di Enrico): dalle impostazioni l'utente può cambiare i colori dei macro. I valori della tabella sono i predefiniti. L'app rifiuta un colore che non raggiunge 4,5:1 sulla superficie del tema, oppure ne propone la variante più chiara o più scura che lo raggiunge *(scelta di progetto)*.

### Carattere

Un'unica famiglia: **Archivo** (licenza OFL), in più larghezze. La larghezza distingue i ruoli, non serve un secondo carattere.

| Ruolo | Carattere | Dimensione / interlinea | Uso |
| --- | --- | --- | --- |
| `lettura` | Archivo Expanded ExtraBold | 72 / 76 | grammi nel foglio di inserimento |
| `titolo` | Archivo SemiExpanded ExtraBold | 30 / 34 | titolo della schermata |
| `numeroGrande` | Archivo Expanded Bold | 26 / 28 | numeri grandi (peso del giorno) |
| `cifra` | Archivo Expanded Bold | 17 / 22 | il registrato negli obiettivi di Oggi ("**49** / 240"), totali compatti |
| `sezione` | Archivo Bold | 17 / 22 | nomi dei pasti, titoli di sezione |
| `corpo` | Archivo Regular | 15 / 20 | testo, nomi degli alimenti |
| `corpoForte` | Archivo SemiBold | 15 / 20 | etichette dei macro, pulsanti |
| `numero` | Archivo SemiExpanded SemiBold | 15 / 20 | grammi e valori nelle righe |
| `didascalia` | Archivo Regular | 13 / 18 | fonti, note |
| `minimo` | Archivo Regular | 12 / 16 | intestazioni di colonna; mai più piccolo di così |

- Tutti i numeri usano le cifre tabellari (`fontVariant: ['tabular-nums']`).
- Le cifre decimali usano la virgola; le migliaia non hanno separatore fino a 9999 (si legge "4800 kcal", non "4.800").
- Il testo scala con la dimensione scelta nel telefono fino al 130% senza tagliare i numeri principali *(scelta di progetto)*.

### Spazi, raggi, dimensioni

- **Griglia da 4**: spazi 4, 8, 12, 16, 20, 24, 32. Margine laterale delle schermate 16; dentro i pannelli 16.
- **Raggi**: etichetta 4 (è un foglio), campi e tasti 10–12, pulsanti e pannelli 14–16, foglio di inserimento 24 in alto.
- **Tocchi**: ogni elemento toccabile è almeno 44 × 44; i tasti del tastierino 54 di altezza; i pulsanti principali 52.
- **Colonne delle righe**: nome flessibile, peso 56, kcal 44, proteine 44, con 8 di spazio. Le stesse in ogni lista.
- **Righe degli obiettivi** (Oggi, Piano): nome del macro 92, barra flessibile, valore 84, con 8 di spazio; l'acqua usa la stessa colonna del nome.

### Movimento e vibrazione

| Token | Durata | Curva | Uso |
| --- | --- | --- | --- |
| `pressione` | 100 ms | standard | un tasto o una riga si abbassa leggermente (scala 0,97) |
| `rapido` | 160 ms | standard | cambio di stato, interruttori, totali che si aggiornano |
| `foglio` | 240 ms in entrata, 200 ms in uscita | entrata / uscita | il foglio di inserimento sale dal basso |
| `voce` | 200 ms | standard | una voce entra nel pasto: compare e la riga si apre in altezza |
| `attesa` | 320 ms per passo, all'infinito | lineare | attesa di durata ignota: il tratteggio della barra di avanzamento scorre di un passo; fermo con il movimento ridotto |

- Curve: standard `cubic-bezier(0.2, 0, 0, 1)`, uscita `cubic-bezier(0.4, 0, 1, 1)`.
- Le animazioni girano sul thread dell'interfaccia (Reanimated), mai sul thread JavaScript, per non scattare.
- I totali cambiano con un passaggio breve (`rapido`), senza contatori che girano.
- **Movimento ridotto** (impostazione del telefono): niente spostamenti, solo dissolvenze brevi.
- **Vibrazione**: un tocco leggero a ogni tasto del tastierino; una conferma quando una voce viene aggiunta. Disattivabile dalle impostazioni *(scelta di progetto)*.

### Icone

Linee da 2 px su una griglia di 24, estremità arrotondate, disegnate come set unico. Mai emoji. Sempre con un'etichetta accessibile quando sono sole.

## Componenti

| Componente | Cosa fa | Stati e regole |
| --- | --- | --- |
| **Intestazione delle tab** | al posto di quella nativa, uguale nelle quattro tab: titolo grande (`titolo`) a sinistra, azioni da 44 a destra; sotto, in secondario, un sottotitolo e un eventuale selettore a destra. Resta ferma sopra il contenuto che scorre | in Oggi: titolo "Oggi", "Ieri", "Domani" (sotto la data per esteso) o il giorno della settimana (sotto "19 novembre"); a destra le frecce "Giorno precedente" e "Giorno successivo", "Oggi" tra le due quando si guarda un altro giorno (si legge "…, torna a oggi") e il profilo; sotto, a destra della data, il tipo di giornata compatto |
| **Barra di ricerca** | "Cerca un alimento" e pulsante scanner, sempre in basso sopra le tab | lo scanner è il pulsante principale, quadrato, colore `azione` |
| **Riga di risultato** | nome su due righe al massimo, stato (solo "cotto"; il crudo è il predefinito) con sotto la cottura in secondo piano se c'è ("al vapore"), kcal e proteine per 100 g | tocco → scheda alimento |
| **Barra graduata** | avanzamento di un macro verso l'obiettivo | parte piena = registrato; tratteggio a colore pieno = previsto dal piano, detto anche dal lettore dello schermo; tacche ogni 10% in `testoSecondario` (≥ 3:1); segno al traguardo; oltre il 100% la parte in eccesso resta visibile oltre il segno |
| **Barra sottile** (obiettivi di Oggi e del Piano) | la barra graduata in una riga: 8 dp, binario `bordo` decorativo | stesse regole della barra graduata, ma le tacche ogni 10% sono tagli da 1 dp del colore della superficie (si vedono sulla parte piena senza appesantire il binario vuoto) e il segno del traguardo, in `testo`, sporge di 2 dp sopra e sotto. Il valore lo dice la riga: la barra è nascosta al lettore dello schermo |
| **Barra di avanzamento** | attese vere, come il primo download degli alimenti: stessa forma della barra graduata (binario, tacche ogni 10%), parte piena in `testo` | piena solo con una frazione misurata (byte ricevuti su un totale dichiarato); altrimenti tratteggio che scorre (`attesa`). Mai una percentuale stimata dal tempo; sotto, la fase in parole |
| **Voce di diario** | una riga allineata: nome, peso, kcal, proteine; nessuna scheda per riga, solo un separatore sottile sotto | **registrata**: testo pieno, peso in `numero`; **prevista**: bordo tratteggiato, testo attenuato, pulsante "Conferma" |
| **Intestazione del pasto** | nome e "2 di 3" in secondario; a destra la legenda delle colonne ("peso", "kcal", "prot.") allineata alle voci; in fondo al pasto "Aggiungi" discreto a sinistra e i totali del pasto (RF-45) nelle colonne di kcal e proteine | pasto vuoto → una riga sola, con il nome e a destra "Aggiungi" (e "Copia da ieri"); pasto tutto da piano (due o più previste, nessuna registrata) → le previste nelle colonne dentro un contenitore tratteggiato, con "Registra come da piano" in fondo (una voce sola si conferma toccandola); pasto completo → si chiude in una riga ("6 di 6, come da piano"), si riapre con un tocco; pasto archiviato (compare solo nei giorni con voci) → niente "Aggiungi" |
| **Foglio di inserimento** | alimento, crudo/cotto, lettura dei grammi, macro aggiornati mentre si digita, tastierino | "Ultima volta a cena: 500 g" (RF-42); "Aggiungi e continua" e "Aggiungi 500 g" |
| **Tastierino** | cifre 0–9, Tara, cancella | Tara: si digita il peso del contenitore, che viene sottratto e mostrato sopra la lettura ("tara 38 g"); in F1 si sceglie tra i contenitori salvati (es. vaschetta del meal prep) *(scelta di progetto)* |
| **Selettore del tipo di giornata** | in "Oggi" nell'intestazione, a destra della data: pillole compatte larghe quanto il testo, alte 36 con il tocco esteso a 44; nel Piano a tutta larghezza | mostra i tipi definiti dall'utente (RF-50), es. Allenamento e Riposo; con molti tipi va a capo sotto la data |
| **Etichetta** | valori per 100 g o per la quantità scelta, nell'ordine dell'etichetta europea | in sola lettura (scheda alimento, condivisione) o da compilare (inserimento manuale, lettura della foto) |
| **Riga dell'acqua** | l'ultima riga della scheda degli obiettivi di Oggi, dopo un separatore: "Acqua" con sotto "**1,25** / 3 l" nella colonna dei nomi, la barra sottile in `testo`, a destra le pillole "+250", "+500" (alte 36, tocco 44); "Annulla +500", che dice cosa annulla, nella riga sotto | una riga a 412 dp, due con "Annulla"; senza target niente barra e solo i litri; il lettore dello schermo dice "1,25 di 3 l" |
| **Grafico del peso** | in Andamento, ultimi 30 giorni: punti delle pesate in `testoSecondario`, linea della media a 7 giorni in `testo` (2 dp), asse zoomato sull'intervallo reale con i soli estremi scritti a sinistra, due righe sottili in alto e in basso, niente riempimento; sotto "Punti: pesate. Linea: media 7 giorni." | nessuna animazione; il lettore dello schermo legge il numero di pesate e il primo e l'ultimo valore, il dettaglio sta nell'elenco sotto; con una sola pesata c'è il punto senza linea |
| **Tastierino del peso** | lo stesso tastierino con la virgola al posto di Tara: 82,4, un decimale, tre cifre intere | la prima cifra sostituisce il peso proposto; "Salva 82,4 kg" |
| **Immagine della giornata** | la giornata come etichetta: totali contro il piano, pasti con le voci e i grammi, attribuzione di CIQUAL | si condivide dal menu di "Oggi" |

### L'etichetta da compilare

Idea di Enrico: quando si inserisce un alimento a mano, il modulo ha la forma della tabella stampata sulla confezione, così i valori si copiano riga per riga.

- Righe fisse, nell'ordine dell'etichetta europea: energia (kJ e kcal), grassi e di cui saturi, carboidrati e di cui zuccheri, fibre, proteine, sale.
- **"Aggiungi una voce"** inserisce le righe facoltative al loro posto, rientrate sotto la voce madre (decisione di Enrico): monoinsaturi, polinsaturi, trans e colesterolo sotto i grassi; polioli, amido e lattosio sotto i carboidrati; vitamine e minerali, caffeina e creatina in fondo.
- Sotto la tabella: il controllo delle calorie contro i macro (RF-15) e il sodio calcolato dal sale (RF-16).
- Lo stesso componente mostra i valori letti da una foto (RF-13, RF-14): i campi incerti sono evidenziati con `daControllare`.
- Fatta il 21/11 con le righe fisse *(scelte di progetto)*: sopra la tabella nome e marca affiancati, "Si pesa: Così com'è · Crudo · Cotto" (lo stato n.a. non si nomina) e "Per 100 g · Per 100 ml". "Avanti" sulla tastiera passa alla riga sotto; toccare un valore lo seleziona, per riscriverlo. Se manca una delle due energie si ricava dall'altra e il campo vuoto la suggerisce ("≈ 264"). Gli obbligatori (kcal o kJ, grassi, carboidrati, proteine) si segnalano solo dopo il primo "Salva"; un numero non valido o un "di cui" maggiore del totale subito, sotto la riga, in `erroreEtichetta` (l'errore del tema chiaro, perché la carta è bianca). Il controllo delle calorie avvisa in `daControllare` senza bloccare: polioli e alcol spostano il conto.

## Schermate

**Tab** *(scelta di progetto)*: **Oggi**, **Piano**, **Dispensa**, **Andamento**, ognuna con la sua intestazione (titolo grande, niente intestazione nativa: vedi "Intestazione delle tab"). Il profilo e le impostazioni si aprono dall'intestazione di Oggi. La Community non esiste.

- **Oggi**: intestazione con il giorno, le frecce, il profilo e il tipo di giornata; una scheda compatta degli obiettivi; i pasti; la barra di ricerca sopra le tab. Riferimento: "Proposta · Oggi dal piano" e "Bilancia con i colori dei dischi", con i colori dei token di questo documento *(fatta il 27/11, scelte di progetto)*.
  - **Scheda degli obiettivi**: in prima riga le kcal, "**1478** / 4800 kcal" con a destra "mancano 3322" (o "oltre di 20" in `errore`) e "previste 800" se c'è un piano; poi una riga per macro: nome colorato | barra sottile | "**49** / 240" (senza target "/ –"), con i g/kg sotto "Proteine"; la legenda "registrato · previsto" solo se c'è qualcosa di previsto (le tavole dicono "ancora da piano", ma il Linguaggio vuole "previsto"); in fondo l'acqua. Senza target: kcal e macro in una riga di quattro celle e l'invito al Piano. Lo stesso pannello è il "Totale del piano" nel Piano.
  - **Pasti**: vedi "Intestazione del pasto" e "Voce di diario"; "Copia la giornata di ieri" sta sotto la scheda quando la giornata è vuota.
- **Piano**: per ogni tipo di giornata, i pasti (numero e nomi liberi) con alimenti e grammi, e gli obiettivi.
- **Pasti della giornata** (Profilo, RF-40): una scheda compatta per pasto, senza etichette sopra i campi: nome e orario (96 px, "--:--") sulla stessa riga, sotto le azioni a destra (su, giù, "Archivia", elimina solo se il pasto è vuoto), tutte da 44 px; gli archiviati in fondo con "Ripristina".
- **Dispensa**: gli alimenti personali, le ricette e i pasti salvati. È il nome scelto da Enrico per il catalogo personale.
- **Andamento**: grafico del peso con l'asse zoomato sull'intervallo reale, punti delle pesate, linea della media mobile a 7 giorni e variazione settimanale (RF-70); niente riempimenti sotto la linea.
- **Scheda alimento**: nome, stato e cottura in secondo piano, etichetta con i valori per 100 g e la loro fonte; da qui il foglio di inserimento.

## Linguaggio

Verbi semplici e parole da cucina e da palestra. Un'azione mantiene lo stesso nome dall'inizio alla fine ("Aggiungi" produce "Aggiunto").

| Si scrive | Non si scrive |
| --- | --- |
| registrato, previsto | ancora da piano, pianificato |
| Dispensa, Salva nella dispensa | catalogo, database |
| Aggiungi e continua | Salva e nuovo |
| crudo, cotto | stato: raw |
| Cerca un alimento | Cerca nel database |
| peso, grammi | quantità (dove è chiaro che sono grammi) |

Lo stato "n.a." non compare nell'interfaccia: un alimento che si pesa così com'è non ha etichetta di stato *(scelta di progetto)*.

## Accessibilità

- Contrasto: testo e numeri ≥ 4,5:1, grafici e bordi informativi ≥ 3:1, calcolati sui token.
- Ogni controllo ha un'etichetta in italiano per il lettore dello schermo; i numeri si leggono con l'unità ("500 grammi").
- Nessuna informazione affidata solo al colore.
- Tocchi ≥ 44 × 44; movimento ridotto rispettato.

## Cambi ai requisiti

Il brainstorming cambia alcuni requisiti; vanno in `docs/requisiti.md` nello stesso commit di questo documento.

- **Piano alimentare per tipo di giornata** (nuovo, M, F1): per ogni tipo di giornata, pasti con alimenti e grammi; il diario del giorno parte dal piano con voci previste, confermabili una per una o per pasto, modificabili e sostituibili. Assorbe RF-130 (giornata pianificata, S, F2), che diventa parte dell'MVP *(scelta di progetto: Enrico lo ha indicato come la cosa più importante)*.
- **Colori dei macro personalizzabili** (nuovo, C, F1).
- **Immagine della giornata da condividere** (nuovo, S, F1).
- **Voci facoltative dell'etichetta** in RF-18: richiedono nuovi nutrienti nella tabella `nutrient` (migrazione), da fare con l'inserimento manuale.
- **"Fuori scopo"** resta "piani alimentari generati": il piano scritto dall'utente è in scopo.

## Implementazione

### Ora: step 5 della demo F0

Il gate F0 è "cerco albume, vedo i valori giusti, inserisco i grammi, funziona offline". Lo step 5 costruisce solo ciò che serve a quel percorso:

1. **Token** in `apps/mobile/src/theme/`: colori dei due temi, carattere, spazi, raggi, movimento; funzione di contrasto testata (servirà ai colori personalizzati).
2. **Carattere**: le istanze statiche di Archivo necessarie, incluse nell'app (React Native non gestisce bene i caratteri variabili).
3. **Componenti**: barra di ricerca, riga di risultato, barra graduata, etichetta in sola lettura, foglio di inserimento con tastierino e Tara.
4. **Tab** rinominate: Oggi, Piano, Dispensa, Andamento.
5. Test: la logica (contrasto, formattazione dei numeri, calcolo dei macro per quantità, tara) in `src/domain` con Vitest; le schermate verificate sull'emulatore e con Maestro.

### Step 7: ricerca, scheda e grammi in F0

- La barra di ricerca sta sopra le tab in tutte le schermate. Il pulsante scanner compare solo quando c'è lo scanner (F1): nessun pulsante finto.
- Il foglio di inserimento ha due modi. Nel **diario** (F1) ha il pasto, "Aggiungi e continua" e "Aggiungi 500 g". **Solo calcolo** (F0, decisione di Enrico) non ha il pasto né il pulsante secondario: "Usa 200 g" riporta l'etichetta della scheda a 200 g, e la scorciatoia dice "Ultima volta: 200 g" (nel diario "Ultima volta a cena: 500 g").
- *Dal diario in F1*: la scheda alimento non calcola più, aggiunge. Sopra "Aggiungi a Pranzo" c'è la fila dei pasti, con quello scelto in evidenza: quello toccato in Oggi ("Aggiungi" sotto il pasto) oppure, dalla barra di ricerca, quello con l'orario più vicino. "Aggiungi e continua" torna ai risultati per il prossimo alimento dello stesso pasto; "Aggiungi" torna a Oggi. Una voce toccata in Oggi apre lo stesso foglio con "Elimina" e "Salva 250 g", senza la scorciatoia "Ultima volta", che lì sarebbe la voce stessa; il foglio copre anche ricerca e tab.
- *Ricette (F1, 7a)*: nella Dispensa "Nuovo alimento" e "Nuova ricetta" stanno affiancati (il secondo è secondario), poi le sezioni "Ricette" e "I tuoi alimenti"; la riga della ricetta ha sotto il nome "porzione 60 g". La scheda di una ricetta mostra gli ingredienti a crudo, due etichette ("Per porzione", se la resa è a porzioni, e "Per 100 g"), "Duplica" in fondo e, con la resa a peso, il campo "Peso da cotto di oggi (g)". Nel foglio dei grammi le scorciatoie ("1 porzione · 60 g") hanno la stessa forma tratteggiata di "Ultima volta" e vanno a capo accanto a lei; per i prodotti in ml il foglio dice "ml" e "millilitri".
- In Oggi un pasto senza voci mostra solo "Aggiungi", nella riga del nome: il bordo tratteggiato resta riservato alle voci previste dal piano.
- *Piano in F1*: il Piano ha in alto lo stesso selettore del tipo di giornata di Oggi; sotto, per il tipo scelto, la scheda dei target, il totale del piano (stesso pannello degli obiettivi di Oggi) e i pasti con alimenti e grammi. "Aggiungi" sotto un pasto cerca un alimento in modalità piano: la scheda dice "Aggiungi al piano: Pranzo" e torna al Piano.
- In Oggi le voci previste sono quelle del piano del tipo di giornata non ancora confermate quel giorno, da oggi in avanti: i giorni passati non le mostrano, così cambiare il piano non riscrive il passato. "Conferma" usa i grammi del piano; un tocco sulla riga apre il foglio con "Conferma 200 g" per cambiarli; "Registra come da piano" compare con almeno due voci previste nel pasto.
- Il selettore crudo/cotto compare solo se il nome ha esattamente un crudo e un cotto: con più preparazioni dello stesso nome si sceglierebbe a caso.
- Con il foglio aperto la scheda dietro è nascosta al lettore dello schermo; pulsanti e scorciatoie si leggono in grammi ("Usa 200 grammi").
- La scheda alimento nasconde l'intestazione nativa, così il foglio copre tutta la schermata; in alto c'è un pulsante "Indietro".

### Oggi come nelle tavole (27/11)

Il passaggio di design di Oggi (vedi "Schermate") cambia alcuni testi che i flussi Maestro leggono:

- la data non è più un'etichetta tra le frecce: il titolo dice "Oggi" o "Ieri", e "…, torna a oggi" è il pulsante "Oggi" tra le frecce; "Giorno precedente", "Giorno successivo", "Profilo", "Allenamento"/"Riposo" e l'id `diario` restano, e l'intestazione resta ferma, quindi è sempre in vista;
- l'acqua sta nella scheda degli obiettivi: gli id `acqua`, `acqua-<ml>`, `acqua-annulla`, `acqua-totale` restano, e `acqua.yaml` legge ancora "0 di 3 l", il testo per il lettore dello schermo (a vista "0 / 3 l");
- il totale del pasto si legge "Totale Pranzo: 96 kcal, 21,8 grammi di proteine" (prima "96 kcal" sull'intestazione del pasto);
- `previste.yaml` aggiunge un pasto tutto da piano (Cena con due voci) e "Registra Cena come da piano"; `navigazione.yaml` fotografa le intestazioni di Piano, Dispensa e Andamento.

### Dopo

Piano, voci previste, immagine della giornata, etichetta da compilare con le voci facoltative, grafico del peso, colori personalizzati: entrano con i loro requisiti in F1, usando i componenti e i token di questo documento.

### Lasciato a chi costruisce

- Scelta delle librerie compatibili con Expo SDK 58 (Reanimated, Haptics, SVG per icone e tratteggi), verificando la documentazione della versione.
- Verifica che Archivo abbia le cifre tabellari (`tnum`) e le istanze Expanded e SemiExpanded; se mancano, i numeri vanno in contenitori a larghezza fissa allineati a destra, così il principio "i numeri non ballano" resta valido.
- Struttura interna dei componenti e dei test, purché i token restino l'unica fonte dei valori visivi.
- Dettagli del tratteggio delle barre e della forma delle icone, entro le regole sopra.
