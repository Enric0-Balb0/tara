# Tara

App personale di tracciamento della dieta per bodybuilder, interamente in italiano, con AI usata solo dove toglie lavoro. Sostituisce la versione gratuita di FatSecret. Prima utente: Enrico; poi una cerchia ristretta di amici.

Leggi prima:
- `docs/requisiti.md`: requisiti con ID (RF-xx, RNF-xx), architettura, modello dati, roadmap a fasi F0–F5.
- `docs/handoff.md`: decisioni prese finora, perché, e prossimi passi concreti.

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
infra/              docker-compose per Postgres + pgvector in locale
docs/               Requisiti e handoff
```

## Comandi

Ambiente di sviluppo: Windows, PowerShell, Node 22, Python 3.12.

```powershell
# App
cd apps/mobile
npm install
npm run typecheck; npm run lint; npm test
npx expo start            # dev server

# Backend
cd services/api
python -m venv .venv; .venv\Scripts\Activate.ps1
pip install -e ".[dev]"
ruff check .; ruff format --check .; pytest
uvicorn tara_api.main:app --reload

# Pipeline del catalogo
cd pipelines/catalog
python -m venv .venv; .venv\Scripts\Activate.ps1
pip install -e ".[dev]"
ruff check .; pytest

# Database locale
docker compose -f infra/docker-compose.yml up -d
```

## Convenzioni

- Codice, identificatori e commenti tecnici in inglese; testi dell'interfaccia, docstring di dominio e documentazione in italiano.
- Valori nutrizionali sempre per 100 g o 100 ml; quantità in grammi o millilitri.
- TypeScript `strict`; Python con ruff (lint e format) e type hints.
- Prima di dichiarare finito un lavoro: typecheck, lint e test del pacchetto toccato devono passare.
- Commit piccoli in stile Conventional Commits (`feat(mobile): …`, `fix(api): …`, `docs: …`), in italiano o inglese ma coerenti nel branch.
- Branch per funzione (`feat/<id-requisito>-<breve>`), merge su `main` solo con CI verde.
- Quando una decisione cambia i requisiti, aggiorna `docs/requisiti.md` nello stesso commit.
- Prompt e schemi di output dei modelli AI vivono nel repository e sono versionati; ogni cambio di modello o prompt passa dagli eval.

## Come lavorare

Muoviti come un software engineer: chiarisci il requisito (ID in `docs/requisiti.md`), proponi un piano breve, scrivi i test insieme al codice, fai commit piccoli e spiega i compromessi. Non aggiungere funzioni di fasi successive prima che la fase corrente superi il suo gate.
