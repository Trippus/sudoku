// Rules engine: generator, solver, grader and hints (js/sudoku.js).
// Run: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../js/sudoku.js';

const KNOWN_EASY = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const SEEDS = Array.from({ length: 8 }, (_, k) => 1000 + k * 7919);

describe('board structure', () => {
  test('27 units of 9 distinct cells, and every cell has 20 peers', () => {
    assert.equal(S.UNITS.length, 27);
    for (const u of S.UNITS) assert.equal(new Set(u).size, 9);
    for (const p of S.PEERS) assert.equal(p.length, 20);
  });

  test('row, column and box of a cell', () => {
    assert.deepEqual([S.row(0), S.col(0), S.box(0)], [0, 0, 0]);
    assert.deepEqual([S.row(40), S.col(40), S.box(40)], [4, 4, 4]);
    assert.deepEqual([S.row(80), S.col(80), S.box(80)], [8, 8, 8]);
    assert.deepEqual([S.row(33), S.col(33), S.box(33)], [3, 6, 5]);
  });

  test('toString and fromString round-trip', () => {
    assert.equal(S.toString(S.fromString(KNOWN_EASY)), KNOWN_EASY);
  });
});

describe('solver', () => {
  test('a known puzzle has exactly one solution', () => {
    assert.equal(S.countSolutions(S.fromString(KNOWN_EASY)), 1);
    const sol = S.solve(S.fromString(KNOWN_EASY));
    assert.ok(sol.every((d) => d >= 1 && d <= 9));
  });

  test('an empty grid has many solutions (stops at the limit)', () => {
    assert.equal(S.countSolutions(new Array(81).fill(0), 2), 2);
  });

  test('a grid with a clash has no solutions', () => {
    const g = S.fromString(KNOWN_EASY);
    g[2] = 5; // a second 5 in the first row
    assert.equal(S.countSolutions(g), 0);
    assert.equal(S.solve(g), null);
  });
});

describe('grader', () => {
  test('a singles-only puzzle is tier 1 and is solved correctly', () => {
    const g = S.grade(S.fromString(KNOWN_EASY));
    assert.equal(g.tier, 1);
    assert.ok(g.solved);
    assert.deepEqual(g.values, S.solve(S.fromString(KNOWN_EASY)));
  });

  test('maxTier stops as soon as a harder technique is needed', () => {
    const p = S.generate('hard', SEEDS[0]);
    const g = S.grade(p.puzzle, 1);
    assert.equal(g.solved, false);
    assert.equal(g.tier, 2);
  });
});

describe('generator', () => {
  for (const level of S.LEVELS) {
    test(`${level}: unique, on level, logically solvable and deterministic`, () => {
      const { tiers: [lo, hi], minGivens } = S.LEVEL_RULES[level];
      for (const seed of SEEDS) {
        const p = S.generate(level, seed);
        const where = `${level} #${seed}`;
        assert.equal(S.countSolutions(p.puzzle), 1, `${where} has one solution`);
        assert.ok(p.puzzle.every((d, i) => !d || d === p.solution[i]), `${where} givens match the solution`);
        assert.ok(p.givens >= minGivens, `${where} keeps at least ${minGivens} givens`);
        const g = S.grade(p.puzzle);
        assert.ok(g.solved, `${where} can be solved by logic`);
        assert.deepEqual(g.values, p.solution, `${where} logic reaches the real solution`);
        assert.ok(g.tier >= lo && g.tier <= hi, `${where} tier ${g.tier} within ${lo}-${hi}`);
        assert.equal(S.toString(S.generate(level, seed).puzzle), S.toString(p.puzzle), `${where} is deterministic`);
      }
    });
  }

  // Puzzle numbers and the daily puzzle depend on the generator giving the same puzzle
  // for the same seed forever. If this test fails, a change has altered every puzzle:
  // only update these strings on purpose.
  test('golden puzzles have not changed', () => {
    assert.equal(S.toString(S.generate('medium', 20261013).puzzle), '...6..79.4...7....6...953..87..5......3...6......1..53..856...2....8...9.46..3...');
    assert.equal(S.toString(S.generate('hard', 20261017).puzzle), '..2..6........4.9..7...12.89.3....16.........21....7.31.68...4..3.1........5..1..');
    assert.equal(S.toString(S.generate('expert', 777).puzzle), '....7...4..1.325.86.2...7.....4...321...6...728...3.....5...3.99.458.2..8...2....');
  });
});

describe('hints', () => {
  for (const level of S.LEVELS) {
    test(`${level}: following hints alone always places correct digits and solves the puzzle`, () => {
      const p = S.generate(level, SEEDS[1]);
      const v = p.puzzle.slice();
      let steps = 0;
      for (; v.some((d) => !d) && steps < 81; steps++) {
        const h = S.nextPlacement(v);
        assert.ok(h, `a hint exists after ${steps} steps`);
        assert.equal(v[h.i], 0, 'hint targets an empty cell');
        assert.equal(h.d, p.solution[h.i], `hint digit is correct at cell ${h.i}`);
        assert.ok(h.technique in S.TECHNIQUES);
        v[h.i] = h.d;
      }
      assert.deepEqual(v, p.solution);
    });
  }

  test('a hidden single reports which unit it was found in', () => {
    for (const seed of SEEDS) {
      const p = S.generate('medium', seed);
      const h = S.nextPlacement(p.puzzle);
      if (h.technique !== 'hiddenSingle') continue;
      assert.ok(S.UNITS[h.unit].includes(h.i));
      return;
    }
  });
});
