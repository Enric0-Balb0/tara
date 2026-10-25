# Valutazioni dei modelli AI

Storico delle valutazioni che giustificano la scelta di modelli e prompt. Ogni cambio di modello o di prompt aggiunge una sezione qui, con i numeri e la decisione.

## Traduzione dei nomi del catalogo · 23 ottobre 2026

Set: `pipelines/catalog/data/eval/traduzioni.csv`, 53 alimenti CIQUAL con traduzione di riferimento. Comando: `python -m tara_catalog.translate eval`. Metriche:
- **stato**: stato crudo/cotto/n.a. uguale al riferimento;
- **parole chiave**: il nome contiene le parole obbligatorie;
- **nome identico**: nome uguale al riferimento, a meno di maiuscole e accenti. È un criterio severo, perché più nomi possono essere corretti;
- **segnalati**: risposte fermate dai controlli deterministici.

### Disponibilità dei modelli Gemini sul piano gratuito

- `gemini-2.5-flash`: non più disponibile per i nuovi utenti (404).
- `gemini-3.5-flash`, `3.6-flash`, `3.7-flash`, `3.8-flash`: "high demand" (503) a ogni prova.
- `gemma-4-31b-it`: errori 500 e 503 del server.
- `gemini-flash-latest`: risponde, ma impiega 70 s per 3 nomi (circa 3.800 token di ragionamento).
- Rispondono in 2–3 s: `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-flash-lite-latest` (alias mobile, quindi escluso perché non riproducibile).

### Risultati

| Prompt | Modello | Stato | Parole chiave | Nome identico | Segnalati | Note |
| --- | --- | --- | --- | --- | --- | --- |
| v1 | gemini-3.5-flash-lite | 98% | 98% | 60% | 13 | Stato nel nome ("Uovo crudo"): i suggerimenti del glossario proponevano "crudo" |
| v1 | gemini-3.1-flash-lite | 81% | 81% | 36% | 14 | 10 alimenti saltati dal modello |
| v2 | gemini-3.5-flash-lite | 98% | 98–100% | 55% | 1 | Temperatura 0, due giri; riso basmati cotto tradotto come crudo (intercettato dai controlli) |
| v2 | gemini-3.1-flash-lite | 98% | 100% | 49% | 0 | Temperatura 0, due giri identici; unico disaccordo: fiocchi d'avena n.a. invece di crudo |

Correzioni tra la v1 e la v2:
- i termini di stato non si suggeriscono più per il nome; i metodi di cottura si suggeriscono per il campo `cooking`;
- esempi nel prompt presi fuori dal set di valutazione (un test lo verifica);
- secondo passaggio per gli alimenti saltati;
- alias duplicati scartati in automatico;
- `"null"` testuale convertito in nessun valore;
- controllo della cottura nel nome.

**Decisione:** `google:gemini-3.1-flash-lite` con il prompt `traduzione-v2`. È deterministico a temperatura 0, non ha segnalazioni e l'unico disaccordo è un caso ambiguo. `gemini-3.5-flash-lite` dà nomi leggermente più naturali, ma ha sbagliato lo stato di un alimento cotto.
