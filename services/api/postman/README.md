# Prove a mano dell'API

`tara-api.postman_collection.json` raccoglie le richieste principali dell'API, ciascuna con i suoi controlli. Serve per provare l'API a mano. Il quality gate restano i test pytest in CI.

## Preparazione

```powershell
docker compose -f infra/docker-compose.yml up -d --wait db
cd services/api
uv run alembic upgrade head
uv run python -m tara_api.catalog_load ../../pipelines/catalog/data/build/ciqual-2025/catalogo.jsonl
uv run uvicorn tara_api.main:app --reload
```

In VS Code ci sono i task "Backend: avvia API in locale" e "Backend: collezione Postman".

## Tre modi per provarla

- **Swagger**: http://localhost:8000/docs, generato da FastAPI, con "Try it out" su ogni endpoint. Non serve installare niente.
- **Postman** (app o estensione VS Code `postman.postman-for-vscode`): importa la collezione e l'ambiente `locale.postman_environment.json`, scegli l'ambiente "Tara · locale" e lancia "Run collection". Serve un account Postman gratuito. La collezione resta un file del repository: non si pubblica sul cloud di Postman.
- **Newman**, da terminale e senza account:

  ```powershell
  npx --yes newman@6.2.1 run services/api/postman/tara-api.postman_collection.json -e services/api/postman/locale.postman_environment.json
  ```

## Regole

- Quando cambia un endpoint, aggiorna la richiesta e i suoi controlli nello stesso commit.
- Le variabili `foodId` e `catalogEtag` le imposta la collezione stessa durante l'esecuzione: le richieste vanno lanciate in ordine.
