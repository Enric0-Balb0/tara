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
npm test                    # vitest (solo src/domain)
npm run test:coverage       # vitest con soglia 80% su src/domain, come in CI
npm run doctor              # expo-doctor: dipendenze e configurazione
npx expo install --fix      # allinea versioni incompatibili

emulator -avd Pixel_6a                                  # emulatore Android
npx expo start --dev-client                             # dev server per la development build
npx eas-cli@latest build -p android --profile development  # nuova development build (solo se cambiano dipendenze native)
npx eas-cli@latest build:run -p android --latest        # installa l'ultima build sull'emulatore
npm run e2e:dev                                         # flussi Maestro sulla development build
```

Typecheck, lint, test con coverage e doctor devono passare prima di dichiarare finito un lavoro: sono i controlli del job "App mobile" in CI.

## Verificare l'interfaccia

Ogni modifica visibile si controlla sull'emulatore, non solo nel codice: screenshot con `adb exec-out screencap -p > <file>.png` (salvato nello scratchpad, non nel repository), interazioni con `adb shell input` o con un flusso Maestro. Un flusso nuovo in `.maestro/` per ogni percorso utente che entra nell'app; testi e asserzioni in italiano, come l'interfaccia. Strategia completa in `docs/processo.md`, sezione "Test dell'interfaccia".

## Struttura

- `src/app/`: route di Expo Router. Ogni file è una schermata, `_layout.tsx` definisce i navigatori. Niente codice non-route qui.
- `src/components/`: componenti riutilizzabili.
- `src/domain/`: logica di dominio in TypeScript puro, senza React, testata con Vitest.
- Import con alias `@/` → `src/`.

## Build e distribuzione

- EAS per build, firma e invio (`npx eas-cli@latest build`), EAS Update per gli aggiornamenti OTA.
- Le cartelle `ios/` e `android/` si generano (Continuous Native Generation): non crearle né modificarle a mano; il comportamento nativo si configura in `app.json` e nei config plugin.
- Expo Go include solo i moduli nativi integrati. Health Connect, HealthKit e simili richiedono una development build (`npx expo run:android` o `eas build --profile development`).
- Preferisci i moduli Expo raccomandati alle librerie di terze parti.
