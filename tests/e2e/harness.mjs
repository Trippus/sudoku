// Shared setup for the end-to-end tests: starts the game's own dev server on a free
// port and a headless Edge, and gives each test a fresh page with empty storage.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchEdge, sleep } from '../../tools/edge.mjs';

export { sleep };
export const PHONE = { width: 390, height: 844, deviceScaleFactor: 1, mobile: true };

const root = fileURLToPath(new URL('../../', import.meta.url));

export async function startGame() {
  const port = 5600 + Math.floor(Math.random() * 300);
  const server = spawn(process.execPath, ['tools/serve.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => String(d).includes('running at') && resolve());
    server.on('exit', (code) => reject(new Error(`dev server exited (${code})`)));
  });
  const base = `http://localhost:${port}/`;
  const { page, close } = await launchEdge();

  return {
    page,
    base,
    // Opens the game with clean storage, optionally seeded with a saved game (an object).
    async fresh(saved = null, query = '') {
      await page.open(base + 'privacy.html', PHONE);
      await page.eval(`localStorage.clear(); ${saved ? `localStorage.setItem('sudoku.v1', ${JSON.stringify(JSON.stringify(saved))});` : ''}`);
      page.errors.length = 0;
      await page.open(base + query, PHONE);
      await sleep(300);
    },
    async reload() {
      await page.eval('window.dispatchEvent(new Event("pagehide"))');
      await page.open(base, PHONE);
      await sleep(300);
    },
    async stop() {
      await close();
      server.kill();
    },
  };
}

// Small DOM helpers that run inside the page. They act through the real buttons and
// the board's pointer events, the same way a player does.
export const DOM = `
  const $ = (s) => document.querySelector(s);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const A = window.__sudoku;
  const tapCell = (i) => document.querySelector('.cell[data-i="' + i + '"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  const press = (d) => document.querySelector('#pad button[data-d="' + d + '"]').click();
  const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  const firstEmpty = () => A.state.values.findIndex((v) => !v);
`;
