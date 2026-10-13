// Pure Sudoku rules: generator, solver and a human-style grader. No DOM code here,
// so the same file runs in the page, in the web worker and in Node (tools/test.mjs).
//
// A grid is an array of 81 numbers (0 = empty), row by row.
// Candidates are 9-bit masks: bit d-1 set means digit d is still possible.

export const LEVELS = ['easy', 'medium', 'hard', 'expert'];

// A puzzle is rated by the hardest technique a person needs, not by how many digits are
// missing. Tiers: 1 singles, 2 locked candidates and pairs, 3 triples and X-wing,
// 4 XY-wing and swordfish. Easy and medium both need only singles, but medium gives
// fewer digits, so you have to look harder to find them.
export const LEVEL_RULES = {
  easy: { tiers: [1, 1], minGivens: 38 },
  medium: { tiers: [1, 1], minGivens: 0 },
  hard: { tiers: [2, 2], minGivens: 0 },
  expert: { tiers: [3, 4], minGivens: 0 },
};

const ALL = 0x1ff;
const bit = (d) => 1 << (d - 1);
const popcount = (m) => {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
};
const digitOf = (m) => 31 - Math.clz32(m) + 1; // for a single-bit mask
const digits = (m) => {
  const out = [];
  for (let d = 1; d <= 9; d++) if (m & bit(d)) out.push(d);
  return out;
};

export const row = (i) => (i / 9) | 0;
export const col = (i) => i % 9;
export const box = (i) => 3 * ((i / 27) | 0) + (((i % 9) / 3) | 0);

// 27 units: rows 0-8, columns 9-17, boxes 18-26.
export const UNITS = [];
for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
for (let b = 0; b < 9; b++) {
  const r0 = 3 * ((b / 3) | 0);
  const c0 = 3 * (b % 3);
  UNITS.push(Array.from({ length: 9 }, (_, k) => (r0 + ((k / 3) | 0)) * 9 + c0 + (k % 3)));
}
const CELL_UNITS = Array.from({ length: 81 }, (_, i) => [row(i), 9 + col(i), 18 + box(i)]);
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const s = new Set();
  for (const u of CELL_UNITS[i]) for (const j of UNITS[u]) if (j !== i) s.add(j);
  return [...s];
});
const SEES = new Uint8Array(81 * 81);
PEERS.forEach((ps, i) => ps.forEach((j) => (SEES[i * 81 + j] = 1)));
const sees = (a, b) => SEES[a * 81 + b] === 1;

// Small seeded RNG (mulberry32), so a puzzle number always gives the same puzzle.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------- brute-force solver (uniqueness checks and full grids) ---------- */

// Counts solutions up to `limit`. The first solution found is written to `out`.
// With `rand`, digits are tried in random order (used to make random full grids).
export function countSolutions(grid, limit = 2, out = null, rand = null) {
  const g = Int8Array.from(grid);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  for (let i = 0; i < 81; i++) {
    const d = g[i];
    if (!d) continue;
    const m = bit(d);
    if ((rows[row(i)] | cols[col(i)] | boxes[box(i)]) & m) return 0; // clashes already
    rows[row(i)] |= m;
    cols[col(i)] |= m;
    boxes[box(i)] |= m;
  }
  let count = 0;
  const order = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const search = () => {
    // pick the empty cell with the fewest options
    let best = -1;
    let bestMask = 0;
    let bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = ALL & ~(rows[row(i)] | cols[col(i)] | boxes[box(i)]);
      const n = popcount(m);
      if (n < bestN) {
        best = i;
        bestMask = m;
        bestN = n;
        if (n <= 1) break;
      }
    }
    if (best < 0) {
      if (count++ === 0 && out) for (let i = 0; i < 81; i++) out[i] = g[i];
      return count >= limit;
    }
    if (!bestMask) return false;
    const r = row(best);
    const c = col(best);
    const b = box(best);
    for (const d of rand ? shuffle(order.slice(), rand) : order) {
      const m = bit(d);
      if (!(bestMask & m)) continue;
      g[best] = d;
      rows[r] |= m;
      cols[c] |= m;
      boxes[b] |= m;
      const stop = search();
      g[best] = 0;
      rows[r] &= ~m;
      cols[c] &= ~m;
      boxes[b] &= ~m;
      if (stop) return true;
    }
    return false;
  };
  search();
  return count;
}

export function solve(grid) {
  const out = new Array(81).fill(0);
  return countSolutions(grid, 2, out) === 1 ? out : null;
}

/* ---------- human-style solver: grading and hints ---------- */

export const TECHNIQUES = {
  nakedSingle: 1,
  hiddenSingle: 1,
  lockedCandidates: 2,
  nakedPair: 2,
  hiddenPair: 2,
  nakedTriple: 3,
  hiddenTriple: 3,
  xWing: 3,
  xyWing: 4,
  swordfish: 4,
};

function candidates(values) {
  const c = new Uint16Array(81);
  for (let i = 0; i < 81; i++) {
    if (values[i]) continue;
    let m = ALL;
    for (const j of PEERS[i]) if (values[j]) m &= ~bit(values[j]);
    c[i] = m;
  }
  return c;
}

function place(v, c, i, d) {
  v[i] = d;
  c[i] = 0;
  const m = ~bit(d);
  for (const j of PEERS[i]) c[j] &= m;
}

function* combos(arr, n, start = 0, acc = []) {
  if (acc.length === n) {
    yield acc;
    return;
  }
  for (let k = start; k <= arr.length - (n - acc.length); k++) yield* combos(arr, n, k + 1, [...acc, arr[k]]);
}

// Each finder returns a placement {i, d, ...} or an elimination {elims: [[i, mask], ...]}, or null.

function findNakedSingle(v, c) {
  for (let i = 0; i < 81; i++) if (!v[i] && popcount(c[i]) === 1) return { i, d: digitOf(c[i]), technique: 'nakedSingle' };
  return null;
}

function findHiddenSingle(v, c) {
  // boxes first: that is how most people scan
  for (const u of [18, 19, 20, 21, 22, 23, 24, 25, 26, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]) {
    for (let d = 1; d <= 9; d++) {
      let at = -1;
      let n = 0;
      for (const i of UNITS[u]) {
        if (v[i] === d) {
          n = -1;
          break;
        }
        if (c[i] & bit(d)) {
          at = i;
          n++;
        }
      }
      if (n === 1) return { i: at, d, unit: u, technique: 'hiddenSingle' };
    }
  }
  return null;
}

function elimination(technique, list) {
  const elims = list.filter(([, m]) => m);
  return elims.length ? { technique, elims } : null;
}

function findLockedCandidates(v, c) {
  for (let u = 0; u < 27; u++) {
    for (let d = 1; d <= 9; d++) {
      const m = bit(d);
      const cells = UNITS[u].filter((i) => c[i] & m);
      if (cells.length < 2) continue;
      // within a box, all in one row or column ("pointing"); within a line, all in one box ("claiming")
      const targets = u >= 18
        ? [cells.every((i) => row(i) === row(cells[0])) && row(cells[0]), cells.every((i) => col(i) === col(cells[0])) && 9 + col(cells[0])]
        : [cells.every((i) => box(i) === box(cells[0])) && 18 + box(cells[0])];
      for (const t of targets) {
        if (t === false) continue;
        const list = UNITS[t].filter((i) => !cells.includes(i) && c[i] & m).map((i) => [i, m]);
        const res = elimination('lockedCandidates', list);
        if (res) return res;
      }
    }
  }
  return null;
}

function findNakedSubset(v, c, n, technique) {
  for (const unit of UNITS) {
    const open = unit.filter((i) => !v[i] && popcount(c[i]) <= n);
    for (const set of combos(open, n)) {
      let mask = 0;
      for (const i of set) mask |= c[i];
      if (popcount(mask) !== n) continue;
      const res = elimination(technique, unit.filter((i) => !set.includes(i) && c[i] & mask).map((i) => [i, mask]));
      if (res) return res;
    }
  }
  return null;
}

function findHiddenSubset(v, c, n, technique) {
  for (const unit of UNITS) {
    const free = [];
    for (let d = 1; d <= 9; d++) if (!unit.some((i) => v[i] === d)) free.push(d);
    for (const set of combos(free, n)) {
      const mask = set.reduce((m, d) => m | bit(d), 0);
      const cells = unit.filter((i) => c[i] & mask);
      if (cells.length !== n || !set.every((d) => cells.some((i) => c[i] & bit(d)))) continue;
      const res = elimination(technique, cells.map((i) => [i, c[i] & ~mask]));
      if (res) return res;
    }
  }
  return null;
}

// X-wing (n = 2) and swordfish (n = 3).
function findFish(v, c, n, technique) {
  for (let d = 1; d <= 9; d++) {
    const m = bit(d);
    for (const byRow of [true, false]) {
      const lines = [];
      for (let a = 0; a < 9; a++) {
        const pos = [];
        for (let b = 0; b < 9; b++) if (c[byRow ? a * 9 + b : b * 9 + a] & m) pos.push(b);
        if (pos.length >= 2 && pos.length <= n) lines.push([a, pos]);
      }
      for (const set of combos(lines, n)) {
        const cover = new Set(set.flatMap(([, pos]) => pos));
        if (cover.size !== n) continue;
        const base = set.map(([a]) => a);
        const list = [];
        for (const b of cover) {
          for (let a = 0; a < 9; a++) {
            const i = byRow ? a * 9 + b : b * 9 + a;
            if (!base.includes(a) && c[i] & m) list.push([i, m]);
          }
        }
        const res = elimination(technique, list);
        if (res) return res;
      }
    }
  }
  return null;
}

function findXYWing(v, c) {
  const pairs = [];
  for (let i = 0; i < 81; i++) if (!v[i] && popcount(c[i]) === 2) pairs.push(i);
  for (const p of pairs) {
    const wings = pairs.filter((j) => j !== p && sees(p, j) && popcount(c[j] & c[p]) === 1);
    for (const [a, b] of combos(wings, 2)) {
      if (c[a] === c[b]) continue;
      const z = c[a] & c[b] & ~c[p];
      if (popcount(z) !== 1 || (c[a] | c[b] | c[p]) !== (c[p] | z)) continue;
      const list = [];
      for (let i = 0; i < 81; i++) if (i !== a && i !== b && c[i] & z && sees(i, a) && sees(i, b)) list.push([i, z]);
      const res = elimination('xyWing', list);
      if (res) return res;
    }
  }
  return null;
}

const FINDERS = [
  (v, c) => findNakedSingle(v, c),
  (v, c) => findHiddenSingle(v, c),
  (v, c) => findLockedCandidates(v, c),
  (v, c) => findNakedSubset(v, c, 2, 'nakedPair'),
  (v, c) => findHiddenSubset(v, c, 2, 'hiddenPair'),
  (v, c) => findNakedSubset(v, c, 3, 'nakedTriple'),
  (v, c) => findHiddenSubset(v, c, 3, 'hiddenTriple'),
  (v, c) => findFish(v, c, 2, 'xWing'),
  (v, c) => findXYWing(v, c),
  (v, c) => findFish(v, c, 3, 'swordfish'),
];

// Solves like a person would, always using the easiest technique that makes progress.
// Returns { tier, solved, steps } where tier is 1-4 (or 5 if our techniques get stuck).
// With `maxTier`, it gives up as soon as a harder technique would be needed.
export function grade(values, maxTier = 4) {
  const v = Array.from(values);
  const c = candidates(v);
  let tier = 0;
  let steps = 0;
  for (;;) {
    if (v.every((x) => x)) return { tier: Math.max(tier, 1), solved: true, steps, values: v };
    let step = null;
    for (const f of FINDERS) {
      step = f(v, c);
      if (step) break;
    }
    if (!step) return { tier: 5, solved: false, steps };
    const t = TECHNIQUES[step.technique];
    if (t > maxTier) return { tier: t, solved: false, steps };
    tier = Math.max(tier, t);
    steps++;
    if (step.elims) for (const [i, m] of step.elims) c[i] &= ~m;
    else place(v, c, step.i, step.d);
  }
}

// The next digit a person could logically place. Elimination steps needed on the way
// are applied silently and reported as `technique` (the hardest one used).
// Returns { i, d, technique, unit? } or null if logic alone gets stuck.
export function nextPlacement(values) {
  const v = Array.from(values);
  const c = candidates(v);
  let hardest = null;
  for (let guard = 0; guard < 500; guard++) {
    let step = null;
    for (const f of FINDERS) {
      step = f(v, c);
      if (step) break;
    }
    if (!step) return null;
    if (!step.elims) {
      if (hardest && TECHNIQUES[hardest] > TECHNIQUES[step.technique]) return { ...step, technique: hardest, via: step.technique };
      return step;
    }
    if (!hardest || TECHNIQUES[step.technique] > TECHNIQUES[hardest]) hardest = step.technique;
    for (const [i, m] of step.elims) c[i] &= ~m;
  }
  return null;
}

/* ---------- generator ---------- */

function randomFullGrid(rand) {
  const out = new Array(81).fill(0);
  countSolutions(out, 1, out, rand);
  return out;
}

// Makes one puzzle of the given level. Deterministic for a given seed.
// Returns { puzzle, solution, level, seed, givens, tries }.
export function generate(level, seed) {
  const { tiers: [lo, hi], minGivens } = LEVEL_RULES[level];
  const rand = rng(seed);
  let fallback = null;
  for (let tries = 1; tries <= 300; tries++) {
    const solution = randomFullGrid(rand);
    const puzzle = solution.slice();
    let givens = 81;
    // remove digits in symmetric pairs, which gives the classic tidy look
    const order = shuffle(Array.from({ length: 41 }, (_, k) => k), rand);
    for (const i of order) {
      const pair = i === 40 ? [40] : [i, 80 - i];
      if (givens - pair.length < minGivens) continue;
      for (const j of pair) puzzle[j] = 0;
      const ok = countSolutions(puzzle, 2) === 1 && grade(puzzle, hi).solved;
      if (ok) givens -= pair.length;
      else for (const j of pair) puzzle[j] = solution[j];
    }
    const { tier } = grade(puzzle);
    const result = { puzzle, solution, level, seed, givens, tier, tries };
    if (tier >= lo) return result;
    if (!fallback || tier > fallback.tier) fallback = result;
  }
  return fallback;
}

/* ---------- helpers for the game ---------- */

export const toString = (grid) => grid.map((d) => d || '.').join('');
export const fromString = (s) => [...s].map((ch) => (ch >= '1' && ch <= '9' ? +ch : 0));
export { bit, popcount, digits, ALL };
