# Tara

Tracciamento della dieta per bodybuilder, in italiano: grammi in primo piano, lettura etichette, ricette, tipi di giornata, integratori, cardio e passi. L'AI trascrive e stima le quantità; i valori nutrizionali arrivano sempre da fonti tabellari.

| Cartella | Contenuto |
| --- | --- |
| `apps/mobile` | App Expo (React Native, TypeScript) |
| `services/api` | Backend FastAPI |
| `pipelines/catalog` | Import, traduzione e validazione del catalogo dei generici |
| `infra` | Postgres + pgvector per lo sviluppo locale |
| `docs` | [Requisiti](docs/requisiti.md) e [handoff](docs/handoff.md) |

Comandi di sviluppo e convenzioni: [CLAUDE.md](CLAUDE.md).

## Fonti dati

Open Food Facts (ODbL), CIQUAL/CALNUT (ANSES), USDA FoodData Central (pubblico dominio). Attribuzioni e condizioni in [docs/requisiti.md](docs/requisiti.md#fonti-dati-e-licenze).
