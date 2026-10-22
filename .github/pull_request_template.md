## Cosa cambia

<!-- Una o due frasi: cosa fa questa PR e perché. -->

**Requisiti:** <!-- es. RF-03, RNF-04; "nessuno" per manutenzione -->

## Come l'ho verificato

<!-- Test aggiunti, comandi eseguiti, prova sul dispositivo o nell'emulatore. -->

## Compromessi e note per il futuro

<!-- Scelte non ovvie, alternative scartate, debito tecnico lasciato consapevolmente. -->

## Definition of Done

- [ ] Titolo della PR in Conventional Commits (diventa il commit su `main`)
- [ ] Test scritti insieme al codice; coverage sopra la soglia
- [ ] Type check, lint e test verdi in locale e in CI
- [ ] `docs/requisiti.md` aggiornato se cambia un requisito o una decisione
- [ ] Migrazioni del database reversibili e testate (se presenti)
- [ ] Prompt e schemi AI versionati e passati dagli eval (se toccati)
- [ ] Nessun segreto, dato personale o file grezzo nel diff
