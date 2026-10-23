# Tara

[![CI](https://github.com/Enric0-Balb0/tara/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Enric0-Balb0/tara/actions/workflows/ci.yml)

Tracciamento della dieta per bodybuilder, in italiano: grammi in primo piano, lettura etichette, ricette, tipi di giornata, integratori, cardio e passi. L'AI trascrive e stima le quantità; i valori nutrizionali arrivano sempre da fonti tabellari.

| Cartella | Contenuto |
| --- | --- |
| `apps/mobile` | App Expo (React Native, TypeScript) |
| `services/api` | Backend FastAPI, distribuito come immagine Docker su GHCR |
| `pipelines/catalog` | Import, traduzione e validazione del catalogo dei generici |
| `infra` | Postgres + pgvector (e il backend in container) per lo sviluppo locale |
| `docs` | [Requisiti](docs/requisiti.md), [handoff](docs/handoff.md), [processo di sviluppo](docs/processo.md), [strumenti](docs/strumenti.md) |

## Per iniziare

Servono Git, Node 22, [uv](https://docs.astral.sh/uv/) e Docker; i passi completi sono in [docs/processo.md](docs/processo.md#preparare-una-nuova-macchina).

```powershell
uv tool install pre-commit; pre-commit install
cd apps/mobile; npm ci; npx expo start
```

Comandi di ogni pacchetto e convenzioni: [CLAUDE.md](CLAUDE.md). Ogni modifica passa da branch, pull request e CI verde: [docs/processo.md](docs/processo.md).

## Fonti dati

Open Food Facts (ODbL), Anses. 2025. Table de composition nutritionnelle des aliments Ciqual (Licence Ouverte / Etalab 2.0), USDA FoodData Central (pubblico dominio). Attribuzioni e condizioni in [docs/requisiti.md](docs/requisiti.md#fonti-dati-e-licenze).
