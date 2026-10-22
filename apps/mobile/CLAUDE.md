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
npx expo start              # dev server
npm run typecheck           # tsc --noEmit
npm run lint                # expo lint
npm test                    # vitest (solo src/domain)
npx expo-doctor             # diagnosi dipendenze e configurazione
npx expo install --fix      # allinea versioni incompatibili
```

Lint, typecheck e test devono passare prima di dichiarare finito un lavoro.

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
