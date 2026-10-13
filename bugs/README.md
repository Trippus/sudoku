# Fejlrapporter

Hver fejl får sin egen fil her: `BUG-001-kort-navn.md`, `BUG-002-…` (fortløbende numre).
Kopiér `_skabelon.md` og udfyld den.

## Sådan rettes en fejl

1. **Registrér**: opret `BUG-00X-….md` ud fra skabelonen, med status `åben`.
2. **Genskab med en test, før du retter**: skriv en test, der fejler på grund af fejlen.
   - Fejl i reglerne/generatoren → `tests/unit/regressions.test.mjs`
   - Fejl i skærm, knapper, gem/indlæs → `tests/e2e/regressions.e2e.mjs`
   - Testens navn starter med fejlens nummer: `test('BUG-003: …', …)`
   - Kør den og se den fejle.
3. **Ret** koden, til testen består.
4. **Kør alle tests**: `npm run test:all`. Ved ændringer i spillets udseende: gennemgå også `tests/MANUAL.md`.
5. **Afslut**: sæt status til `rettet` i fejlfilen, tæl `VERSION` op i `sw.js`, og commit med beskeden `Fix BUG-00X: …`.

Testen bliver liggende for altid, så fejlen ikke kan komme igen uden at nogen opdager det.
