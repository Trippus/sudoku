// Renders the Google Play store graphics with headless Microsoft Edge:
// phone screenshots (1080×1920) and the feature graphic (1024×500).
// Usage: start the dev server (npm start), then: npm run shots
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withEdge } from './edge.mjs';

const BASE = process.env.BASE || 'http://localhost:5181/';
const out = fileURLToPath(new URL('../store/', import.meta.url));

const PHONE = { width: 412, height: 732, deviceScaleFactor: 2.625, mobile: true }; // → 1081×1921
const BANNER = { width: 1024, height: 500, deviceScaleFactor: 1, mobile: false };
const wait = (ms) => `await new Promise(r => setTimeout(r, ${ms}));`;

// A believable puzzle in progress: about half solved, a few notes, one cell selected.
const MID_GAME = `
  document.querySelector('#iNew').click();
  ${wait(1500)}
  const A = window.__sudoku, S = A.S, st = A.state;
  const p = S.generate('medium', 31337);
  Object.assign(st, { level: 'medium', seed: 31337, puzzle: S.toString(p.puzzle), solution: S.toString(p.solution),
    values: p.puzzle.slice(), notes: new Array(81).fill(0), elapsed: 287, started: true });
  for (let k = 0; k < 18; k++) { const s = S.nextPlacement(st.values); if (!s) break; st.values[s.i] = s.d; }
  for (let i = 0, n = 0; i < 81 && n < 6; i++) if (!st.values[i] && i > 50) {
    let m = S.ALL; for (const j of S.PEERS[i]) if (st.values[j]) m &= ~S.bit(st.values[j]);
    st.notes[i] = m; n++;
  }
  A.state = st;
  const pick = st.values.findIndex((v) => v === 7);
  document.querySelector('.cell[data-i="' + pick + '"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  ${wait(600)}`;

const WIN = `
  document.querySelector('#iNew').click();
  ${wait(1500)}
  const A = window.__sudoku, st = A.state;
  let last = -1;
  for (let i = 0; i < 81; i++) if (!st.values[i]) last = i;
  for (let i = 0; i < 81; i++) if (!st.values[i] && i !== last) st.values[i] = +st.solution[i];
  st.started = true; st.elapsed = 412;
  A.render();
  document.querySelector('.cell[data-i="' + last + '"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  document.querySelector('#pad button[data-d="' + st.solution[last] + '"]').click();
  ${wait(2600)}`;

const STATS = JSON.stringify({
  settings: { level: 'medium', sound: true, showErrors: true, highlightSame: true, autoNotes: true, theme: 'light' },
  stats: {
    levels: {
      easy: { played: 14, won: 14, bestTime: 241, totalTime: 14 * 318, perfect: 9 },
      medium: { played: 22, won: 21, bestTime: 402, totalTime: 21 * 561, perfect: 7 },
      hard: { played: 9, won: 7, bestTime: 733, totalTime: 7 * 1012, perfect: 1 },
      expert: { played: 3, won: 2, bestTime: 1394, totalTime: 2 * 1630, perfect: 0 },
    },
    daily: { streak: 6, best: 11, last: '', done: 31 },
  },
});
const MENU = `
  document.querySelector('#iNew').click();
  ${wait(1500)}
  document.querySelector('#menuBtn').click();
  ${wait(700)}`;
const DARK = `
  ${MID_GAME}
  document.documentElement.dataset.theme = 'dark';
  ${wait(400)}`;

const shots = [
  { file: 'screenshots/1-intro.png', view: PHONE, url: BASE, setup: wait(1800) },
  { file: 'screenshots/2-spil.png', view: PHONE, url: BASE, setup: MID_GAME },
  { file: 'screenshots/3-sejr.png', view: PHONE, url: BASE, setup: WIN },
  { file: 'screenshots/4-menu.png', view: PHONE, url: BASE, storage: STATS, setup: MENU },
  { file: 'screenshots/5-moerk.png', view: PHONE, url: BASE, setup: DARK },
  { file: 'feature-graphic-da.png', view: BANNER, url: BASE + 'store/feature-graphic.html', setup: wait(800) },
  { file: 'feature-graphic-en.png', view: BANNER, url: BASE + 'store/feature-graphic.html?lang=en', setup: wait(800) },
];

mkdirSync(out + 'screenshots', { recursive: true });
await withEdge(async (page) => {
  for (const shot of shots) {
    // Start every shot from a clean slate (optionally with saved stats). The storage is
    // prepared on a page without the game, so the game can't save over it on unload.
    await page.open(BASE + 'privacy.html', shot.view);
    const seed = shot.storage ? `localStorage.setItem('sudoku.v1', ${JSON.stringify(shot.storage)});` : '';
    await page.eval(`localStorage.clear(); ${seed}`);
    await page.open(shot.url, shot.view);
    await page.eval(shot.setup);
    writeFileSync(out + shot.file, await page.shot());
    console.log('store/' + shot.file);
  }
});
