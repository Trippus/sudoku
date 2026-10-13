// Regression tests for reported bugs in the game screen (buttons, saving, layout).
// One test per bug, named after its report in bugs/: test('BUG-001: …', …). See bugs/README.md.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startGame, DOM } from './harness.mjs';

let g;
before(async () => (g = await startGame()));
after(async () => g?.stop());
beforeEach(async () => g.fresh());
afterEach(() => assert.deepEqual(g.page.errors, [], 'no errors in the browser console'));

const run = (js) => g.page.eval(DOM + js);

// Example of the shape (not a real bug):
// test('BUG-002: undo after a hint brings back the empty cell', async () => {
//   const r = await run(`
//     $('#iNew').click(); await wait(400);
//     $('#hintBtn').click(); await wait(50);
//     $('#undoBtn').click(); await wait(50);
//     return A.state.values.filter(Boolean).length === A.S.fromString(A.state.puzzle).filter(Boolean).length;
//   `);
//   assert.equal(r, true);
// });

test('regression suite loads the game', async () => {
  assert.equal(await run('return document.querySelectorAll(".cell").length'), 81);
});
