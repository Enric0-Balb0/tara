# Processo di sviluppo

Tara ha un solo sviluppatore ma segue il processo di un team: ogni modifica passa da un branch, una pull request e una CI verde, e `main` resta sempre rilasciabile. Le regole sono applicate da strumenti (hook git, CI, ruleset di GitHub), non dalla buona volontà.

## Flusso di una modifica

1. **Requisito.** Si parte da un ID di `docs/requisiti.md` (RF-xx, RNF-xx) o da una issue aperta con il modello *Funzione*. Se la modifica cambia un requisito, `docs/requisiti.md` si aggiorna nella stessa PR.
2. **Branch** da `main` aggiornato: `feat/<id-requisito>-<breve>` per le funzioni (es. `feat/rf-03-schema-catalogo`), `fix/<breve>`, `docs/<breve>`, `ci/<breve>`, `chore/<breve>`.
3. **Commit piccoli** in Conventional Commits; gli hook locali controllano formato, segreti e messaggio prima del commit, type check e test prima del push.
4. **Pull request** con il modello del repository: requisiti coinvolti, come è stata verificata, compromessi, Definition of Done.
5. **Merge squash** su `main` solo con CI verde: il titolo della PR diventa il commit su `main`, la storia resta lineare e il branch si cancella.
6. **Delivery**: con la CI verde su `main`, il workflow CD pubblica l'immagine del backend (vedi [Delivery](#delivery)).

## Conventional Commits

Formato: `tipo(scope): descrizione`, **in inglese**, all'imperativo (*add*, *fix*, *update*), senza punto finale, al massimo 72 caratteri; il corpo, anch'esso in inglese, spiega il perché. Il titolo della PR segue le stesse regole, perché con lo squash diventa il commit su `main`; la descrizione della PR resta in italiano, come il resto della documentazione. Un cambiamento incompatibile aggiunge `!` dopo lo scope e una riga `BREAKING CHANGE:` nel corpo.

| Tipo | Quando |
| --- | --- |
| `feat` | Nuova funzione per l'utente |
| `fix` | Correzione di un bug |
| `docs` | Solo documentazione |
| `refactor` | Ristrutturazione senza cambi di comportamento |
| `perf` | Miglioramento di prestazioni |
| `test` | Solo test |
| `build` | Build, dipendenze, Docker |
| `ci` | Workflow di CI/CD |
| `chore` | Manutenzione che non tocca codice di prodotto |
| `revert` | Annulla un commit precedente |

Scope ammessi: `mobile`, `api`, `catalog`, `infra`, `ci`, `deps`, `deps-dev`, `docs`; lo scope è facoltativo. Esempi: `feat(api): add full-text search for generic foods`, `fix(mobile): accept decimal comma in the gram keypad`, `chore(deps): bump fastapi`.

## Quality gate

| Controllo | pre-commit | pre-push | CI |
| --- | --- | --- | --- |
| Igiene dei file (spazi, fine riga LF, YAML/TOML/JSON validi, file grandi, chiavi private) | ✓ | | ✓ |
| Segreti con gitleaks | file in stage | | storia completa |
| Workflow GitHub con actionlint | ✓ | | ✓ |
| Messaggio del commit / titolo della PR in Conventional Commits | commit-msg | | titolo PR |
| Python: ruff check e ruff format | ✓ | | ✓ |
| Python: mypy `strict` | | ✓ | ✓ |
| Python: pytest con coverage di ramo ≥ 80% | | ✓ | ✓ |
| Mobile: TypeScript `strict` (`tsc --noEmit`) | | ✓ | ✓ |
| Mobile: ESLint con zero warning | | ✓ | ✓ |
| Mobile: Vitest con coverage ≥ 80% su `src/domain` | | ✓ | ✓ |
| Mobile: `expo-doctor` (versioni compatibili con l'SDK) | | | ✓ |
| Backend: build dell'immagine Docker e smoke test di `/health` | | | ✓ |

Nelle PR la CI esegue solo i job dei pacchetti modificati; su `main` esegue sempre tutto. Il job **CI passata** riassume l'esito di tutti gli altri ed è l'unico controllo da rendere obbligatorio, insieme a **Titolo Conventional Commits**.

Le soglie di coverage si alzano, non si abbassano: una PR che scende sotto soglia aggiunge test, non cambia il numero.

## Definition of Done

Una modifica è finita quando:

- il titolo della PR rispetta Conventional Commits;
- i test sono scritti insieme al codice e la coverage resta sopra la soglia;
- type check, lint e test sono verdi in locale e in CI;
- `docs/requisiti.md` è aggiornato se cambia un requisito o una decisione;
- le migrazioni del database sono reversibili e testate;
- prompt e schemi dei modelli AI sono versionati e passati dagli eval;
- il diff non contiene segreti, dati personali o file grezzi.

## Dipendenze

- **Lockfile sempre committati**: `apps/mobile/package-lock.json`, `services/api/uv.lock`, `pipelines/catalog/uv.lock`. La CI installa con `npm ci` e `uv sync --locked`, che falliscono se il lockfile non corrisponde al manifest.
- **Aggiungere una dipendenza**: nell'app `npx expo install <pacchetto>` (sceglie la versione compatibile con l'SDK; per gli strumenti di sviluppo `npx expo install <pacchetto> -- --save-dev`); in Python `uv add <pacchetto>` o `uv add --dev <pacchetto>`. Mai `pip install` dentro i progetti.
- **Aggiornamenti**: Dependabot apre ogni lunedì una PR raggruppata per ecosistema (npm, uv, Docker, GitHub Actions). Per l'app propone solo patch: le versioni dell'SDK Expo, di React e di React Native si cambiano con `npx expo install --fix` o con l'upgrade di SDK.
- **Vulnerabilità note accettate**: `npm audit` segnala vulnerabilità *high* in dipendenze transitive degli strumenti di Expo (`node-forge` in `@expo/code-signing-certificates`, `braces` nel tooling di build). L'unica correzione proposta è un downgrade a Expo 44, quindi non applicabile; per questo `npm audit` non è un gate. Da ricontrollare a ogni SDK.

## Versioni

- SemVer `0.x` per pacchetto finché non c'è un rilascio stabile: app (`app.json` e `package.json`), backend e pipeline (`pyproject.toml`).
- L'immagine del backend è identificata dallo SHA del commit; `latest` punta all'ultima build verde di `main`.
- Il changelog si genera dai Conventional Commits al primo rilascio reale (F1), con release-please.

## Delivery

**Backend (attivo).** `.github/workflows/cd.yml` parte quando la CI su `main` finisce verde e pubblica `ghcr.io/enric0-balb0/tara-api` con i tag `<sha>` e `latest`. L'immagine è la stessa che la CI ha già avviato e verificato. Il job di deploy si aggiunge in coda appena si sceglie l'hosting (questione aperta in `docs/requisiti.md`); ci vorrà un segreto di deploy nelle impostazioni del repository.

**App (in parte attiva).** Il progetto è collegato a EAS come `@enricobalbo/tara` (`extra.eas.projectId` in `app.json`) e le build passano da EAS Build con i profili di `apps/mobile/eas.json`:

| Profilo | Cosa produce | Uso |
| --- | --- | --- |
| `development` | APK con `expo-dev-client`: carica il JavaScript dal dev server | Sviluppo quotidiano su emulatore e telefono |
| `preview` | APK con il bundle JavaScript incluso | Test E2E, prove sul telefono senza PC |
| `production` | App bundle per Google Play, versione incrementata da EAS | Rilasci |

La keystore Android è generata e custodita da EAS (*remote credentials*). Una copia di sicurezza si scarica con `npx eas-cli@latest credentials -p android`, da tenere fuori dal repository. Restano da configurare EAS Update ed EAS Workflows (build con *fingerprint*: se cambia solo JavaScript si pubblica un aggiornamento OTA invece di ricompilare) e da aggiungere `EXPO_TOKEN` ai segreti di GitHub. Il piano Free di EAS prevede 30 build al mese (al massimo 15 iOS) e aggiornamenti OTA fino a 1.000 utenti attivi al mese. Lint e test restano su GitHub Actions.

## Test dell'interfaccia

L'interfaccia si verifica a quattro livelli, dal più veloce al più realistico.

| Livello | Strumento | Dove gira | Cosa copre |
| --- | --- | --- | --- |
| Logica di dominio | Vitest (`npm run test:coverage`) | Node, in locale e in CI | Calcoli nutrizionali, parser, regole |
| Componenti | jest-expo + React Native Testing Library, da introdurre con il primo componente con logica (e allora anche i test di dominio passano a Jest: un solo runner) | Node, in locale e in CI | Rendering e interazioni: tastierino dei grammi, form etichetta, totali |
| Flussi end-to-end | Maestro (`apps/mobile/.maestro/`) | Emulatore o telefono in locale; in CI su `main` con EAS Workflows (da attivare) | Percorsi completi dell'utente, numero di tap di RNF-02 |
| Prova reale | Telefono Android | A mano | Fotocamera, Health Connect, tempi di risposta, gate delle fasi |

**Emulatore.** Si usa l'emulatore di Android Studio, per esempio l'AVD `Pixel_6a` con Android 16 e Play Store; l'accelerazione WHPX di Windows lo rende veloce. La development build si installa una volta e si rifà solo quando cambiano le dipendenze native; il resto arriva dal dev server con il ricaricamento rapido.

```powershell
emulator -avd Pixel_6a                                      # avvia l'emulatore
cd apps/mobile
npx eas-cli@latest build -p android --profile development   # solo se cambiano dipendenze native
npx eas-cli@latest build:run -p android --latest            # installa l'ultima build sull'emulatore
npx expo start --dev-client                                 # dev server; "a" apre l'app sull'emulatore
```

**Flussi Maestro.** Ogni flusso in `apps/mobile/.maestro/` parte da `subflows/avvio.yaml`, che avvia l'app da uno stato pulito sia con la build preview sia con la development build. Gli screenshot e i log finiscono in `apps/mobile/e2e-results/`, ignorata da git.

```powershell
npm run e2e:dev   # development build: dev server acceso, adb reverse automatico
npm run e2e       # build preview, con il bundle incluso
```

Maestro richiede JDK 17+: lo script lo passa solo al processo di Maestro (il JDK di Android Studio, o `TARA_JAVA_HOME`), quindi un `JAVA_HOME` globale diverso resta intatto. Lo script disattiva anche la telemetria anonima di Maestro.

**Verifiche visive di Claude.** Con l'emulatore acceso Claude cattura lo schermo con `adb exec-out screencap -p` e lo guarda, e interagisce con `adb shell input` o con Maestro: ogni modifica all'interfaccia si controlla sullo schermo vero, non solo nel codice. La prima verifica ha trovato subito due difetti invisibili nel codice: le icone delle tab mancano (un `?` al posto del glifo) e quel `?` finisce nell'etichetta letta dallo screen reader.

**iOS.** Su Windows non c'è il simulatore iOS. Finché non c'è un utente iPhone il codice resta multipiattaforma ma si prova solo su Android; poi servono l'Apple Developer Program, le build iOS di EAS e TestFlight.

## Configurazione di GitHub

Queste impostazioni non stanno nel repository e si fanno una volta dalla pagina *Settings*:

- **Ruleset su `main`**: PR obbligatoria, controlli obbligatori *CI passata* e *Titolo Conventional Commits*, branch aggiornato prima del merge, storia lineare, niente force push né cancellazione. Su un repository **privato** i ruleset richiedono GitHub Pro (incluso nel GitHub Student Developer Pack, da verificare sul proprio account); in alternativa il repository va reso pubblico.
- **Pull request**: solo *squash merge*, titolo della PR come messaggio predefinito, cancellazione automatica dei branch dopo il merge.
- **Actions**: permessi del `GITHUB_TOKEN` in sola lettura per impostazione predefinita (i workflow chiedono solo ciò che serve).
- **Sicurezza**: Dependabot alerts e security updates attivi.
- **Packages**: l'immagine su GHCR è privata ed eredita l'accesso dal repository.

## Segreti

- Mai nel repository: in locale stanno in `.env` (ignorato da git; il modello è `services/api/.env.example`), in CI nei segreti di GitHub Actions.
- gitleaks controlla i file in stage a ogni commit e tutta la storia in CI.
- Le chiavi dei provider AI esistono solo sul backend (vedi `docs/requisiti.md`).
- Segreti previsti: `EXPO_TOKEN` (EAS), credenziali di deploy dell'hosting, `TARA_DATABASE_URL` di produzione, chiavi dei provider AI.

## Preparare una nuova macchina

Prerequisiti: Git, Node 22 (vedi `.nvmrc`), [uv](https://docs.astral.sh/uv/), Docker.

```powershell
winget install --id astral-sh.uv -e
uv tool install pre-commit
pre-commit install                 # hook pre-commit, commit-msg e pre-push

cd apps/mobile; npm ci; cd ../..
cd services/api; uv sync; cd ../..
cd pipelines/catalog; uv sync; cd ../..
docker compose -f infra/docker-compose.yml up -d
```

`uv sync` installa anche Python 3.12 se manca (la versione è in `.python-version`).

Per l'app servono anche:

- **Android Studio**, con un emulatore (AVD) Android 14 o successivo con Play Store, e le cartelle `platform-tools` ed `emulator` dell'SDK nel PATH.
- **Maestro**: estrarre `maestro.zip` della [release ufficiale](https://github.com/mobile-dev-inc/maestro/releases) in `%USERPROFILE%\.maestro`, dopo averne verificato il checksum, e aggiungere `%USERPROFILE%\.maestro\bin` al PATH.
- **Login Expo**: `npx eas-cli@latest login --device`. Su Windows `npx expo login` si interrompe aprendo il browser: il link contiene `&` che `cmd /c start` non protegge.
