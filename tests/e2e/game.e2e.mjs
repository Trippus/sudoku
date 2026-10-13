// End-to-end tests: the real game in headless Edge, driven through its buttons.
// Run: npm run test:e2e
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, DOM } from './harness.mjs';

let g;
before(async () => (g = await startGame()));
after(async () => g?.stop());
beforeEach(async () => g.fresh());
afterEach(() => assert.deepEqual(g.page.errors, [], 'no errors in the browser console'));

const run = (js) => g.page.eval(DOM + js);

test('intro shows on launch and "Nyt spil" starts the chosen level', async () => {
  const r = await run(`
    const introOpen = $('#intro').classList.contains('open');
    $('#iLevelSeg [data-level="hard"]').click();
    $('#iNew').click();
    await wait(500);
    return { introOpen, introAfter: $('#intro').classList.contains('open'), level: A.state.level, hud: $('#level').textContent,
      givens: A.state.values.filter(Boolean).length, cells: document.querySelectorAll('.cell').length };
  `);
  assert.equal(r.introOpen, true);
  assert.equal(r.introAfter, false);
  assert.equal(r.level, 'hard');
  assert.equal(r.hud, 'Svær');
  assert.equal(r.cells, 81);
  assert.ok(r.givens >= 17 && r.givens < 81);
});

test('a wrong digit counts as a mistake, is marked red, and undo removes it', async () => {
  const r = await run(`
    $('#iNew').click(); await wait(400);
    const i = firstEmpty();
    const wrong = (+A.state.solution[i] % 9) + 1;
    tapCell(i); press(wrong); await wait(50);
    const after = { v: A.state.values[i], mistakes: A.state.mistakes, red: $('.cell[data-i="' + i + '"]').classList.contains('wrong'), hud: $('#mistakes').textContent };
    $('#undoBtn').click(); await wait(50);
    return { ...after, undone: A.state.values[i], mistakesAfterUndo: A.state.mistakes };
  `);
  assert.ok(r.v > 0);
  assert.equal(r.mistakes, 1);
  assert.equal(r.red, true);
  assert.equal(r.hud, '1');
  assert.equal(r.undone, 0);
  assert.equal(r.mistakesAfterUndo, 1, 'undo does not erase the mistake count');
});

test('with "Vis fejl" off, wrong digits are not marked and not counted', async () => {
  const r = await run(`
    $('#iNew').click(); await wait(400);
    $('#menuBtn').click(); await wait(100);
    $('#optErrors').click(); $('#menuClose').click(); await wait(100);
    const i = firstEmpty();
    tapCell(i); press((+A.state.solution[i] % 9) + 1); await wait(50);
    return { mistakes: A.state.mistakes, red: $('.cell[data-i="' + i + '"]').classList.contains('wrong') };
  `);
  assert.equal(r.mistakes, 0);
  assert.equal(r.red, false);
});

test('notes toggle on and off, and a correct digit clears that note from its peers', async () => {
  const r = await run(`
    $('#iNew').click(); await wait(400);
    const S = A.S, st = A.state;
    const i = firstEmpty();
    const d = +st.solution[i];
    // an empty peer of i to hold the note
    const peer = S.PEERS[i].find((j) => !st.values[j]);
    $('#notesBtn').click();
    tapCell(peer); press(d); press(d === 9 ? 1 : d + 1); await wait(50);
    const notesBefore = st.notes[peer];
    press(d === 9 ? 1 : d + 1); await wait(50);
    const toggledOff = st.notes[peer];
    $('#notesBtn').click();
    tapCell(i); press(d); await wait(50);
    return { notesBefore, toggledOff, bit: S.bit(d), notesAfter: st.notes[peer], badge: $('#notesBtn .badge').textContent };
  `);
  assert.equal(r.notesBefore & r.bit, r.bit, 'note was added');
  assert.equal(r.toggledOff, r.bit, 'pressing a note again removes it');
  assert.equal(r.notesAfter & r.bit, 0, 'placing the digit cleared the note in the peer');
  assert.equal(r.badge, 'FRA');
});

test('given digits cannot be changed or erased', async () => {
  const r = await run(`
    $('#iNew').click(); await wait(400);
    const i = A.state.values.findIndex(Boolean);
    const before = A.state.values[i];
    tapCell(i); press(before === 9 ? 1 : before + 1); $('#eraseBtn').click(); await wait(50);
    return { before, after: A.state.values[i], history: $('#undoBtn').disabled };
  `);
  assert.equal(r.after, r.before);
  assert.equal(r.history, true, 'nothing was added to undo');
});

test('a hint places a correct digit and explains it', async () => {
  const r = await run(`
    $('#iNew').click(); await wait(400);
    const filled = A.state.values.filter(Boolean).length;
    $('#hintBtn').click(); await wait(100);
    const i = A.state.values.findIndex((v, k) => v && !A.S.fromString(A.state.puzzle)[k]);
    return { added: A.state.values.filter(Boolean).length - filled, correct: A.state.values[i] === +A.state.solution[i], hints: A.state.hints, toast: $('#toast').textContent };
  `);
  assert.equal(r.added, 1);
  assert.equal(r.correct, true);
  assert.equal(r.hints, 1);
  assert.ok(r.toast.length > 5);
});

test('a hint points out a wrong digit before anything else', async () => {
  const r = await run(`
    $('#iNew').click(); await wait(400);
    const i = firstEmpty();
    tapCell(i); press((+A.state.solution[i] % 9) + 1);
    tapCell(40);
    $('#hintBtn').click(); await wait(100);
    return { i, sel: +$('.cell.sel').dataset.i, toast: $('#toast').textContent };
  `);
  assert.equal(r.sel, r.i);
  assert.match(r.toast, /forkert/);
});

test('solving the puzzle shows the win screen and updates statistics', async () => {
  const r = await run(`
    $('#iLevelSeg [data-level="easy"]').click();
    $('#iNew').click(); await wait(400);
    const st = A.state;
    const empty = st.values.map((v, i) => v ? -1 : i).filter((i) => i >= 0);
    for (const i of empty) { tapCell(i); press(+st.solution[i]); }
    await wait(1900);
    const saved = JSON.parse(localStorage.getItem('sudoku.v1'));
    return { won: st.won, modal: $('#winModal').classList.contains('open'), badges: $('#wBadges').textContent, stats: saved.stats.levels.easy };
  `);
  assert.equal(r.won, true);
  assert.equal(r.modal, true);
  assert.match(r.badges, /Perfekt/);
  assert.equal(r.stats.played, 1);
  assert.equal(r.stats.won, 1);
  assert.equal(r.stats.perfect, 1);
});

test('a game in progress survives a reload and can be continued', async () => {
  const before = await run(`
    $('#iNew').click(); await wait(400);
    const i = firstEmpty();
    tapCell(i); press(+A.state.solution[i]); await wait(50);
    return { puzzle: A.state.puzzle, values: A.state.values.join('') };
  `);
  await g.reload();
  const r = await run(`
    const cont = !$('#iContinue').hidden;
    $('#iContinue').click(); await wait(300);
    return { cont, puzzle: A.state.puzzle, values: A.state.values.join('') };
  `);
  assert.equal(r.cont, true);
  assert.equal(r.puzzle, before.puzzle);
  assert.equal(r.values, before.values);
});

test("today's sudoku uses the date as its seed and is marked done after solving", async () => {
  const r = await run(`
    $('#iDaily').click(); await wait(600);
    const st = A.state;
    const d = new Date();
    const expected = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const info = { seed: st.seed, expected, daily: st.daily, hud: $('#level').textContent };
    for (const i of st.values.map((v, i) => v ? -1 : i).filter((i) => i >= 0)) { tapCell(i); press(+st.solution[i]); }
    await wait(1900);
    $('#wHome').click(); await wait(400);
    return { ...info, done: $('#iDaily').classList.contains('done'), badge: $('#wBadges').textContent };
  `);
  assert.equal(r.seed, r.expected);
  assert.equal(r.hud, 'Dagens');
  assert.equal(r.done, true);
  assert.match(r.badge, /Dagens sudoku/);
});

test('keyboard: arrows move, digits enter, Backspace erases', async () => {
  const r = await run(`
    $('#iNew').click(); await wait(400);
    const i = firstEmpty();
    tapCell(i);
    key('ArrowRight'); key('ArrowLeft');
    key(String(A.state.solution[i])); await wait(50);
    const placed = A.state.values[i];
    key('Backspace'); await wait(50);
    return { sel: +$('.cell.sel').dataset.i, i, placed, after: A.state.values[i], sol: +A.state.solution[i] };
  `);
  assert.equal(r.sel, r.i);
  assert.equal(r.placed, r.sol);
  assert.equal(r.after, 0);
});

test('menu: dark theme and statistics table', async () => {
  const r = await run(`
    $('#iNew').click(); await wait(400);
    $('#menuBtn').click(); await wait(100);
    $('#themeSeg [data-v="dark"]').click();
    return { theme: document.documentElement.dataset.theme, rows: document.querySelectorAll('#statsTable > span').length };
  `);
  assert.equal(r.theme, 'dark');
  assert.equal(r.rows, 20, 'header + 4 levels, 4 columns each');
});

test('"Nyt spil" mid-game asks first, and "Spil videre" keeps the puzzle', async () => {
  const r = await run(`
    $('#iNew').click(); await wait(400);
    const i = firstEmpty();
    tapCell(i); press(+A.state.solution[i]); await wait(50);
    const puzzle = A.state.puzzle;
    $('#menuBtn').click(); await wait(100);
    $('#mNew').click(); await wait(200);
    const asked = $('#confirmModal').classList.contains('open');
    $('#confirmModal [data-act="cancel"]').click(); await wait(200);
    return { asked, same: A.state.puzzle === puzzle, closed: !$('#confirmModal').classList.contains('open') };
  `);
  assert.deepEqual(r, { asked: true, same: true, closed: true });
});

test('settings stick after a reload', async () => {
  await run(`
    $('#iNew').click(); await wait(400);
    $('#menuBtn').click(); await wait(100);
    $('#themeSeg [data-v="dark"]').click();
    $('#optSame').click();
    $('#optSound').click();
    $('#menuClose').click();
  `);
  await g.reload();
  const r = await run(`
    const s = JSON.parse(localStorage.getItem('sudoku.v1')).settings;
    return { theme: document.documentElement.dataset.theme, same: s.highlightSame, sound: s.sound };
  `);
  assert.deepEqual(r, { theme: 'dark', same: false, sound: false });
});
