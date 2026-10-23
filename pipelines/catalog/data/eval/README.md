# Set di valutazione

`traduzioni.csv`: 53 alimenti CIQUAL con la traduzione italiana di riferimento, verificata a mano. Copre i generici della dieta tipica e i casi difficili: varianti crude e cotte, legumi secchi e in scatola, fiocchi d'avena, uovo sodo, quark, acqua minerale con marchio.

| Colonna | Significato |
| --- | --- |
| `codice` | Codice CIQUAL dell'alimento |
| `originale` | Nome francese, per leggibilità |
| `nome_atteso` | Nome italiano di riferimento, senza stato né cottura |
| `stato_atteso` | `raw`, `cooked` o `not_applicable` |
| `parole_nome` | Parole (o radici) che il nome tradotto deve contenere, separate da `;`; alternative equivalenti separate da `\|` (es. `essiccat\|disidratat`) |

Si usa con `uv run python -m tara_catalog.translate eval`: ogni cambio di modello o di prompt passa da qui prima della traduzione completa. Correggere un riferimento è una modifica come le altre, con la sua PR.

Nomi originali: Anses. 2025. Table de composition nutritionnelle des aliments Ciqual (Licence Ouverte / Etalab 2.0).
