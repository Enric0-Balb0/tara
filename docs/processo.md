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

Formato: `tipo(scope): descrizione`, in italiano, all'imperativo o al presente, senza punto finale. Un cambiamento incompatibile aggiunge `!` dopo lo scope e una riga `BREAKING CHANGE:` nel corpo.

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

Scope ammessi: `mobile`, `api`, `catalog`, `infra`, `ci`, `deps`, `deps-dev`, `docs`; lo scope è facoltativo. Esempi: `feat(api): ricerca full-text dei generici`, `fix(mobile): virgola decimale nel tastierino`, `chore(deps): aggiorna fastapi`.

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

**App (da attivare).** Build e aggiornamenti OTA passano da EAS. Servono un account Expo e il collegamento del progetto:

```powershell
cd apps/mobile
npx expo login
npx eas-cli@latest init            # scrive extra.eas.projectId in app.json
npx eas-cli@latest build:configure # crea eas.json con i profili
```

Poi si configurano EAS Update ed EAS Workflows (build con *fingerprint*: se cambia solo JavaScript si pubblica un aggiornamento OTA invece di ricompilare) e si aggiunge `EXPO_TOKEN` ai segreti di GitHub. Il piano Free di EAS prevede 30 build al mese (al massimo 15 iOS) e aggiornamenti OTA fino a 1.000 utenti attivi al mese. Lint e test restano su GitHub Actions.

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
