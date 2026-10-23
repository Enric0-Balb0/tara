# Strumenti per lo sviluppo

Ricerca del 22 ottobre 2026 su plugin, skill, server MCP e librerie utili a costruire Tara, lato app e lato backend. Per ogni voce: cosa porta, perché serve a Tara, quando adottarla. Le decisioni già prese stanno in `docs/requisiti.md`; qui ci sono raccomandazioni, da confermare quando la fase relativa parte.

Legenda: **Adottato** = già nel repository · **Ora** = da installare subito · **Fase** = quando entra nella roadmap · **Valutare** = alternativa da decidere.

## 1. Plugin, skill e MCP per Claude Code

### Da installare ora

| Strumento | Cosa porta | Perché a Tara | Come |
| --- | --- | --- | --- |
| Plugin **expo** (ufficiale, `expo/skills`) | Skill su Expo Router, UI nativa, design system a token, `@expo/ui`, data fetching e offline, animazioni, dev client, upgrade di SDK, EAS Build/Update/Workflows e store. Include il **server MCP di Expo**: documentazione della versione SDK, `add_library` con versioni compatibili, avvio e log di build e workflow EAS. | Expo cambia a ogni SDK (`apps/mobile/CLAUDE.md`): le skill e l'MCP sostituiscono la memoria del modello con la documentazione della versione. È già abilitato in `.claude/settings.json`, ma non è installato. | `claude plugin install expo@claude-plugins-official`, poi `/mcp` per collegare l'account Expo. MCP gratuito dal 26/05/2026; solo `search_documentation` richiede un piano EAS a pagamento. |
| **expo-mcp** (capacità locali dell'MCP) | Screenshot, tap, ricerca di view, log dell'app e sitemap delle route, dal dev server in esecuzione. | Permette a Claude di verificare le schermate sull'emulatore Android invece di fidarsi del codice. | `npx expo install expo-mcp -- --save-dev` e `EXPO_UNSTABLE_MCP_SERVER=1 npx expo start`. Va ricollegato a ogni riavvio del dev server. |
| Plugin **pyright-lsp** | Diagnostica di tipo e navigazione Python in sessione. | Errori di tipo visti mentre si scrive, non solo da mypy in CI. `typescript-lsp` è già installato. | `claude plugin install pyright-lsp@claude-plugins-official` e `npm i -g pyright`. |
| **GitHub** (MCP già installato, oppure `gh`) | PR, stato della CI, issue. | Oggi l'MCP non si connette ("Authorization header is badly formatted") e `gh` non è installato: Claude non può aprire PR né leggere la CI. | Ricollegare l'MCP da `/mcp`, oppure `winget install GitHub.cli` e `! gh auth login`. |

### Già installati e utili

- **context7**: documentazione aggiornata delle librerie (FastAPI, SQLAlchemy, Drizzle, TanStack Query…); funziona anche senza chiave.
- **superpowers**: brainstorming, piani, TDD, debugging sistematico, verifica prima di dichiarare finito.
- **feature-dev**, **code-review**, **code-simplifier**, **security-guidance**: sviluppo guidato, review del diff, avvisi di sicurezza sulle modifiche.
- **frontend-design** e **design** (design system, critica, UX writing, accessibilità): per un'identità visiva originale invece di un'interfaccia da template.
- **supabase**: utile se l'hosting sarà Supabase (database, autenticazione, storage).
- Skill **claude-api** integrata: modelli, prezzi, output strutturati e caching per la lettura delle etichette (F1).

### Skill React Native di terze parti (leggere `SKILL.md` prima di installare)

| Skill | Contenuto | Come |
| --- | --- | --- |
| `callstackincubator/agent-skills` (MIT) | `react-native-best-practices` (profiling, re-render, FlashList, Hermes, TTI, dimensione del bundle), `react-native-testing` (Testing Library), `github-actions` (build per emulatore in GitHub Actions), `agent-device` (automazione del dispositivo). | `npx skills@latest add callstackincubator/agent-skills --skill react-native-best-practices` |
| `vercel-labs/agent-skills` | Regole React Native ed Expo con esempi giusti e sbagliati: liste, Reanimated, navigazione. | `npx skills add vercel-labs/agent-skills`, scegliendo la skill React Native. I dati di popolarità dei cataloghi sono incoerenti: verificare il repository. |

### Da valutare nelle fasi successive

| Strumento | Fase | Nota |
| --- | --- | --- |
| EAS Observe oppure plugin **sentry** | F1, con l'app sul telefono | EAS Observe è GA dal 20/08/2026, con crash nativi dal 07/10/2026 e 100.000 eventi al mese nel piano Free. Sentry copre anche il backend. |
| Plugin **logfire** (Pydantic) | F1 | Tracing OpenTelemetry con strumentazione automatica di FastAPI, httpx e SQLAlchemy. |
| Plugin **pydantic-ai** | F1 | Pattern aggiornati per output strutturati e agent, se si sceglie Pydantic AI per il gateway AI (RNF-05). |
| **langfuse**, **deepeval** | F1–F4 | Tracing ed eval dei prompt; alternativa più leggera in §3. |
| **railway**, **render**, **neon**, **supabase** | Scelta dell'hosting | Skill di deploy del provider scelto. |
| **semgrep**, **claude-security** | Prima di F5 (amici) | Scansione SAST più profonda prima di aprire l'app ad altri utenti. |
| **figma** | Solo se si disegna in Figma | Lettura di design e token. |
| **playwright** | No | Automatizza browser, non app native; per l'E2E serve Maestro (§2). |

## 2. App mobile (Expo SDK 58)

SDK 58 è uscito il 15/10/2026: React Native 0.88, Node 22.13+ o 24.3+. Cambiamenti da ricordare:

- loader, middleware, native tabs e toolbar di Expo Router sono stabili; il core di navigazione è stato riscritto;
- `expo-sqlite` perde il supporto libSQL;
- `expo-notifications` mostra le notifiche in primo piano per impostazione predefinita;
- R8 è attivo nelle build Android di release;
- gli import profondi da `react-native/Libraries/*` diventano errori di tipo.

| Area | Raccomandazione | Alternativa | Fase |
| --- | --- | --- | --- |
| Database locale | **expo-sqlite + Drizzle ORM**: query tipizzate e migrazioni generate da drizzle-kit (`driver: "expo"`), applicate all'avvio. | SQL a mano con `expo-sqlite`. | F0 (passo 5) |
| Sincronizzazione | Coda propria (UUIDv7, last-write-wins per riga) come da requisiti. | **PowerSync**: sync gestita Postgres ↔ SQLite con driver Drizzle. È un servizio in più, ma evita di scrivere a mano conflitti e ripresa. Da valutare prima di scrivere la coda. | F1 |
| Contratto con il backend | **openapi-typescript + openapi-fetch**: tipi generati dall'OpenAPI di FastAPI, nessun runtime pesante; la CI fallisce se i tipi generati non sono aggiornati. | Orval (genera hook TanStack Query), hey-api. | F0 (passo 4) |
| Stato del server | **TanStack Query** per le chiamate al backend; SQLite resta la fonte per catalogo e diario. | SWR. | F1 |
| Form | **react-hook-form + zod** per il form etichetta (RF-14: campi a bassa confidenza evidenziati, errori per campo). | Form controllati a mano. | F1 |
| Design system | Token (colori, spaziature, tipografia) e componenti propri, con la skill `expo-design-system`; **@expo/ui** per i controlli nativi (picker, sheet; in SDK 58 `LazyColumn` con riciclo delle righe). Stile con **Unistyles 3** (StyleSheet esteso, nativo, richiede la New Architecture, già predefinita) oppure StyleSheet con token. | NativeWind (Tailwind) o Tamagui, più adatti se ci fosse anche un'app web. | Prima schermata vera (F0, passo 5), dopo un brainstorming con `frontend-design` |
| Liste lunghe | **FlashList** per diario e ricerca (RNF-02: ricerca < 200 ms). | `LazyColumn` di @expo/ui. | F0–F1 |
| Grafici | **victory-native** (Skia + Reanimated) per trend del peso e macro. | react-native-gifted-charts, più semplice. | F1 (RF-70) |
| Interazione | **Reanimated + Gesture Handler + expo-haptics** per il tastierino dei grammi. Formattare i numeri con `Intl` in `it-IT`: virgola decimale. | — | F1 (RF-41) |
| Barcode ed etichette | **expo-camera** (scansione barcode integrata; da SDK 58 `scanDocumentAsync` per acquisire documenti, da provare sulle tabelle nutrizionali). | react-native-vision-camera. | F1 (RF-10, RF-13) |
| Dati salute | **react-native-health-connect** v4: il config plugin Expo è integrato da agosto 2026 (`expo-health-connect` è deprecato). Richiede una development build. HealthKit con il primo utente iPhone (`@kingstinct/react-native-healthkit`, da verificare quando serve). | `expo-healthkit-module` (entrambe le piattaforme, manutenzione da verificare). | F2 (RF-113) |
| Notifiche | **expo-notifications**, locali e programmate. | — | F2 |
| Test dei componenti | **jest-expo + React Native Testing Library** (Vitest resta per `src/domain`). | — | Con il primo componente con logica |
| Test E2E | **Maestro** 2.11 (**adottato** in locale: `npm run e2e:dev` sull'emulatore); in CI su EAS Workflows, con build per emulatore e flussi in `.maestro/` (job ancora in alpha). | — | Locale ora; CI in F1, prima del gate |
| Development build | **expo-dev-client** con EAS Build, profilo `development` (**adottato**). | Build locale con `npx expo run:android`: serve JDK 17 e 10–15 GB di disco. | Adottato |
| Strumenti di sviluppo | `expo-device-hub` (dashboard degli emulatori nel browser, SDK 58); `@expo/agent-cli` (sperimentale, pensato per gli agenti). | — | Ora, se utili |

## 3. Backend e pipeline del catalogo

| Area | Raccomandazione | Alternativa | Fase |
| --- | --- | --- | --- |
| Pacchetti e lockfile | **uv** con `uv.lock` (**adottato**). | — | Adottato |
| Type checking | **mypy `strict`** con il plugin Pydantic (**adottato**). | Pyrefly (1.0 da maggio 2026) o ty di Astral (ancora beta, 0.0.x a luglio 2026): più veloci, da rivalutare quando ty arriva a 1.0. | Adottato |
| Database | **SQLAlchemy 2.1** (ORM tipizzato) + **Alembic** + **psycopg 3** (**adottati**); schemi Pydantic separati dai modelli ORM. **pgvector-python** entra con gli embedding della ricerca semantica (RF-92). | SQLModel (meno codice, ma mescola i due livelli). | Adottato (F0, passo 1) |
| Test di integrazione | Postgres con pgvector come *service container* in CI e da `infra/docker-compose.yml` in locale; un database temporaneo per sessione, ogni test in una transazione annullata alla fine (**adottato**). | testcontainers-python. | Adottato |
| Autenticazione | Se l'hosting è Supabase: **Supabase Auth** con chiavi di firma asimmetriche; FastAPI verifica i JWT con la JWKS del progetto (ES256), tenuta in cache per poco tempo per non ritardare le revoche. | fastapi-users o un'autenticazione propria (più codice da mantenere e mettere in sicurezza). | F0 (passo 4) |
| Open Food Facts | **httpx** con timeout, User-Agent dell'app e cache dei prodotti in Postgres. | — | F1 |
| Gateway AI | Interfaccia propria sottile con output validati da modelli Pydantic: **SDK Anthropic** con output strutturati, oppure **Pydantic AI** per cambiare provider senza riscrivere (RNF-05). Si sceglie con il confronto su 30–50 etichette reali. | Instructor. | F1 |
| Eval | Harness in **pytest** o **pydantic-evals** con accuratezza per campo sulle etichette, nello stesso stack. | **promptfoo** (YAML, adatto a confrontare molti provider in CI); Inspect AI (pensato per benchmark e ricerca). | F1 (RNF-07) |
| Osservabilità | **Logfire** o **Sentry**, più log strutturati. | — | F1 |
| Test dell'API | **Schemathesis**: test basati sullo schema OpenAPI. | — | F1 |
| Import CIQUAL | **openpyxl** e la libreria standard: CIQUAL ha qualche migliaio di righe e non serve un dataframe. | polars, se gli import crescono (USDA). | F0 (passo 2) |

## 4. CI/CD, hosting e account

**Adottato** (dettagli in `docs/processo.md`): GitHub Actions con job per pacchetto, Actions fissate per SHA, pre-commit con gitleaks e Conventional Commits, Dependabot, immagine del backend su GHCR dopo la CI verde.

**Hosting del backend** (questione aperta). Supabase non esegue container Python: se si sceglie Supabase per database, autenticazione e storage, l'API va su un altro servizio che scarica l'immagine da GHCR.

| Servizio | Ruolo | Piano gratuito | Nota |
| --- | --- | --- | --- |
| Supabase | Postgres + pgvector, Auth, Storage | 2 progetti da 500 MB | Il progetto va in pausa dopo una settimana di inattività; Pro a 25 $/mese. |
| Neon | Postgres serverless | 0,5 GB, 100 CU-ore | Avvio a freddo dopo 5 minuti di inattività; branch del database per le preview. |
| Render | Container dell'API (anche Postgres) | Web service gratuito | Si spegne quando è inattivo e impiega circa un minuto a ripartire; ha la regione di Francoforte. |
| Railway | Container e database | Credito minimo | A consumo. |
| Fly.io | Container | Nessun piano gratuito per i nuovi utenti | Molte regioni, macchine piccole a pochi euro al mese. |

Per un utente solo con un'app local-first, un avvio a freddo sulla sincronizzazione è tollerabile. La combinazione più semplice è **Supabase (regione UE) + Render (Francoforte)**: costa zero e si migra quando arrivano gli amici (F5).

**Account da attivare**:

- Expo, per EAS e l'MCP. Piano Free: 30 build al mese, OTA fino a 1.000 utenti attivi.
- GitHub Pro, per proteggere `main` su un repository privato. Il Student Developer Pack dovrebbe includerlo: verificarlo sul proprio account.

## 5. Ordine consigliato

1. **Ora**: installare il plugin expo e pyright-lsp, ricollegare GitHub (MCP o `gh`), attivare il ruleset su `main`.
2. **F0, passo 1 (schema)**: SQLAlchemy, Alembic, psycopg e il servizio Postgres in CI.
3. **F0, passi 4–5 (ricerca)**: contratto OpenAPI → TypeScript; expo-sqlite + Drizzle; brainstorming sul design system prima della prima schermata.
4. **Prima di F1**: scelta dell'hosting e dell'autenticazione, poi il job di deploy; account Expo, poi EAS Build, Update e Workflows.
5. **F1**: gateway AI ed eval per le etichette; Maestro per i flussi principali; osservabilità.

## Fonti

- Expo: [expo/skills](https://github.com/expo/skills) · [Expo MCP](https://docs.expo.dev/eas/ai/mcp/) · [SDK 58](https://expo.dev/changelog/sdk-58) · [changelog](https://expo.dev/changelog) · [piani EAS](https://docs.expo.dev/billing/plans/) · [EAS Workflows e GitHub Actions](https://expo.dev/blog/how-to-integrate-eas-workflows-with-github-actions) · [E2E con Maestro](https://docs.expo.dev/eas/workflows/examples/e2e-tests/) · [fingerprint e OTA, caso Infinite Red](https://shift.infinite.red/cut-ci-from-20-minutes-to-6-with-eas-workflows-and-eas-updates-8d928fe5dcfc)
- Skill di terze parti: [callstackincubator/agent-skills](https://github.com/callstackincubator/agent-skills) · [skill React Native di Vercel](https://claudemarketplaces.com/skills/vercel-labs/agent-skills/react-native-skills)
- Librerie dell'app: [react-native-health-connect](https://github.com/matinzd/react-native-health-connect/releases) · [Drizzle con Expo SQLite](https://blog.logrocket.com/drizzle-react-native-expo-sqlite/) · [confronto sullo styling](https://reactnativerelay.com/it/article/nativewind-tamagui-unistyles-styling-react-native-2026) · [victory-native](https://reactnativerelay.com/article/react-native-charts-victory-native-interactive-data-visualizations-expo) · [generatori OpenAPI → TypeScript](https://www.pkgpulse.com/guides/orval-vs-openapi-typescript-vs-kubb-openapi-client-2026)
- Python: [stato di ty](https://pydevtools.com/handbook/topics/ty/) · [ty e Pyrefly](https://pydevtools.com/handbook/explanation/ty-vs-pyrefly.md) · [uv sync](https://docs.astral.sh/uv/concepts/projects/sync/) · [setup-uv](https://github.com/astral-sh/setup-uv)
- Eval: [promptfoo e Inspect AI](https://aicoolies.com/comparisons/promptfoo-vs-inspect-ai)
- Hosting e GitHub: [chiavi di firma JWT di Supabase](https://supabase.com/docs/guides/auth/signing-keys) · [piani gratuiti 2026](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026) · [alternative a Supabase](https://sliplane.io/blog/supabase-alternatives-managed-postgres) · [Fly, Railway e Render](https://www.speedtesthq.com/compare/fly-io-vs-railway-vs-render) · [ruleset di GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) · [gitleaks-action](https://github.com/gitleaks/gitleaks-action) · [action-semantic-pull-request](https://github.com/amannn/action-semantic-pull-request)
- Catalogo dei plugin: marketplace `anthropics/claude-plugins-official`, copia locale aggiornata al 22/10/2026.
