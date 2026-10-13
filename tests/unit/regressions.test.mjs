// Regression tests for reported bugs in the rules engine. One test per bug, named after
// its report in bugs/: test('BUG-001: …', …). See bugs/README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../js/sudoku.js';

// Example of the shape (not a real bug):
// test('BUG-001: hint for expert #777 places a wrong digit', () => {
//   const p = S.generate('expert', 777);
//   const h = S.nextPlacement(p.puzzle);
//   assert.equal(h.d, p.solution[h.i]);
// });

test('regression suite loads', () => assert.ok(S.LEVELS.length));
