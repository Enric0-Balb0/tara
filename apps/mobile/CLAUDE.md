# App mobile (Expo)

App Expo/React Native di Tara. Priorità: pattern mobile-first, prestazioni, compatibilità Android e iOS. Interfaccia interamente in italiano.

## Expo cambia: non fidarti della memoria

Expo introduce breaking change a ogni SDK. Prima di scrivere codice che tocca API di Expo, EAS o React Native:

1. Leggi la major di `expo` in `package.json` (oggi 58).
2. Consulta la documentazione della versione: `https://docs.expo.dev/versions/v58.0.0/`
3. Per il resto parti da https://docs.expo.dev/llms.txt, indice di tutta la documentazione con correzioni agli errori comuni degli LLM.

## Comandi

```bash
npx expo install <package>  # SEMPRE al posto di npm install: sceglie versioni compatibili con l'SDK
npx expo install <package> -- --save-dev  # strumenti di sviluppo
npx expo start              # dev server
npm run typecheck           # tsc --noEmit
npm run lint                # expo lint, zero warning
npm test                    # vitest (src/domain, src/theme, src/data)
npm run test:coverage       # vitest con soglia 80%, come in CI
npm run doctor              # expo-doctor: dipendenze e configurazione
npx expo install --fix      # allinea versioni incompatibili

emulator -avd Pixel_6a                                  # emulatore Android
npx expo start --dev-client                             # dev server per la development build
npx eas-cli@latest build -p android --profile development  # nuova development build (solo se cambiano dipendenze native)
npx eas-cli@latest build:run -p android --latest        # installa l'ultima build sull'emulatore
npm run e2e:dev                                         # flussi Maestro sulla development build
```

## Backend e catalogo

All'avvio l'app scarica il catalogo dei generici da `GET /v1/catalog` e lo tiene in SQLite; da lì ricerca e scheda funzionano anche offline. L'indirizzo è `EXPO_PUBLIC_API_URL`, di default `http://10.0.2.2:8000`, cioè il PC visto dall'emulatore Android: per il primo download serve il backend acceso (`services/api`, `uv run uvicorn tara_api.main:app`, con il catalogo caricato). Per un telefono vero vedi `.env.example`. Le build EAS `preview` e `production` non leggono `.env.local`: prendono l'URL https del backend su Render dai loro profili in `eas.json`, e `src/config.test.ts` controlla che ci sia. Stato del catalogo e "Aggiorna catalogo" nel menu Sviluppo del profilo. I flussi Maestro con il tag `api` girano solo se il backend risponde: `npm run e2e:dev` prova quello locale, `npm run e2e` quello del profilo `preview` di `eas.json` (aspetta fino a 90 s che Render si svegli). `npm run e2e` salta i flussi con i tag `dev` e `design`, che usano il menu Sviluppo. Ogni flusso accede con un codice monouso chiesto dallo script a Supabase prima di partire: serve la variabile `TARA_E2E_SUPABASE_SECRET_KEY` (`docs/processo.md`, "Flussi Maestro"). `npm run e2e:dev -- ricerca` lancia solo i flussi indicati.

Typecheck, lint, test con coverage e doctor devono passare prima di dichiarare finito un lavoro: sono i controlli del job "App mobile" in CI.

## Accesso (Supabase Auth)

Tutta l'app è chiusa finché non si accede: `src/app/_layout.tsx` mette le schermate sotto `Stack.Protected` con la sessione di `src/data/SessionProvider.tsx`, e da fuori si vede solo `src/app/accesso.tsx` (email, poi codice). Conta la sessione salvata nel localStorage, letta in modo sincrono al primo render: niente lampo della schermata di accesso, e offline con il token scaduto si resta dentro; si esce solo con l'evento `SIGNED_OUT` ("Esci" nel profilo o rinnovo rifiutato dal server, regole in `src/data/session.ts`). Uscire non tocca il catalogo. Il `CatalogProvider` sta sopra la guardia, quindi il download parte durante l'accesso. Dopo l'accesso l'app chiama una volta `GET /v1/me` (`src/data/me.ts`) perché il backend crei l'utente, senza bloccare nulla. I flussi Maestro entrano con `subflows/accedi.yaml` ("Ho già un codice"), che vuole le variabili `EMAIL` e `OTP`: le fornirà lo script E2E con un codice generato dall'amministratore; nell'app non c'è nessuna scorciatoia.

Accesso con codice via email, iscrizioni chiuse: gli utenti li crea Enrico nel pannello di Supabase e la richiesta del codice passa sempre `shouldCreateUser: false` (`otpRequest` in `src/domain/accesso.ts`, con pulizia di email e codice, attesa di 60 s per un nuovo invio e messaggi di errore). Il client è `src/data/supabase.ts`: sessione nel localStorage di expo-sqlite, rinnovo del token legato ad `AppState`, niente polyfill per `URL`. URL e chiave `sb_publishable_` sono pubblici per costruzione: le build `preview` e `production` li prendono da `eas.json`, `npx expo start` da `.env.local` (copiali da `.env.example`). Mai una chiave `sb_secret_` o `service_role` nell'app: lo controllano `src/config.test.ts` e gitleaks, che ammette solo le publishable (`.gitleaks.toml`).

## Verificare l'interfaccia

Ogni modifica visibile si controlla sull'emulatore, non solo nel codice: screenshot con `adb exec-out screencap -p > <file>.png` (salvato nello scratchpad, non nel repository), interazioni con `adb shell input` o con un flusso Maestro. Un flusso nuovo in `.maestro/` per ogni percorso utente che entra nell'app; testi e asserzioni in italiano, come l'interfaccia. Strategia completa in `docs/processo.md`, sezione "Test dell'interfaccia".

## Struttura

- `src/app/`: route di Expo Router. Ogni file è una schermata, `_layout.tsx` definisce i navigatori. Niente codice non-route qui.
- `src/components/`: componenti riutilizzabili.
- `src/domain/`: logica di dominio in TypeScript puro, senza React, testata con Vitest.
- `src/data/`: database sul telefono (expo-sqlite) e sincronizzazione con il backend, in TypeScript puro dietro l'interfaccia `SqlDatabase`. I test usano SQLite vero in memoria con `node:sqlite`; nelle transazioni di expo-sqlite la connessione è nuova, quindi l'SQL non deve dipendere da pragma come `foreign_keys`.
- Import con alias `@/` → `src/`.
- `src/theme/`: token di colore, carattere, spazi e movimento. Lo stile viene solo da qui e dai componenti di `src/components/`, mai da valori scritti a mano; la specifica è `docs/design.md`.

## Build e distribuzione

- EAS per build, firma e invio (`npx eas-cli@latest build`), EAS Update per gli aggiornamenti OTA.
- Le cartelle `ios/` e `android/` si generano (Continuous Native Generation): non crearle né modificarle a mano; il comportamento nativo si configura in `app.json` e nei config plugin.
- Expo Go include solo i moduli nativi integrati. Health Connect, HealthKit e simili richiedono una development build (`npx expo run:android` o `eas build --profile development`).
- Preferisci i moduli Expo raccomandati alle librerie di terze parti.
