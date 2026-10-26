# Design system dell'app (step 5 della demo F0) — piano di implementazione

> **Per chi esegue:** sotto-skill richiesta: superpowers:subagent-driven-development (consigliata) o superpowers:executing-plans, un task alla volta. I passi usano le caselle (`- [ ]`) per tenere traccia.

**Obiettivo:** portare nell'app Expo i token, il carattere e i componenti di `docs/design.md` che servono al percorso della demo F0 (cerca, scheda, grammi), e registrare in `docs/requisiti.md` i cambi decisi nel brainstorming.

**Architettura:** tutta la logica (contrasto, formattazione dei numeri, inserimento dei grammi con la tara, geometria delle barre, righe dell'etichetta) è TypeScript puro in `src/domain` e `src/theme`, testato con Vitest. I componenti React Native sono sottili: leggono i token da `useTheme()` e la logica dal dominio. Si verificano sull'emulatore con una schermata di catalogo dei componenti, visibile solo in sviluppo, e con un flusso Maestro.

**Tecnologie:** Expo SDK 58, React Native 0.88, Expo Router, Vitest, expo-font (caricamento a runtime), react-native-reanimated + react-native-worklets, react-native-svg, expo-haptics, fontTools (via `uvx`) per le istanze di Archivo, Maestro.

**Spec:** `docs/design.md` (approvato da Enrico il 26/10/2026). Bozze: https://claude.ai/artifact/97KcVYbKiDR1ARVRtK3zby

## Vincoli globali

- I valori visivi stanno solo in `src/theme/`: nessun colore, dimensione, durata o famiglia di caratteri scritti a mano nei componenti.
- Nomi dei token nel codice in inglese, come da convenzione; corrispondenza con il documento: fondo `background`, superficie `surface`, rialzo `raised`, bordo `border`, bordoForte `borderStrong`, testo `text`, testoSecondario `textSecondary`, testoSpento `textDisabled`, azione `action`, proteine `protein`, carboidrati `carbs`, grassi `fat`, fibre `fiber`, daControllare `review`, errore `error`.
- Contrasto: testo e macro ≥ 4,5:1 sulla `surface` del tema; grafici e bordi informativi ≥ 3:1.
- Numeri: cifre tabellari (`fontVariant: ['tabular-nums']`), virgola decimale, nessun separatore delle migliaia fino a 9999. Un valore mancante si mostra `–`, mai `0`.
- Tocchi ≥ 44 × 44; tasti del tastierino alti 54; pulsanti principali alti 52.
- Movimento: `pressione` 100 ms (scala 0,97), `rapido` 160 ms, `foglio` 240 ms in entrata e 200 in uscita, `voce` 200 ms; curve standard `[0.2, 0, 0, 1]` e uscita `[0.4, 0, 1, 1]`; con movimento ridotto solo dissolvenze.
- Stato: nell'interfaccia compare solo "cotto"; crudo e n.a. non hanno etichetta.
- Testi dell'interfaccia in italiano, con il vocabolario di `docs/design.md` (registrato, previsto, Dispensa, Aggiungi e continua, Cerca un alimento).
- Dipendenze solo con `npx expo install`; lockfile committato.
- Commit in inglese, Conventional Commits, scope `mobile` o `docs`; nessun trailer di attribuzione AI (regola del repository).
- Prima di ogni commit: `npm run typecheck`, `npm run lint`, `npm run test:coverage` (soglia 80%) in `apps/mobile`.

## Punti da presidiare

Situazioni che lo spec implica ma che nessun test coprirebbe da solo; ognuna ha il suo test nel task indicato.

1. **Tara maggiore o uguale al peso lordo**: il netto vale 0, "Aggiungi" è disattivato e compare "La tara supera il peso" (Task 4, Task 9).
2. **Valori nutrizionali mancanti** (es. albume senza zuccheri in CIQUAL): l'etichetta e le righe mostrano `–`, non `0` (Task 3, Task 5).
3. **Valori oltre l'obiettivo**: la barra mostra l'eccesso oltre il segno del traguardo; senza obiettivo niente segno (Task 5).
4. **Nomi lunghi** come "Insalata di pasta al prosciutto crudo, formaggio e verdure crude, con salsa, pronta": una riga con puntini nelle liste, al massimo due righe nel foglio (Task 8, Task 9).
5. **Testo ingrandito al 130%**: lettura, righe e tastierino restano interi su 390 × 844 (Task 10).

---

## PR 1: requisiti, token e logica (solo TypeScript, nessuna dipendenza nativa)

Branch `feat/rf-41-design-system-base`.

### Task 1: requisiti e riferimenti al documento di design

**File:**
- Modifica: `docs/requisiti.md`
- Modifica: `CLAUDE.md`, `apps/mobile/CLAUDE.md`, `docs/handoff.md`
- Aggiungi: `docs/design.md` (già scritto, non committato), questo piano

**Interfacce:** nessuna.

- [ ] **Passo 1:** in `docs/requisiti.md`:
  - riscrivi RF-130 come "Piano alimentare per tipo di giornata: pasti con alimenti e grammi; il diario del giorno parte dal piano con voci previste, confermabili una per una o per pasto, modificabili e sostituibili." | M | F1. Spostalo nella sezione Diario, mantenendo l'ID;
  - aggiungi RF-47 "Immagine della giornata come etichetta (totali contro il piano, pasti con voci e grammi, attribuzione delle fonti) da condividere." | S | F1;
  - aggiungi RF-59 "Colori dei macro personalizzabili; un colore sotto 4,5:1 di contrasto viene corretto." | C | F1;
  - in RF-18 aggiungi "con le voci facoltative dell'etichetta (monoinsaturi, polinsaturi, trans, colesterolo, polioli, amido, lattosio, vitamine e minerali, caffeina, creatina), che richiedono nuovi nutrienti";
  - nel glossario aggiungi Piano, Voce prevista e Dispensa;
  - nella roadmap F1 aggiungi "piano alimentare per tipo di giornata";
  - fuori scopo resta "piani alimentari generati".
- [ ] **Passo 2:** aggiungi `docs/design.md` all'elenco "Leggi prima" di `CLAUDE.md`. In `apps/mobile/CLAUDE.md` aggiungi una regola: "Stile solo dai token di `src/theme/` e dai componenti di `src/components/`; specifica in `docs/design.md`". In `docs/handoff.md` aggiungi il design come passo della F0.
- [ ] **Passo 3:** commit: `docs: add the design system spec and the meal plan requirements`.

### Task 2: colori e contrasto

**File:**
- Crea: `apps/mobile/src/domain/contrast.ts`, `apps/mobile/src/domain/contrast.test.ts`
- Crea: `apps/mobile/src/theme/colors.ts`, `apps/mobile/src/theme/colors.test.ts`
- Modifica: `apps/mobile/vitest.config.ts` (coverage su `src/domain/**/*.ts` e `src/theme/**/*.ts`, escluso `src/theme/useTheme.ts`)

**Interfacce:**
- Produce: `contrastRatio(a: string, b: string): number`; `ensureContrast(color: string, background: string, min?: number): string` (`min` predefinito 4.5; restituisce un esadecimale `#RRGGBB` maiuscolo); `type Scheme = 'dark' | 'light'`; `type ColorToken` (i 15 nomi dei Vincoli globali); `colors: Record<Scheme, Record<ColorToken, string>>`; `labelColors = { paper: '#FFFFFF', ink: '#000000', secondary: '#4D545A' }`; `MACRO_TOKENS = ['protein', 'carbs', 'fat', 'fiber'] as const`.

- [ ] **Passo 1: test che falliscono.** In `contrast.test.ts`:
  - `contrastRatio('#000000', '#FFFFFF')` vale `21`;
  - `contrastRatio('#FFFFFF', '#FFFFFF')` vale `1`;
  - l'ordine degli argomenti non conta;
  - `ensureContrast('#FF6B70', '#1E2328')` restituisce `'#FF6B70'` invariato, perché passa già;
  - `ensureContrast('#FFC93C', '#FFFFFF')` restituisce un colore con `contrastRatio(…, '#FFFFFF') >= 4.5`;
  - accetta esadecimali minuscoli e con 3 cifre (`'#fff'`).

  In `colors.test.ts`:
  - ogni tema ha tutti i 15 token con i valori della tabella di `docs/design.md`;
  - `text`, `textSecondary`, `protein`, `carbs`, `fat`, `fiber`, `review` ed `error` hanno contrasto ≥ 4,5 su `surface` e su `background` in entrambi i temi;
  - `protein`, `carbs`, `fat` e `fiber` hanno contrasto ≥ 3 su `raised`, il binario delle barre, in entrambi i temi;
  - nel tema scuro proteine, carboidrati e grassi hanno luminanze relative che differiscono di almeno 0,05 a coppie;
  - `labelColors.secondary` ha contrasto ≥ 4,5 su `labelColors.paper`.
- [ ] **Passo 2:** `npm test -- contrast colors` fallisce: moduli inesistenti.
- [ ] **Passo 3:** implementa. Luminanza relativa e rapporto secondo WCAG 2.x. Per `ensureContrast`: se il colore passa, restituiscilo; altrimenti mescolalo verso il bianco se la luminanza dello sfondo è < 0,5, verso il nero se no, a passi del 5% fino al 100%, e restituisci il primo che raggiunge `min`.
- [ ] **Passo 4:** `npm run test:coverage` passa.
- [ ] **Passo 5:** commit: `feat(mobile): add color tokens with contrast checks`.

### Task 3: formattazione dei numeri

**File:**
- Crea: `apps/mobile/src/domain/format.ts`, `apps/mobile/src/domain/format.test.ts`

**Interfacce:**
- Produce: `MISSING = '–'`; `formatNumber(value: number | null, decimals: number): string`; `type AmountKind = 'grams' | 'kcal' | 'kj' | 'macro' | 'salt'` (decimali rispettivamente 0, 0, 0, 1, 2); `formatAmount(value: number | null, kind: AmountKind): string`.

- [ ] **Passo 1: test che falliscono.**
  - `formatNumber(10.9, 1)` → `'10,9'`;
  - `formatNumber(4800, 0)` → `'4800'`;
  - `formatNumber(12500, 0)` → `'12 500'` (spazio stretto indivisibile sopra 9999);
  - `formatNumber(0.45, 1)` → `'0,5'`;
  - `formatNumber(null, 1)` → `'–'`;
  - `formatAmount(0, 'macro')` → `'0,0'` (lo zero vero resta zero);
  - `formatAmount(0.011, 'salt')` → `'0,01'`;
  - `formatAmount(null, 'kcal')` → `'–'`.
- [ ] **Passo 2:** i test falliscono.
- [ ] **Passo 3:** implementa senza `Intl` (Hermes non garantisce i dati di `it-IT`): `toFixed`, virgola, gruppi di migliaia solo se la parte intera ha più di 4 cifre.
- [ ] **Passo 4:** i test passano.
- [ ] **Passo 5:** commit: `feat(mobile): format amounts the Italian way without hiding missing values`.

### Task 4: inserimento dei grammi con la tara

**File:**
- Crea: `apps/mobile/src/domain/gramEntry.ts`, `apps/mobile/src/domain/gramEntry.test.ts`

**Interfacce:**
- Produce:
  - `type DigitKey = '0' | … | '9'` e `type KeypadKey = DigitKey | 'tare' | 'delete'`;
  - `interface GramEntry { gross: string; tare: string; editing: 'weight' | 'tare'; replaceNext: boolean }`;
  - `MAX_DIGITS = 5`;
  - `startEntry(lastGrams?: number): GramEntry`;
  - `pressKey(entry: GramEntry, key: KeypadKey): GramEntry`;
  - `netGrams(entry: GramEntry): number`;
  - `tareExceedsWeight(entry: GramEntry): boolean`;
  - `canAdd(entry: GramEntry): boolean`.

- [ ] **Passo 1: test che falliscono.**
  - `startEntry()` → `{ gross: '', tare: '', editing: 'weight', replaceNext: false }`;
  - `startEntry(500)` → `gross: '500'`, `replaceNext: true`;
  - da `startEntry(500)`, `'3'` → `gross: '3'` (la prima cifra sostituisce l'ultima quantità proposta);
  - da `startEntry(500)`, `'delete'` → `gross: ''`;
  - `'0'` su un campo vuoto viene ignorato;
  - oltre 5 cifre le pressioni vengono ignorate (`'99999'` resta tale);
  - `'delete'` toglie l'ultima cifra;
  - `'tare'` passa a `editing: 'tare'`, e le cifre successive vanno in `tare`; un secondo `'tare'` torna a `'weight'`;
  - con `gross '538'` e `tare '38'`, `netGrams` → `500`;
  - con `gross '30'` e `tare '38'`: `netGrams` → `0`, `tareExceedsWeight` → `true`, `canAdd` → `false`;
  - con `gross ''`, `canAdd` → `false`.
- [ ] **Passo 2:** i test falliscono.
- [ ] **Passo 3:** implementa come funzioni pure che restituiscono un nuovo oggetto.
- [ ] **Passo 4:** i test passano.
- [ ] **Passo 5:** commit: `feat(mobile): model gram entry with tare on the keypad`.

### Task 5: barre graduate ed etichetta

**File:**
- Crea: `apps/mobile/src/domain/ruler.ts`, `apps/mobile/src/domain/ruler.test.ts`
- Crea: `apps/mobile/src/domain/label.ts`, `apps/mobile/src/domain/label.test.ts`
- Crea: `apps/mobile/src/domain/food.ts` (solo tipi)

**Interfacce:**
- Consuma: `formatAmount`, `AmountKind` (Task 3).
- Produce:
  - `type FoodState = 'raw' | 'cooked' | 'not_applicable'` in `food.ts`, gli stessi valori del backend;
  - `interface RulerGeometry { logged: number; planned: number; target: number | null }`: frazioni del binario tra 0 e 1;
  - `rulerGeometry(logged: number, planned: number, target: number | null): RulerGeometry`;
  - `amountFor(per100: number | null, grams: number): number | null`;
  - `interface LabelRow { code: string; label: string; sub: boolean; value: string }`;
  - `labelRows(per100: Readonly<Record<string, number | null | undefined>>, grams?: number): LabelRow[]` (`grams` predefinito 100).

- [ ] **Passo 1: test che falliscono.** Per `rulerGeometry`:
  - `(120, 0, 240)` → `{ logged: 0.5, planned: 0, target: 1 }`;
  - `(49, 191, 240)` → `logged ≈ 0.204`, `planned ≈ 0.796`, `target: 1`;
  - `(300, 0, 240)` → `{ logged: 1, planned: 0, target: 0.8 }`: l'eccesso resta visibile e il segno si sposta;
  - `(50, 0, null)` → `{ logged: 1, planned: 0, target: null }`;
  - `(0, 0, null)` → tutto `0`, `target: null`;
  - `(0, 0, 240)` → `{ logged: 0, planned: 0, target: 1 }`.

  Per `amountFor`:
  - `(10.9, 500)` → `54.5`;
  - `(null, 500)` → `null`.

  Per `labelRows`, con i valori dei fiocchi d'avena di CIQUAL (`energy_kj 1550`, `energy_kcal 369`, `fat_g 7.82`, `sat_fat_g 1.37`, `carbs_g 57.7`, `sugars_g 1.04`, `fiber_g 11.2`, `protein_g 11.4`, `salt_g 0.011`):
  - le etichette sono, in ordine: Energia, Grassi, di cui saturi, Carboidrati, di cui zuccheri, Fibre, Proteine, Sale;
  - `sub` vale `true` solo per le due "di cui";
  - Energia vale `'1550 kJ / 369 kcal'`;
  - Grassi vale `'7,8 g'`;
  - Sale vale `'0,01 g'`;
  - con `grams` 50, Proteine vale `'5,7 g'`;
  - con `sugars_g` assente, la riga "di cui zuccheri" vale `'–'` (Punti da presidiare, 2).
- [ ] **Passo 2:** i test falliscono.
- [ ] **Passo 3:** implementa. Per `rulerGeometry`: la scala del binario è il massimo tra `target ?? 0` e `logged + planned`; se è 0, le frazioni valgono 0.
- [ ] **Passo 4:** `npm run test:coverage` passa. Apri la PR 1 con il modello del repository e aspetta la CI verde.
- [ ] **Passo 5:** commit: `feat(mobile): compute ruler geometry and nutrition label rows`.

---

## PR 2: carattere, componenti e navigazione

Branch `feat/rf-41-design-system-componenti`, da `main` dopo il merge della PR 1.

### Task 6: istanze di Archivo e token tipografici

**File:**
- Crea: `apps/mobile/scripts/fonts.mjs`
- Crea: `apps/mobile/assets/fonts/` (7 file `.ttf` generati e `OFL.txt`)
- Crea: `apps/mobile/src/theme/typography.ts`, `apps/mobile/src/theme/layout.ts`, `apps/mobile/src/theme/motion.ts`, `apps/mobile/src/theme/typography.test.ts`
- Modifica: `apps/mobile/src/app/_layout.tsx` (caricamento dei caratteri)
- Modifica: `apps/mobile/package.json` (script `fonts`)
- Modifica: `apps/mobile/vitest.config.ts` (esclude `src/theme/fonts.ts` dalla coverage)

**Interfacce:**
- Produce:
  - `FONT_FILES: Record<FontFamily, number>` (i `require` dei file);
  - `type FontFamily = 'Archivo-Regular' | 'Archivo-SemiBold' | 'Archivo-Bold' | 'ArchivoSemiExpanded-SemiBold' | 'ArchivoSemiExpanded-ExtraBold' | 'ArchivoExpanded-Bold' | 'ArchivoExpanded-ExtraBold'`;
  - `type TextRole = 'readout' | 'title' | 'bigNumber' | 'section' | 'body' | 'bodyStrong' | 'number' | 'caption' | 'minimum'`;
  - `textStyles: Record<TextRole, { fontFamily: FontFamily; fontSize: number; lineHeight: number }>` con i valori della tabella "Carattere" di `docs/design.md` (`readout` = lettura, `title` = titolo, `bigNumber` = numeroGrande, …);
  - in `layout.ts`: `space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24, xxxl: 32 }`, `radius = { label: 4, field: 10, key: 12, button: 14, panel: 16, sheet: 24 }`, `touch = { min: 44, key: 54, primary: 52 }`, `columns = { weight: 56, kcal: 44, protein: 44, gap: 8 }`;
  - in `motion.ts`: `durations = { press: 100, quick: 160, sheetIn: 240, sheetOut: 200, entry: 200 }`, `curves = { standard: [0.2, 0, 0, 1], exit: [0.4, 0, 1, 1] }`, `PRESS_SCALE = 0.97`.

- [ ] **Passo 1:** scrivi `scripts/fonts.mjs`. Lo script:
  - scarica `ofl/archivo/Archivo[wdth,wght].ttf` e `ofl/archivo/OFL.txt` da `google/fonts`, a un commit fissato nello script (trovalo con `gh api "repos/google/fonts/commits?path=ofl/archivo&per_page=1" --jq ".[0].sha"`), e ne verifica lo SHA-256;
  - genera le 7 istanze con `uvx --from fonttools fonttools varLib.instancer <src> wdth=<w> wght=<p> -o assets/fonts/<FontFamily>.ttf`. Coordinate: Regular 100/400, SemiBold 100/600, Bold 100/700, SemiExpanded 112.5/600 e 112.5/800, Expanded 125/700 e 125/800;
  - stampa se la tabella GSUB contiene `tnum`;
  - lavora in una cartella temporanea, come chiede la regola sui file scaricati.

  Aggiungi `"fonts": "node scripts/fonts.mjs"` a `package.json`.
- [ ] **Passo 2:** `npm run fonts`. Atteso: 7 file in `assets/fonts/` e la riga `tnum: presente`. Se `tnum` manca, annotalo nel README della PR. Il ripiego (contenitori a larghezza fissa) entra nel Task 8.
- [ ] **Passo 3: test che falliscono** in `typography.test.ts`:
  - ogni `TextRole` ha la famiglia, la dimensione e l'interlinea del documento (es. `readout` = `ArchivoExpanded-ExtraBold` 72/76; `minimum` = `Archivo-Regular` 12/16);
  - nessun ruolo è sotto i 12 punti.

  Poi implementa `typography.ts`, `layout.ts` e `motion.ts`. `FONT_FILES` sta in un file a parte, `src/theme/fonts.ts`, escluso dalla coverage, perché `require` di un `.ttf` non gira in Node.
- [ ] **Passo 4:** in `_layout.tsx`, `useFonts(FONT_FILES)`. Finché i caratteri non sono caricati restituisci `null`; un errore di caricamento non blocca l'app (si usa il carattere di sistema). Verifica sull'emulatore con la development build attuale: `expo-font` è già incluso.
- [ ] **Passo 5:** typecheck, lint, test:coverage. Commit: `feat(mobile): bundle Archivo width instances and typography tokens`.

### Task 7: dipendenze native e nuova development build

**File:**
- Modifica: `apps/mobile/package.json`, `apps/mobile/package-lock.json`

**Interfacce:** nessuna nuova.

- [ ] **Passo 1:** `npx expo install react-native-reanimated react-native-worklets react-native-svg expo-haptics`, poi `npm run doctor`. Atteso: nessun problema.
- [ ] **Passo 2:** chiedi a Enrico conferma prima di consumare una build EAS. Poi `npx eas-cli@latest build -p android --profile development` e `npx eas-cli@latest build:run -p android --latest`.
- [ ] **Passo 3:** verifica che l'app parta sull'emulatore con `npx expo start --dev-client`. Atteso: le quattro tab come prima, nessun errore di modulo nativo mancante.
- [ ] **Passo 4:** commit: `build(deps): add reanimated, svg and haptics for the design system`. Lo scope `deps` è ammesso.

### Task 8: primitive, icone e componenti di lettura

**File:**
- Crea: `apps/mobile/src/theme/useTheme.ts`
- Crea: `apps/mobile/src/components/TaraText.tsx`, `PressableScale.tsx`, `Icon.tsx`, `SearchDock.tsx`, `ResultRow.tsx`, `MacroRuler.tsx`, `NutritionLabel.tsx`

**Interfacce:**
- Consuma: `colors`, `labelColors` (Task 2); `formatAmount`, `MISSING` (Task 3); `rulerGeometry`, `labelRows` (Task 5); `textStyles`, `space`, `radius`, `touch`, `columns`, `durations`, `curves`, `PRESS_SCALE` (Task 6).
- Produce:
  - `useTheme(): { scheme: Scheme; colors: Record<ColorToken, string>; reduceMotion: boolean }`, con `useColorScheme` e `useReducedMotion` di Reanimated;
  - `<TaraText role: TextRole; color?: ColorToken; numberOfLines?: number>`, con cifre tabellari sempre attive;
  - `<PressableScale onPress accessibilityLabel? disabled? style?>`: la pressione dura `durations.press` e scala a `PRESS_SCALE`; con movimento ridotto cambia solo l'opacità;
  - `<Icon name: IconName; size?: number; color: ColorToken>`, con `IconName = 'search' | 'scan' | 'chevronLeft' | 'chevronRight' | 'chevronDown' | 'close' | 'delete' | 'check' | 'today' | 'plan' | 'pantry' | 'trend' | 'profile'`: tratti da 2 su griglia 24, le forme delle bozze;
  - `<SearchDock onSearch onScan>`;
  - `<ResultRow name state: FoodState kcalPer100 proteinPer100 onPress>`: mostra "cotto" solo se `state === 'cooked'`;
  - `<MacroRuler macro: 'protein' | 'carbs' | 'fat' | 'fiber' label logged planned? target unit>`: parte piena, tratteggio previsto (SVG), tacche ogni 10%, segno del traguardo; il cambio di larghezza dura `durations.quick`;
  - `<NutritionLabel per100 grams? title>`: carta e inchiostro sempre da `labelColors`, righe da `labelRows`, rientro per `sub`, righe nere spesse 6 sotto il titolo e 3 in fondo.
- [ ] **Passo 1:** implementa i componenti. Nessun valore visivo scritto a mano: un controllo in `npm run lint` lo fa rispettare. Aggiungi a `eslint.config.js` la regola `no-restricted-syntax` sui letterali esadecimali (`Literal[value=/^#[0-9A-Fa-f]{3,8}$/]`) per i file in `src/components` e `src/app`.
- [ ] **Passo 2:** nomi lunghi: `ResultRow` usa `numberOfLines={1}` sul nome (Punti da presidiare, 4). `ResultRow` e `MacroRuler` mostrano `MISSING` per i valori `null`. Ogni pulsante con sola icona ha un `accessibilityLabel` in italiano ("Scansiona un codice a barre", "Giorno precedente"…); le barre hanno un `accessibilityLabel` del tipo "Proteine 120 di 240 grammi".
- [ ] **Passo 3:** se il Task 6 ha trovato `tnum` assente, `TaraText` con ruolo `number`, `bigNumber` o `readout` accetta `minWidth` e allinea a destra.
- [ ] **Passo 4:** typecheck e lint verdi. Commit: `feat(mobile): add text, icon, search and nutrition label components`.

### Task 9: foglio di inserimento con tastierino

**File:**
- Crea: `apps/mobile/src/components/Keypad.tsx`, `apps/mobile/src/components/GramSheet.tsx`

**Interfacce:**
- Consuma: `GramEntry`, `startEntry`, `pressKey`, `netGrams`, `tareExceedsWeight`, `canAdd` (Task 4); `amountFor` (Task 5); i componenti del Task 8.
- Produce:
  - `<Keypad onKey(key: KeypadKey) tareActive: boolean>`: griglia 3 × 4 (1–9, Tara, 0, cancella), tasti alti `touch.key`, `Haptics.selectionAsync()` a ogni tasto;
  - `<GramSheet visible food: { name; state; per100: Record<string, number | null> } mealName lastGrams? onAdd(grams: number) onAddAndContinue(grams: number) onClose>`.
- [ ] **Passo 1:** `GramSheet` sale dal basso in `durations.sheetIn` con la curva `standard` e scende in `durations.sheetOut` con la curva `exit`; con movimento ridotto si dissolve e basta. Contiene, nell'ordine:
  - il pasto;
  - il nome, al massimo due righe;
  - il selettore Crudo/Cotto;
  - la lettura del netto in `readout`, con "tara N g" sopra quando la tara è maggiore di 0;
  - "Ultima volta a {mealName}: N g" se c'è `lastGrams`;
  - i quattro valori per la quantità (Proteine, Carboidrati, Grassi, Energia), da `amountFor` e `formatAmount`;
  - il tastierino;
  - "Aggiungi e continua" e "Aggiungi {N} g".
- [ ] **Passo 2:** con `tareExceedsWeight` vero, i due pulsanti sono disattivati e sotto la lettura compare "La tara supera il peso" in `error`, con l'icona (Punti da presidiare, 1). Con `canAdd` falso i pulsanti sono disattivati.
- [ ] **Passo 3:** la lettura ha `accessibilityLabel` "{N} grammi" e annuncia i cambi (`accessibilityLiveRegion="polite"`); il tasto cancella si chiama "Cancella una cifra" e Tara "Imposta la tara". Dopo "Aggiungi", `Haptics.notificationAsync(Success)`. Dopo "Aggiungi e continua" il foglio resta aperto e il tastierino riparte da `startEntry()`.
- [ ] **Passo 4:** typecheck e lint verdi. Commit: `feat(mobile): add the gram sheet with keypad and tare`.

### Task 10: tab, catalogo dei componenti e verifica sull'emulatore

**File:**
- Modifica: `apps/mobile/src/app/_layout.tsx`
- Rinomina: `src/app/alimenti.tsx` → `src/app/dispensa.tsx`, `src/app/progressi.tsx` → `src/app/andamento.tsx`
- Crea: `apps/mobile/src/app/piano.tsx`, `apps/mobile/src/app/design.tsx`
- Modifica: `apps/mobile/src/app/profilo.tsx`, `apps/mobile/src/app/index.tsx`
- Modifica: `apps/mobile/.maestro/navigazione.yaml`
- Crea: `apps/mobile/.maestro/design.yaml`

**Interfacce:**
- Consuma: tutto ciò che producono i Task 2–9.
- [ ] **Passo 1:** tab Oggi, Piano, Dispensa, Andamento con le icone `today`, `plan`, `pantry`, `trend`, nei colori dei token. La barra delle tab usa `surface` e `border`. Il profilo esce dalle tab (`href: null`) e si apre dal pulsante `profile` nell'intestazione di Oggi. Le schermate segnaposto hanno testi aggiornati:
  - Piano: "Pasti, alimenti e grammi per ogni tipo di giornata.";
  - Dispensa: "I tuoi alimenti, le ricette e i pasti salvati.";
  - Andamento: "Peso con media mobile, misure, foto e check-in settimanale.".
- [ ] **Passo 2:** `src/app/design.tsx`, fuori dalle tab, mostra tutti i componenti con i dati dell'albume d'uovo crudo di CIQUAL (`energy_kcal 48.1`, `protein_g 10.9`, `carbs_g 0.73`, `fat_g 0.17`; gli altri valori assenti, per vedere `–`). Comprende:
  - due `ResultRow`, una col nome lungo dei Punti da presidiare 4;
  - le barre a 120/240, 49+191/240 e 300/240;
  - l'etichetta per 100 g;
  - il pulsante "Apri il foglio dei grammi", con `lastGrams` 500 e pasto "Cena".

  Fuori da `__DEV__` reindirizza a `/`.
- [ ] **Passo 3:** aggiorna `navigazione.yaml` sulle nuove tab e sui nuovi testi. Scrivi `design.yaml`, che:
  - esegue `subflows/avvio.yaml` e poi `openLink: tara://design`;
  - verifica "Albume d'uovo" e "di cui zuccheri";
  - apre il foglio, tocca 5, 0, 0 e verifica "Aggiungi 500 g";
  - tocca Tara, 3, 8 e verifica "tara 38 g" e "Aggiungi 462 g";
  - tocca Tara, poi cancella tre volte, poi 3 e 0, e verifica "La tara supera il peso".
  - salva gli screenshot `design-catalogo` e `design-foglio`.
- [ ] **Passo 4:** `npm run e2e:dev` con l'emulatore acceso. Atteso: entrambi i flussi passano. Guarda gli screenshot e confrontali con le bozze del canvas: colonne allineate, numeri che non si spostano mentre si digita, foglio che sale senza scatti.
- [ ] **Passo 5:** testo grande (Punti da presidiare, 5). Esegui `adb shell settings put system font_scale 1.3`, riapri il catalogo e il foglio e fai gli screenshot: niente testo tagliato, tastierino intero. Poi riporta il valore a 1.0. Se qualcosa si taglia, la lettura scende di dimensione in base allo spazio e il tastierino usa `flex`. Correggi e ripeti.
- [ ] **Passo 6:** typecheck, lint, test:coverage, doctor. Commit: `feat(mobile): rename tabs and add the component catalog with Maestro checks`. Apri la PR 2 con gli screenshot nella descrizione e aspetta la CI verde.
