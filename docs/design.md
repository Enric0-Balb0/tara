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
| `numeroGrande` | Archivo Expanded Bold | 26 / 28 | numeri del riepilogo |
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

### Movimento e vibrazione

| Token | Durata | Curva | Uso |
| --- | --- | --- | --- |
| `pressione` | 100 ms | standard | un tasto o una riga si abbassa leggermente (scala 0,97) |
| `rapido` | 160 ms | standard | cambio di stato, interruttori, totali che si aggiornano |
| `foglio` | 240 ms in entrata, 200 ms in uscita | entrata / uscita | il foglio di inserimento sale dal basso |
| `voce` | 200 ms | standard | una voce entra nel pasto: compare e la riga si apre in altezza |

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
| **Barra di ricerca** | "Cerca un alimento" e pulsante scanner, sempre in basso sopra le tab | lo scanner è il pulsante principale, quadrato, colore `azione` |
| **Riga di risultato** | nome, stato (solo "cotto"; il crudo è il predefinito) con sotto la cottura in secondo piano se c'è ("al vapore"), kcal e proteine per 100 g | tocco → scheda alimento |
| **Barra graduata** | avanzamento di un macro verso l'obiettivo | parte piena = registrato; tratteggio a colore pieno = previsto dal piano, detto anche dal lettore dello schermo; tacche ogni 10% in `testoSecondario` (≥ 3:1); segno al traguardo; oltre il 100% la parte in eccesso resta visibile oltre il segno |
| **Voce di diario** | una riga allineata: nome, peso, kcal, proteine | **registrata**: testo pieno; **prevista**: bordo tratteggiato, testo attenuato, pulsante "Conferma" |
| **Intestazione del pasto** | nome, "2 di 3", totali nelle stesse colonne delle voci | pasto completo → si chiude in una riga ("6 di 6, come da piano"); si riapre con un tocco |
| **Foglio di inserimento** | alimento, crudo/cotto, lettura dei grammi, macro aggiornati mentre si digita, tastierino | "Ultima volta a cena: 500 g" (RF-42); "Aggiungi e continua" e "Aggiungi 500 g" |
| **Tastierino** | cifre 0–9, Tara, cancella | Tara: si digita il peso del contenitore, che viene sottratto e mostrato sopra la lettura ("tara 38 g"); in F1 si sceglie tra i contenitori salvati (es. vaschetta del meal prep) *(scelta di progetto)* |
| **Selettore del tipo di giornata** | in alto in "Oggi" | mostra i tipi definiti dall'utente (RF-50), es. Allenamento e Riposo |
| **Etichetta** | valori per 100 g o per la quantità scelta, nell'ordine dell'etichetta europea | in sola lettura (scheda alimento, condivisione) o da compilare (inserimento manuale, lettura della foto) |
| **Immagine della giornata** | la giornata come etichetta: totali contro il piano, pasti con le voci e i grammi, attribuzione di CIQUAL | si condivide dal menu di "Oggi" |

### L'etichetta da compilare

Idea di Enrico: quando si inserisce un alimento a mano, il modulo ha la forma della tabella stampata sulla confezione, così i valori si copiano riga per riga.

- Righe fisse, nell'ordine dell'etichetta europea: energia (kJ e kcal), grassi e di cui saturi, carboidrati e di cui zuccheri, fibre, proteine, sale.
- **"Aggiungi una voce"** inserisce le righe facoltative al loro posto, rientrate sotto la voce madre (decisione di Enrico): monoinsaturi, polinsaturi, trans e colesterolo sotto i grassi; polioli, amido e lattosio sotto i carboidrati; vitamine e minerali, caffeina e creatina in fondo.
- Sotto la tabella: il controllo delle calorie contro i macro (RF-15) e il sodio calcolato dal sale (RF-16).
- Lo stesso componente mostra i valori letti da una foto (RF-13, RF-14): i campi incerti sono evidenziati con `daControllare`.

## Schermate

**Tab** *(scelta di progetto)*: **Oggi**, **Piano**, **Dispensa**, **Andamento**. Il profilo e le impostazioni si aprono dall'intestazione di Oggi. La Community non esiste.

- **Oggi**: selettore del tipo di giornata, barre degli obiettivi in grammi (registrato e previsto), pasti del piano con voci registrate e previste, barra di ricerca. Riferimento: "Proposta · Oggi dal piano" con i colori dei dischi.
- **Piano**: per ogni tipo di giornata, i pasti (numero e nomi liberi) con alimenti e grammi, e gli obiettivi.
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
- Il selettore crudo/cotto compare solo se il nome ha esattamente un crudo e un cotto: con più preparazioni dello stesso nome si sceglierebbe a caso.
- Con il foglio aperto la scheda dietro è nascosta al lettore dello schermo; pulsanti e scorciatoie si leggono in grammi ("Usa 200 grammi").
- La scheda alimento nasconde l'intestazione nativa, così il foglio copre tutta la schermata; in alto c'è un pulsante "Indietro".

### Dopo

Piano, voci previste, immagine della giornata, etichetta da compilare con le voci facoltative, grafico del peso, colori personalizzati: entrano con i loro requisiti in F1, usando i componenti e i token di questo documento.

### Lasciato a chi costruisce

- Scelta delle librerie compatibili con Expo SDK 58 (Reanimated, Haptics, SVG per icone e tratteggi), verificando la documentazione della versione.
- Verifica che Archivo abbia le cifre tabellari (`tnum`) e le istanze Expanded e SemiExpanded; se mancano, i numeri vanno in contenitori a larghezza fissa allineati a destra, così il principio "i numeri non ballano" resta valido.
- Struttura interna dei componenti e dei test, purché i token restino l'unica fonte dei valori visivi.
- Dettagli del tratteggio delle barre e della forma delle icone, entro le regole sopra.
