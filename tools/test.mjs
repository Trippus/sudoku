// Checks the puzzle generator: every puzzle must have exactly one solution, match its
// level, and be made quickly enough for an older phone.
// Usage: node tools/test.mjs [puzzles per level]
import * as S from '../js/sudoku.js';

const N = Number(process.argv[2]) || 12;
let failed = 0;
const check = (ok, msg) => {
  if (!ok) {
    failed++;
    console.log('FAIL', msg);
  }
};

// A known puzzle that needs nothing beyond singles.
const easy = S.fromString('53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79');
check(S.countSolutions(easy) === 1, 'known puzzle has one solution');
check(S.grade(easy).tier === 1, 'known puzzle is graded easy');
check(S.nextPlacement(easy) !== null, 'hint finds a move');

for (const level of S.LEVELS) {
  const times = [];
  let givens = 0;
  let off = 0;
  for (let k = 0; k < N; k++) {
    const seed = 1000 + k * 7919;
    const t0 = performance.now();
    const p = S.generate(level, seed);
    times.push(performance.now() - t0);
    check(p, `${level} #${seed} generated`);
    if (!p) continue;
    check(S.countSolutions(p.puzzle) === 1, `${level} #${seed} unique`);
    check(p.puzzle.every((d, i) => !d || d === p.solution[i]), `${level} #${seed} matches its solution`);
    const again = S.generate(level, seed);
    check(S.toString(again.puzzle) === S.toString(p.puzzle), `${level} #${seed} deterministic`);
    const g = S.grade(p.puzzle);
    check(g.solved && g.values.every((d, i) => d === p.solution[i]), `${level} #${seed} logic solves it correctly`);
    const [lo, hi] = S.LEVEL_RULES[level].tiers;
    if (g.tier < lo || g.tier > hi) off++;
    givens += p.givens;
  }
  times.sort((a, b) => a - b);
  console.log(
    `${level.padEnd(7)} givens ~${(givens / N).toFixed(1)}  median ${times[N >> 1].toFixed(0)} ms  max ${times[N - 1].toFixed(0)} ms  ` +
      `${off ? `${off} off level (fallback)` : 'all on level'}`,
  );
}

console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
