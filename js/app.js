import * as S from './sudoku.js';
import { Sound } from './audio.js';
import { Ads } from './ads.js';

const $ = (s) => document.querySelector(s);
const board = $('#board');
const STORE = 'sudoku.v1';

const LEVEL_NAME = { easy: 'Let', medium: 'Mellem', hard: 'Svær', expert: 'Ekspert' };
const TECH_NAME = {
  lockedCandidates: 'låste kandidater',
  nakedPair: 'nøgne par',
  hiddenPair: 'skjulte par',
  nakedTriple: 'nøgne tripler',
  hiddenTriple: 'skjulte tripler',
  xWing: 'X-wing',
  xyWing: 'XY-wing',
  swordfish: 'sværdfisk',
};
const UNIT_NAME = (u) => (u < 9 ? 'rækken' : u < 18 ? 'kolonnen' : 'boksen');
const PEER_SET = S.PEERS.map((p) => new Set(p));
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const settings = { level: 'easy', sound: true, showErrors: true, highlightSame: true, autoNotes: true, theme: 'auto' };
const blankLevel = () => ({ played: 0, won: 0, bestTime: 0, totalTime: 0, perfect: 0 });
const stats = {
  levels: Object.fromEntries(S.LEVELS.map((l) => [l, blankLevel()])),
  daily: { streak: 0, best: 0, last: '', done: 0 },
};

let state = null;
let history = []; // each entry: list of [cell, previous value, previous notes]
let sel = 40;
let notesMode = false;
let busy = false;
const cells = [];

/* ---------- persistence ---------- */

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!d) return;
    Object.assign(settings, d.settings);
    for (const l of S.LEVELS) Object.assign(stats.levels[l], d.stats?.levels?.[l]);
    Object.assign(stats.daily, d.stats?.daily);
    if (d.state && !d.state.won) {
      state = d.state;
      history = d.history || [];
      sel = d.sel ?? 40;
    }
  } catch {
    /* corrupted or blocked storage: start fresh */
  }
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ settings, stats, state, history: history.slice(-200), sel }));
  } catch {
    /* private mode etc. */
  }
}

/* ---------- game state ---------- */

const given = (i) => state.puzzle[i] !== '.';
const sol = (i) => +state.solution[i];
const fmtTime = (s) => (s >= 3600 ? `${(s / 3600) | 0}:${String(((s / 60) | 0) % 60).padStart(2, '0')}` : `${(s / 60) | 0}`) + `:${String(s % 60).padStart(2, '0')}`;
const randomSeed = () => 1 + Math.floor(Math.random() * 999999);

function newState(level, seed, daily = null) {
  const p = S.generate(level, seed);
  return {
    level,
    seed,
    daily,
    puzzle: S.toString(p.puzzle),
    solution: S.toString(p.solution),
    values: p.puzzle.slice(),
    notes: new Array(81).fill(0),
    elapsed: 0,
    mistakes: 0,
    hints: 0,
    started: false,
    won: false,
  };
}

function markStarted() {
  if (state.started) return;
  state.started = true;
  stats.levels[state.level].played++;
}

const isSolved = () => state.values.every((d, i) => d === sol(i));

/* ---------- days ---------- */

const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dailySeed = (day) => +day.replaceAll('-', '');
// Weekdays are relaxed, weekends a little harder.
function dailyLevel(day) {
  const wd = new Date(day + 'T12:00').getDay();
  return wd === 0 || wd === 6 ? 'hard' : 'medium';
}
function prevDay(day) {
  const d = new Date(day + 'T12:00');
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

/* ---------- DOM ---------- */

function buildBoard() {
  board.innerHTML = '';
  for (let b = 0; b < 9; b++) {
    const boxEl = document.createElement('div');
    boxEl.className = 'box';
    for (let k = 0; k < 9; k++) {
      const i = (3 * ((b / 3) | 0) + ((k / 3) | 0)) * 9 + 3 * (b % 3) + (k % 3);
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.i = i;
      el.setAttribute('role', 'gridcell');
      cells[i] = el;
      boxEl.appendChild(el);
    }
    board.appendChild(boxEl);
  }
  $('#pad').innerHTML = Array.from({ length: 9 }, (_, k) => `<button type="button" data-d="${k + 1}">${k + 1}<small></small></button>`).join('');
}

function cellHtml(i, hiDigit) {
  const d = state.values[i];
  if (d) return `<span class="v">${d}</span>`;
  const n = state.notes[i];
  if (!n) return '';
  let html = '<div class="notes">';
  for (let k = 1; k <= 9; k++) html += n & S.bit(k) ? `<span${k === hiDigit ? ' class="hi"' : ''}>${k}</span>` : '<span></span>';
  return html + '</div>';
}

function render() {
  const v = state.values;
  const selVal = v[sel];
  const hi = settings.highlightSame ? selVal : 0;
  for (let i = 0; i < 81; i++) {
    const el = cells[i];
    const d = v[i];
    const c = el.classList;
    c.toggle('given', given(i));
    c.toggle('user', !!d && !given(i));
    c.toggle('wrong', !!d && !given(i) && settings.showErrors && d !== sol(i));
    c.toggle('sel', i === sel);
    c.toggle('same', i !== sel && !!hi && d === hi);
    c.toggle('peer', i !== sel && PEER_SET[sel].has(i));
    const key = d ? `v${d}` : `n${state.notes[i]}:${hi}`;
    if (el._k !== key) {
      el._k = key;
      el.innerHTML = cellHtml(i, hi);
    }
    el.setAttribute('aria-label', `Række ${S.row(i) + 1}, kolonne ${S.col(i) + 1}${d ? `: ${d}` : ''}`);
  }
  // how many of each digit are still missing
  const placed = new Array(10).fill(0);
  for (let i = 0; i < 81; i++) if (v[i] && (!settings.showErrors || v[i] === sol(i))) placed[v[i]]++;
  document.querySelectorAll('#pad button').forEach((b) => {
    const left = 9 - placed[+b.dataset.d];
    b.classList.toggle('done', left <= 0);
    b.querySelector('small').textContent = left > 0 ? left : '';
  });
  updateHud();
}

function updateHud() {
  $('#level').textContent = state.daily ? 'Dagens' : LEVEL_NAME[state.level];
  $('#mistakes').textContent = state.mistakes;
  $('#mistakes').classList.toggle('bad', state.mistakes > 0);
  $('#time').textContent = fmtTime(state.elapsed);
  $('#undoBtn').disabled = !history.length || state.won;
  $('#notesBtn').classList.toggle('on', notesMode);
  $('#notesBtn').setAttribute('aria-pressed', notesMode);
  $('#notesBtn .badge').textContent = notesMode ? 'TIL' : 'FRA';
  $('#play').classList.toggle('notes-on', notesMode);
}

function anim(i, cls, ms = 700) {
  const el = cells[i];
  el.classList.remove(cls);
  void el.offsetWidth; // restart the animation
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

/* ---------- moves ---------- */

function select(i) {
  sel = Math.max(0, Math.min(80, i));
  render();
}

function placeDigit(i, d) {
  const changes = [[i, state.values[i], state.notes[i]]];
  state.values[i] = d;
  state.notes[i] = 0;
  const correct = d === sol(i);
  if (correct && settings.autoNotes) {
    for (const j of S.PEERS[i]) {
      if (state.notes[j] & S.bit(d)) {
        changes.push([j, state.values[j], state.notes[j]]);
        state.notes[j] &= ~S.bit(d);
      }
    }
  }
  history.push(changes);
  markStarted();
  render();

  if (!correct && settings.showErrors) {
    state.mistakes++;
    updateHud();
    Sound.play('error');
    anim(i, 'shake', 400);
  } else {
    Sound.play('place', { digit: d });
    anim(i, 'pop', 300);
  }
  if (correct) flashUnits(i);
  if (isSolved()) win();
  else if (state.values.every((x) => x)) toast('Pladen er fuld, men der er en fejl et sted.');
  save();
}

// Lights up every row, column and box that the move just completed.
function flashUnits(i) {
  let any = false;
  for (const u of [S.row(i), 9 + S.col(i), 18 + S.box(i)]) {
    const unit = S.UNITS[u];
    if (!unit.every((j) => state.values[j] === sol(j))) continue;
    any = true;
    unit.forEach((j, k) => {
      cells[j].style.setProperty('--d', `${k * 35}ms`);
      anim(j, 'flash', 700 + k * 35);
    });
  }
  if (any && !isSolved()) Sound.play('unit', { delay: 0.1 });
}

function input(d) {
  if (busy || state.won) return;
  const i = sel;
  if (given(i)) {
    Sound.play('error', { vol: 0.4 });
    return;
  }
  if (notesMode) {
    if (state.values[i]) return;
    history.push([[i, 0, state.notes[i]]]);
    state.notes[i] ^= S.bit(d);
    markStarted();
    Sound.play('note');
    render();
    save();
    return;
  }
  if (state.values[i] === d) return;
  placeDigit(i, d);
}

function erase() {
  if (busy || state.won) return;
  const i = sel;
  if (given(i) || (!state.values[i] && !state.notes[i])) return;
  history.push([[i, state.values[i], state.notes[i]]]);
  state.values[i] = 0;
  state.notes[i] = 0;
  Sound.play('erase');
  render();
  save();
}

function undo() {
  if (busy || state.won || !history.length) return;
  const changes = history.pop();
  for (let k = changes.length - 1; k >= 0; k--) {
    const [i, v, n] = changes[k];
    state.values[i] = v;
    state.notes[i] = n;
  }
  sel = changes[0][0];
  Sound.play('erase', { vol: 0.6 });
  render();
  save();
}

function fillNotes() {
  const changes = [];
  for (let i = 0; i < 81; i++) {
    if (state.values[i]) continue;
    let m = S.ALL;
    for (const j of S.PEERS[i]) if (state.values[j]) m &= ~S.bit(state.values[j]);
    if (m !== state.notes[i]) {
      changes.push([i, 0, state.notes[i]]);
      state.notes[i] = m;
    }
  }
  if (!changes.length) return toast('Alle noter er allerede udfyldt');
  history.push(changes);
  markStarted();
  render();
  save();
  toast('Noterne viser nu alle mulige tal');
}

function hint() {
  if (busy || state.won) return;
  const v = state.values;
  const wrong = v.findIndex((d, i) => d && d !== sol(i));
  state.hints++;
  markStarted();
  if (wrong >= 0) {
    select(wrong);
    if (!settings.showErrors) cells[wrong].classList.add('wrong');
    anim(wrong, 'shake', 400);
    Sound.play('error');
    toast('Dette tal er forkert. Tryk på Slet og prøv igen.');
    save();
    return;
  }
  let step = S.nextPlacement(v);
  if (!step) {
    const i = v[sel] ? v.findIndex((x) => !x) : sel;
    step = { i, d: sol(i) };
  }
  const { i, d, technique, unit } = step;
  sel = i;
  Sound.play('hint');
  placeDigit(i, d);
  if (technique === 'nakedSingle') toast(`Kun ${d} kan stå her – de andre tal findes allerede i rækken, kolonnen eller boksen.`);
  else if (technique === 'hiddenSingle') toast(`${d} kan kun stå her i ${UNIT_NAME(unit)}.`);
  else if (technique) toast(`Her står ${d}. Det kræver teknikken „${TECH_NAME[technique]}“.`);
  else toast(`Her står ${d}.`);
  if (unit !== undefined && !state.won) {
    for (const j of S.UNITS[unit]) cells[j].classList.add('hint-unit');
    setTimeout(() => S.UNITS[unit].forEach((j) => cells[j].classList.remove('hint-unit')), 1800);
  }
}

/* ---------- winning ---------- */

function win() {
  state.won = true;
  busy = true;
  const ls = stats.levels[state.level];
  ls.won++;
  ls.totalTime += state.elapsed;
  const newBest = !ls.bestTime || state.elapsed < ls.bestTime;
  if (newBest) ls.bestTime = state.elapsed;
  const perfect = !state.mistakes && !state.hints;
  if (perfect) ls.perfect++;
  let dailyDone = false;
  if (state.daily && stats.daily.last !== state.daily) {
    const dd = stats.daily;
    dd.streak = dd.last === prevDay(state.daily) ? dd.streak + 1 : 1;
    dd.best = Math.max(dd.best, dd.streak);
    dd.last = state.daily;
    dd.done++;
    dailyDone = true;
  }
  save();
  render();

  // a golden wave rolls out from the last digit
  const r0 = S.row(sel);
  const c0 = S.col(sel);
  cells.forEach((el, i) => {
    el.style.setProperty('--d', `${(Math.abs(S.row(i) - r0) + Math.abs(S.col(i) - c0)) * 45}ms`);
    el.classList.add('wave');
  });
  Sound.play('win', { delay: 0.15 });
  setTimeout(() => {
    cells.forEach((el) => el.classList.remove('wave'));
    showWin({ newBest: newBest && ls.won > 1, perfect, dailyDone });
  }, 1500);
}

function showWin({ newBest, perfect, dailyDone }) {
  $('#wSub').textContent = state.daily ? 'Dagens sudoku er løst' : `${LEVEL_NAME[state.level]} sudoku løst`;
  $('#wTime').textContent = fmtTime(state.elapsed);
  $('#wMistakes').textContent = state.mistakes;
  $('#wHints').textContent = state.hints;
  const badges = [];
  if (newBest) badges.push('Ny rekord!');
  if (perfect) badges.push('Perfekt – ingen fejl eller tip');
  else if (!state.mistakes) badges.push('Ingen fejl');
  if (dailyDone) badges.push(stats.daily.streak > 1 ? `${stats.daily.streak} dage i træk` : 'Dagens sudoku ✓');
  $('#wBadges').innerHTML = badges.map((b) => `<span>${b}</span>`).join('');
  openModal('#winModal');
  Ads.showBanner();
  busy = false;
}

/* ---------- new games ---------- */

function startGame(level, seed = randomSeed(), daily = null) {
  Ads.hideBanner();
  closeModal('#winModal');
  state = newState(level, seed, daily);
  history = [];
  notesMode = false;
  busy = false;
  sel = 40;
  cells.forEach((el, i) => {
    el.style.setProperty('--d', `${(S.row(i) + S.col(i)) * 18}ms`);
    if (state.values[i]) anim(i, 'deal', 1100);
  });
  render();
  save();
}

function confirmThen(fn) {
  if (busy) return;
  if (state.started && !state.won) {
    pendingAction = fn;
    openModal('#confirmModal');
  } else fn();
}
let pendingAction = null;

// Moving on from one game to the next is the natural break where an ad may show.
let advancing = false;
async function nextGame(level = settings.level, seed, daily) {
  if (advancing) return;
  advancing = true;
  try {
    if (state.started) await Ads.interstitial();
    startGame(level, seed, daily);
  } finally {
    advancing = false;
  }
}

function playDaily() {
  const day = dayKey();
  if (state.daily === day && !state.won) return closeIntro();
  if (stats.daily.last === day) return toast('Du har allerede løst dagens sudoku. Kom igen i morgen!');
  closeIntro();
  setTimeout(() => startGame(dailyLevel(day), dailySeed(day), day), 250);
}

/* ---------- chrome: modals, menu, toast ---------- */

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), Math.max(2600, msg.length * 55));
}

function openModal(sel) {
  $(sel).classList.add('open');
  if (sel !== '#winModal') $('#backdrop').classList.add('open');
}
function closeModal(sel) {
  $(sel).classList.remove('open');
  if (!document.querySelector('.sheet.open, #confirmModal.open')) $('#backdrop').classList.remove('open');
}
function closeAll() {
  $('#menu').classList.remove('open');
  $('#confirmModal').classList.remove('open');
  $('#backdrop').classList.remove('open');
}

function openMenu() {
  if (busy) return;
  renderStats();
  syncSettingsUi();
  $('#menu').classList.add('open');
  $('#backdrop').classList.add('open');
}

function renderStats() {
  const rows = ['<span class="th"></span><span class="th">Løst</span><span class="th">Bedste</span><span class="th">Snit</span>'];
  for (const l of S.LEVELS) {
    const s = stats.levels[l];
    rows.push(`<span>${LEVEL_NAME[l]}</span><span>${s.won}</span><span>${s.bestTime ? fmtTime(s.bestTime) : '–'}</span><span>${s.won ? fmtTime(Math.round(s.totalTime / s.won)) : '–'}</span>`);
  }
  $('#statsTable').innerHTML = rows.join('');
  const d = stats.daily;
  const streak = d.last === dayKey() || d.last === prevDay(dayKey()) ? d.streak : 0;
  $('#dailyStats').innerHTML = [['Dage i træk', streak], ['Bedste stime', d.best], ['Dagens løst', d.done]]
    .map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`)
    .join('');
}

const levelSegHtml = () => S.LEVELS.map((l) => `<button type="button" data-level="${l}">${LEVEL_NAME[l]}</button>`).join('');

function syncSettingsUi() {
  document.querySelectorAll('#levelSeg button').forEach((b) => b.classList.toggle('on', b.dataset.level === settings.level));
  $('#optSound').checked = settings.sound;
  $('#optErrors').checked = settings.showErrors;
  $('#optSame').checked = settings.highlightSame;
  $('#optAutoNotes').checked = settings.autoNotes;
  document.querySelectorAll('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.theme));
  $('#seedNo').textContent = state.daily ? `${state.seed} (dagens)` : state.seed;
}

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]').content = dark ? '#15181d' : '#f4efe6';
  Sound.enabled = settings.sound;
}

function buildMenu() {
  $('#levelSeg').innerHTML = levelSegHtml();
  $('#levelSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.level = b.dataset.level;
    syncSettingsUi();
    save();
  });
  const toggles = { optSound: 'sound', optErrors: 'showErrors', optSame: 'highlightSame', optAutoNotes: 'autoNotes' };
  for (const [id, key] of Object.entries(toggles)) {
    $('#' + id).addEventListener('change', (e) => {
      settings[key] = e.target.checked;
      applyTheme();
      render();
      save();
    });
  }
  $('#themeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.theme = b.dataset.v;
    applyTheme();
    syncSettingsUi();
    save();
  });
  $('#mNew').addEventListener('click', () => {
    closeAll();
    confirmThen(() => nextGame(settings.level));
  });
  $('#mRestart').addEventListener('click', () => {
    closeAll();
    state.values = S.fromString(state.puzzle);
    state.notes.fill(0);
    history = [];
    render();
    save();
    toast('Opgaven er startet forfra');
  });
  $('#mFillNotes').addEventListener('click', () => {
    closeAll();
    fillNotes();
  });
  $('#mReset').addEventListener('click', () => {
    for (const l of S.LEVELS) stats.levels[l] = blankLevel();
    Object.assign(stats.daily, { streak: 0, best: 0, last: '', done: 0 });
    save();
    renderStats();
    toast('Statistikken er nulstillet');
  });
}

/* ---------- intro screen ---------- */

const introOpen = () => $('#intro').classList.contains('open');

function buildIntro() {
  const tiles = [5, 3, 7, 6, 1, 9, 2, 8, 4];
  $('#introGrid').innerHTML = tiles
    .map((d, i) => `<span class="${i === 4 ? 'gold' : i === 2 || i === 6 ? 'blue' : ''}" style="--i:${i}">${d}</span>`)
    .join('');
  $('#iLevelSeg').innerHTML = levelSegHtml();
  $('#iLevelSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings.level = b.dataset.level;
    syncIntro();
    save();
  });
  $('#iContinue').addEventListener('click', () => closeIntro());
  $('#iNew').addEventListener('click', () => {
    closeIntro();
    // The intro covers the launch, so no ad here.
    setTimeout(() => startGame(settings.level), 250);
  });
  $('#iDaily').addEventListener('click', playDaily);
  $('#iRules').addEventListener('click', () => {
    const open = $('#introRules').hidden;
    $('#introRules').hidden = !open;
    $('#iRules').textContent = open ? 'Skjul reglerne' : 'Sådan spiller du';
  });
}

function syncIntro() {
  const resumable = state.started && !state.won;
  $('#iContinue').hidden = !resumable;
  $('#iContinue').textContent = `Fortsæt · ${state.daily ? 'Dagens' : LEVEL_NAME[state.level]} · ${fmtTime(state.elapsed)}`;
  $('#iNew').className = resumable ? 'secondary wide' : 'primary wide';
  document.querySelectorAll('#iLevelSeg button').forEach((b) => b.classList.toggle('on', b.dataset.level === settings.level));
  const now = new Date();
  const day = dayKey(now);
  $('#iDay').textContent = now.getDate();
  $('#iMonth').textContent = MONTHS[now.getMonth()];
  const done = stats.daily.last === day;
  $('#iDaily').classList.toggle('done', done);
  const streak = stats.daily.last === day || stats.daily.last === prevDay(day) ? stats.daily.streak : 0;
  $('#iDailyInfo').textContent = done
    ? `Løst · ${streak} ${streak === 1 ? 'dag' : 'dage'} i træk`
    : `${LEVEL_NAME[dailyLevel(day)]}${streak ? ` · ${streak} ${streak === 1 ? 'dag' : 'dage'} i træk` : ''}`;
  const won = S.LEVELS.reduce((n, l) => n + stats.levels[l].won, 0);
  $('#introStats').textContent = won ? `Du har løst ${won} ${won === 1 ? 'sudoku' : 'sudokuer'}` : '';
}

function openIntro() {
  closeModal('#winModal');
  Ads.hideBanner();
  syncIntro();
  $('#intro').classList.add('open');
}

function closeIntro() {
  $('#intro').classList.remove('open');
  setTimeout(installHint, 900);
}

function installHint() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  let seen = false;
  try {
    seen = !!localStorage.getItem('sudoku.installHint');
  } catch {}
  if (!ios || standalone || seen) return;
  const el = $('#install');
  el.classList.add('show');
  el.querySelector('button').addEventListener('click', () => {
    el.classList.remove('show');
    try {
      localStorage.setItem('sudoku.installHint', '1');
    } catch {}
  });
}

/* ---------- layout ---------- */

// Sizes the board to the largest square that leaves room for the controls.
function layout() {
  const play = $('#play');
  play.classList.remove('wide');
  const r = play.getBoundingClientRect();
  const wide = r.width > r.height * 1.2;
  play.classList.toggle('wide', wide);
  let size;
  if (wide) size = Math.min(r.height - 24, r.width * 0.55);
  else size = Math.min(r.width - 16, r.height - $('#controls').offsetHeight - 30, 620);
  play.style.setProperty('--size', `${Math.max(200, Math.floor(size))}px`);
  board.style.setProperty('--size', `${Math.max(200, Math.floor(size))}px`);
}

/* ---------- boot ---------- */

function init() {
  load();
  applyTheme();
  buildBoard();
  buildMenu();

  board.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.cell');
    if (!el || busy) return;
    Sound.play('tap');
    select(+el.dataset.i);
  });
  $('#pad').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) input(+b.dataset.d);
  });
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) document.addEventListener(ev, () => Sound.unlock(), { capture: true });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  darkQuery.addEventListener?.('change', applyTheme);

  $('#undoBtn').addEventListener('click', undo);
  $('#eraseBtn').addEventListener('click', erase);
  $('#notesBtn').addEventListener('click', () => {
    notesMode = !notesMode;
    updateHud();
  });
  $('#hintBtn').addEventListener('click', hint);
  $('#menuBtn').addEventListener('click', openMenu);
  $('#backdrop').addEventListener('click', closeAll);
  $('#menuClose').addEventListener('click', closeAll);
  $('#wNew').addEventListener('click', () => nextGame(settings.level));
  $('#wHome').addEventListener('click', openIntro);
  $('#confirmModal').addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    closeAll();
    if (act === 'ok' && pendingAction) pendingAction();
    pendingAction = null;
  });

  window.addEventListener('keydown', (e) => {
    if (document.querySelector('.sheet.open, .modal.open, .intro.open, .ad-layer.open')) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') return undo();
    if (e.key >= '1' && e.key <= '9') return input(+e.key);
    const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
    if (moves[e.key]) {
      e.preventDefault();
      const c = S.col(sel);
      if ((e.key === 'ArrowLeft' && c === 0) || (e.key === 'ArrowRight' && c === 8)) return;
      return select(sel + moves[e.key]);
    }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') erase();
    else if (e.key === 'n') $('#notesBtn').click();
    else if (e.key === 'h') hint();
  });

  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(layout, 60);
  });

  setInterval(() => {
    const paused = document.hidden || introOpen() || Ads.showing || document.querySelector('.sheet.open');
    if (state && state.started && !state.won && !paused) {
      state.elapsed++;
      $('#time').textContent = fmtTime(state.elapsed);
    }
  }, 1000);
  document.addEventListener('visibilitychange', () => document.hidden && save());
  window.addEventListener('pagehide', save);

  // Show the saved game (or a fresh, untouched one) behind the intro screen.
  if (!state) state = newState(settings.level, randomSeed());
  layout();
  render();
  buildIntro();
  openIntro();

  if ('serviceWorker' in navigator && !/^(localhost|127\.|\[::1\])/.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Debugging hook for the browser console (also used by tools/store-shots.mjs).
  window.__sudoku = {
    get state() { return state; },
    set state(s) { state = s; history = []; render(); },
    S,
    render,
  };
}

init();
