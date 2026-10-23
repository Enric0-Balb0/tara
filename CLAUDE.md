# Tara

App personale di tracciamento della dieta per bodybuilder, interamente in italiano, con AI usata solo dove toglie lavoro. Sostituisce la versione gratuita di FatSecret. Prima utente: Enrico; poi una cerchia ristretta di amici.

Leggi prima:
- `docs/requisiti.md`: requisiti con ID (RF-xx, RNF-xx), architettura, modello dati, roadmap a fasi F0–F5.
- `docs/handoff.md`: decisioni prese finora, perché, e prossimi passi concreti.
- `docs/processo.md`: flusso di sviluppo, quality gate, Definition of Done, CI/CD.
- `docs/strumenti.md`: plugin, skill, MCP e librerie raccomandati per fase.

## Principi non negoziabili

1. **L'AI capisce, il database conta.** I valori nutrizionali arrivano sempre da una fonte tabellare (etichetta, Open Food Facts, CIQUAL/USDA). Un LLM trascrive, riconosce e stima quantità; non inventa mai valori nutrizionali.
2. **Provenienza su ogni valore.** Ogni `nutrient_value` ha `provenance` e `confidence`. Un dato mancante non vale zero.
3. **L'AI propone, l'utente conferma.** Nessuna scrittura nel diario senza conferma.
4. **Peso a crudo di default.** Lo stato (crudo, cotto, n.a.) è un campo, non una parola nel nome.
5. **Grammi in primo piano.** L'utente pesa tutto: il logging è ottimizzato per chi conosce già le grammature.
6. **Multi-utente dal primo giorno.** `user_id` su ogni entità personale, anche con un solo utente.
7. **Snapshot nel diario.** Una voce di diario salva i valori del momento: modificare un alimento o una ricetta non riscrive il passato.

## Struttura

```
apps/mobile/        App Expo (SDK 58, React Native, TypeScript, Expo Router in src/app)
services/api/       Backend FastAPI: sync, gateway AI, proxy Open Food Facts
pipelines/catalog/  Import, traduzione e validazione del catalogo dei generici
infra/              docker-compose per Postgres + pgvector (e il backend in container) in locale
docs/               Requisiti, handoff, processo e strumenti
.github/            CI, CD, Dependabot, modelli di PR e issue
```

## Comandi

Ambiente di sviluppo: Windows, PowerShell, Node 22 (`.nvmrc`), Python 3.12 gestito da uv (`.python-version`). Gli stessi comandi girano in CI (`.github/workflows/ci.yml`).

```powershell
# App
cd apps/mobile
npm ci
npm run typecheck; npm run lint; npm run test:coverage; npm run doctor
npx expo start            # dev server

# Backend (i test usano il Postgres del docker-compose, porta 55432)
cd services/api
uv sync                   # .venv dal lockfile
uv run ruff check .; uv run ruff format --check .; uv run mypy; uv run pytest --cov
uv run alembic upgrade head                              # applica le migrazioni
uv run alembic revision --autogenerate -m "describe"     # nuova migrazione, da rileggere
uv run uvicorn tara_api.main:app --reload

# Pipeline del catalogo
cd pipelines/catalog
uv sync
uv run ruff check .; uv run ruff format --check .; uv run mypy; uv run pytest --cov

# Hook git, una volta per macchina
uv tool install pre-commit; pre-commit install

# CI in locale: in VS Code aprire tara.code-workspace e lanciare il task "CI locale completa"

# Database locale su localhost:55432 (con --profile api anche il backend in container)
docker compose -f infra/docker-compose.yml up -d
```

## Convenzioni

- Codice, identificatori e commenti tecnici in inglese; testi dell'interfaccia, docstring di dominio e documentazione in italiano.
- Valori nutrizionali sempre per 100 g o 100 ml; quantità in grammi o millilitri.
- TypeScript `strict`; Python con ruff (lint e format) e mypy `strict`.
- Prima di dichiarare finito un lavoro: typecheck, lint e test con coverage del pacchetto toccato devono passare (soglia 80%, solo verso l'alto). Definition of Done completa in `docs/processo.md`.
- Commit piccoli in stile Conventional Commits, con messaggio **in inglese** all'imperativo (`feat(mobile): add gram keypad`, `fix(api): …`, `docs: …`); anche il titolo della PR è in inglese, perché diventa il commit su `main`, mentre la descrizione della PR resta in italiano. Scope ammessi: `mobile`, `api`, `catalog`, `infra`, `ci`, `deps`, `deps-dev`, `docs`. Gli hook git lo verificano.
- Commit e PR hanno come unico autore Enrico: niente `Co-Authored-By` di Claude o altri assistenti, niente `Claude-Session`, niente "Generated with Claude Code" nelle descrizioni delle PR. Un hook commit-msg rifiuta questi trailer.
- Branch per funzione (`feat/<id-requisito>-<breve>`), PR con il modello del repository, merge squash su `main` solo con CI verde. Mai commit diretti su `main`.
- Dipendenze: `npx expo install` nell'app, `uv add` / `uv add --dev` in Python; mai `pip install` nei progetti. Lockfile sempre committati.
- Quando una decisione cambia i requisiti, aggiorna `docs/requisiti.md` nello stesso commit.
- Database: ogni modifica allo schema passa da una migrazione Alembic riletta a mano; le regole di dominio sono vincoli del database, verificati da test che nominano il vincolo atteso.
- Prompt e schemi di output dei modelli AI vivono nel repository e sono versionati; ogni cambio di modello o prompt passa dagli eval.

## Come lavorare

Muoviti come un software engineer: chiarisci il requisito (ID in `docs/requisiti.md`), proponi un piano breve, scrivi i test insieme al codice, fai commit piccoli e spiega i compromessi. Non aggiungere funzioni di fasi successive prima che la fase corrente superi il suo gate.
