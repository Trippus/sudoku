# Sudoku

Sudoku by Trippus Games, as an installable web app (PWA) that is ready to be wrapped as an Android app. It has no dependencies and no build step.

## Features
- Four levels: Let, Mellem, Svær and Ekspert
- A daily puzzle that is the same for everyone, with a day streak
- Notes, undo, erase, "fill all notes", and mistakes shown straight away (this can be turned off)
- Hints that explain *why* a digit goes in a cell ("5 kan kun stå her i boksen")
- Completed rows, columns and boxes light up, and a golden wave plays when you win
- Statistics per level (solved, best time, average time)
- Light, dark and automatic theme, plus a landscape layout for tablets
- Saves automatically and works offline through a service worker
- Sounds are synthesized with Web Audio, so there are no audio files

## How puzzles are made (`js/sudoku.js`)
- A random full grid is made from a seeded RNG, so the same puzzle number always gives the same puzzle. The daily puzzle uses the date as its seed.
- Digits are removed in symmetric pairs, and only while the puzzle keeps **exactly one solution** and stays solvable with the techniques its level allows.
- Puzzles are graded by the **hardest technique a person needs**, not by how many digits are missing:

| Level | Techniques | Givens |
|---|---|---|
| Let | singles only | 38 |
| Mellem | singles only | ~28 |
| Svær | + locked candidates, naked/hidden pairs | ~27 |
| Ekspert | + triples, X-wing, XY-wing, swordfish | ~27 |

Every puzzle can be solved without guessing. Making one takes under 0.2 s on a PC (`npm test` prints the timings).

## Run locally
```bash
npm start
```
Open http://localhost:5181. The server also prints a LAN address, so you can try the game on your phone over the same Wi-Fi.

## Scripts
- `npm test`: checks the generator (one solution, correct level, deterministic, timing)
- `npm run icons`: renders the icons from `tools/icon.html` with headless Edge
- `npm run shots`: renders store screenshots and the feature graphic (needs `npm start` running)
- `npm run check-listing`: checks `store/listing.md` against Google Play's length limits

## Structure
- `js/sudoku.js`: pure rules: generator, solver, grader and hints. It has no DOM code and also runs in Node
- `js/app.js`: rendering, input, persistence and UI
- `js/audio.js`: synthesized sound effects
- `js/ads.js`: ad layer (off by default; add `?reklame=demo` to the URL to preview placements)
- `tools/edge.mjs`: a small headless Edge (DevTools Protocol) helper for icons and screenshots
- `store/`: store texts and graphics
- `sw.js`: offline cache. Bump `VERSION` when you ship changes

## Before release
- Replace `[KONTAKT-EMAIL]` in `privacy.html`
- Add AdMob and the consent dialog when wrapping with Capacitor. The privacy policy mentions **Menu → Privatlivsindstillinger**, which has to be added together with the consent dialog
