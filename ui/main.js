/* GENERATED from wisdom/chess-coach/src/main.js — edit there and run scripts/chess/sync_coach_ui.mjs */
import { EPISODE_REPORT as REPORT } from '../data/episodes.js';
import { HIGHLIGHT_REPORT as HIGHLIGHTS } from '../data/highlights.js';
import { PUZZLE_SET } from '../data/puzzles.js';
import { FRESH_SET } from '../data/fresh.js';
import { LEARNABILITY } from '../data/learnability.js';
import { PRACTICAL_READ } from '../data/read.js';
import { GAME_REVIEW } from '../data/reviews.js';
import { PROFILE } from './profile.js';
import * as BoardCore from './board.js';
import {
  SCALE_ORDER, CLASS_INFO, classifyCandidate, classifyMistake, downgradeReason
} from './classify.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const episodeById = new Map(REPORT.episodes.map((episode) => [episode.id, episode]));
const patternById = new Map(REPORT.patterns.map((pattern) => [pattern.id, pattern]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Three public tabs. The coach engine below keeps its internal modes
// ('moves' for graded review, 'patterns' for worked examples); every legacy
// hash still resolves so old shared links keep working.
const TABS = ['summary', 'drill', 'review'];
const TAB_ALIASES = {
  progress: 'summary',
  learn: 'drill',
  patterns: 'drill',
  counts: 'review',
  moves: 'review',
  brilliant: 'review',
  blunders: 'review'
};
const resolveTab = (raw) => TAB_ALIASES[raw] || raw;
const initialHash = location.hash.slice(1);

let tab = TABS.includes(resolveTab(initialHash)) ? resolveTab(initialHash) : 'summary';
// Which face each tab shows; legacy hashes pick the right face.
let drillFace = initialHash === 'patterns' ? 'examples' : 'puzzles';
let reviewFace = initialHash === 'counts' ? 'games' : 'best';
let view = 'moves'; // coach engine mode: 'moves' (review) or 'patterns' (examples)
let activeItem = null;
let activePatternId = REPORT.patterns[0]?.id;
let activeIndex = 0;   // index into the current view's flat corpus
let frames = [];       // ordered board positions for the active item
let stepIndex = 0;     // index into frames[]

// --- Sound: chess.com-style feedback, synthesized (no audio assets) ----------
let audioCtx = null;
function tone(freq, at, dur, type, gain) {
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, audioCtx.currentTime + at);
  amp.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + at + dur);
  osc.connect(amp).connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + at);
  osc.stop(audioCtx.currentTime + at + dur + 0.02);
}
function sfx(kind) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (kind === 'move') tone(190, 0, 0.055, 'sine', 0.14);
    else if (kind === 'capture') { tone(150, 0, 0.06, 'sine', 0.18); tone(310, 0, 0.03, 'triangle', 0.1); }
    else if (kind === 'wrong') { tone(120, 0, 0.1, 'triangle', 0.13); tone(96, 0.11, 0.14, 'triangle', 0.13); }
    else if (kind === 'solve') { tone(520, 0, 0.07, 'sine', 0.12); tone(784, 0.08, 0.1, 'sine', 0.12); }
  } catch { /* audio blocked: stay silent */ }
}
function moveSfx(san) {
  sfx(san && san.includes('x') ? 'capture' : 'move');
}

const board = BoardCore.makeBoard($('board'), { viewOnly: true });
$('board').dataset.fen = 'start';

function examplesFor(patternId) {
  return (patternById.get(patternId)?.exampleIds || [])
    .map((id) => episodeById.get(id))
    .filter(Boolean);
}

// The Moves corpus: sacrifice candidates + turning-point mistakes, each graded
// honestly across chess.com's real scale and ordered best-first, so Brilliant is
// shown as one rung among many rather than the goal.
const MOVES_CORPUS = [
  ...HIGHLIGHTS.brilliantCandidates.map((item) => ({ ...item, group: 'sac', klass: classifyCandidate(item) })),
  ...HIGHLIGHTS.turningPointBlunders.map((item) => ({ ...item, group: 'miss', klass: classifyMistake(item) })),
].sort((a, b) => SCALE_ORDER.indexOf(a.klass) - SCALE_ORDER.indexOf(b.klass));

let movesFilter = 'all';

// The corpus is sorted by GRADE, so opening Review shows thirteen of your best
// moves before the first one that lost a game. For a coach whose whole thesis
// is "train what loses games" that order is backwards, and it is also the
// version you cannot use in five minutes. This scope answers the one question
// worth asking on a weeknight: of the games I actually just played, which
// decisions cost the most? Recent games only, mistakes only, dearest first.
function costliestRecent() {
  const window_ = recentWindow();
  if (!window_) return [];
  return MOVES_CORPUS
    .filter((item) => item.group === 'miss' && window_.ids.has(item.gameId))
    .sort((a, b) => (b.lossCp || 0) - (a.lossCp || 0));
}

function itemsForView() {
  if (view === 'moves') {
    if (movesFilter === 'costly') return costliestRecent();
    return movesFilter === 'all'
      ? MOVES_CORPUS
      : MOVES_CORPUS.filter((item) => item.klass === movesFilter);
  }
  return examplesFor(activePatternId);
}

function currentLesson() {
  if (view !== 'patterns') return null;
  return activeItem.lessons?.[activePatternId] || {
    question: activeItem.question,
    setup: activeItem.setup,
    explanation: activeItem.explanation
  };
}

function uciSquares(uci) {
  return uci ? [uci.slice(0, 2), uci.slice(2, 4)] : undefined;
}

// Orientation flips make chessground rebuild its wrap: fresh svg layers with
// EMPTY bounds. Painting shapes in the same tick renders NaN lines, so after
// a flip the paint waits one frame behind a bounds refresh (guarded).
let coachPaintToken = 0;

function setBoard(fen, uci = null, brush = null, extraShapes = []) {
  if (!fen) return;
  const nextOrientation = activeItem?.side || 'white';
  const flipped = board.state.orientation !== nextOrientation;
  board.set({
    fen,
    orientation: nextOrientation,
    lastMove: uciSquares(uci)
  });
  BoardCore.setCoordsOrientation(board.coordsEl, nextOrientation);
  const shapes = [];
  if (uci && brush) shapes.push({ orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush });
  shapes.push(...extraShapes);
  // Data-driven shapes must never crash the render: drop any without squares.
  const paintable = shapes.filter((shape) => shape.orig && shape.dest);
  $('board').dataset.fen = fen;
  const token = ++coachPaintToken;
  const paint = () => {
    if (token === coachPaintToken && !$('coach').hidden) board.setShapes(paintable);
  };
  // ALWAYS defer one frame: a board that was hidden (or whose wrap was just
  // rebuilt by a flip) applies fresh bounds asynchronously, and a same-tick
  // paint renders NaN lines. One frame is imperceptible.
  if (flipped) remeasureBoards();
  requestAnimationFrame(paint);
  setTimeout(paint, 260);
}

function patternShapes(step, currentBranch) {
  if (view !== 'patterns') return [];
  const shapes = [];
  const details = activeItem.details || {};
  const fork = details.fork;
  if (currentBranch === 'actual' && fork?.actual && fork.replyUci === step?.uci) {
    for (const square of fork.targetSquares || []) {
      shapes.push({ orig: fork.attackerSquare, dest: square, brush: 'blue' });
    }
  }
  if (currentBranch === 'actual' && details.pinActual && details.pinReplyUci === step?.uci) {
    for (const pin of details.pins || []) {
      shapes.push({ orig: pin.pinnerSquare, dest: pin.kingSquare, brush: 'blue' });
    }
  }
  if (currentBranch === 'better' && stepIndex === 0 && details.missedPinExploit) {
    for (const pin of details.missedPinExploit) {
      shapes.push({ orig: pin.afterBestPinnerSquare || pin.pinnerSquare, dest: pin.kingSquare, brush: 'blue' });
    }
  }
  return shapes;
}

function fenLink(fen) {
  return `https://lichess.org/analysis/standard/${fen.split(' ').slice(0, 4).join('_')}`;
}

function sideLabel(side) {
  return `${side.slice(0, 1).toUpperCase()}${side.slice(1)}`;
}

function capitalized(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function dateLabel(value) {
  const [year, month, day] = String(value).split('.').map(Number);
  if (!year || !month || !day || !MONTHS[month - 1]) return String(value);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function dateRangeLabel(first, last) {
  const [firstYear, firstMonth, firstDay] = String(first).split('.').map(Number);
  const [lastYear, lastMonth, lastDay] = String(last).split('.').map(Number);
  if (firstYear === lastYear && firstMonth === lastMonth && MONTHS[firstMonth - 1]) {
    return `${MONTHS[firstMonth - 1]} ${firstDay}–${lastDay}, ${firstYear}`;
  }
  if (firstYear === lastYear && MONTHS[firstMonth - 1] && MONTHS[lastMonth - 1]) {
    return `${MONTHS[firstMonth - 1]} ${firstDay}–${MONTHS[lastMonth - 1]} ${lastDay}, ${firstYear}`;
  }
  return `${dateLabel(first)}–${dateLabel(last)}`;
}

function resultLabel(item) {
  if (item.result === 'win') return `won as ${sideLabel(item.side)}`;
  if (item.result === 'loss') return `lost as ${sideLabel(item.side)}`;
  return `drew as ${sideLabel(item.side)}`;
}

function proofBranchOf(item) {
  return item.line || item.better || item.actual;
}

function conciseCaption(step) {
  return step.caption.replace(`: ${step.san}`, '');
}

// Plain-language read of a centipawn eval (from the moving player's side).
function evalPhrase(cp) {
  const p = cp / 100;
  const n = (p >= 0 ? '+' : '') + p.toFixed(1);
  if (p >= 3) return `winning (${n})`;
  if (p >= 1) return `clearly better (${n})`;
  if (p >= 0.4) return `a little better (${n})`;
  if (p > -0.4) return `about level (${n})`;
  if (p > -1) return `slightly worse (${n})`;
  return `worse (${n})`;
}

function headingQuestion(item) {
  if (view === 'patterns') return currentLesson().question;
  return item.group === 'miss'
    ? 'What did this move allow — and what held instead?'
    : item.question;
}

function headingCopy(item) {
  if (view === 'moves') {
    const info = CLASS_INFO[item.klass];
    const badge = info.symbol ? `${info.label} ${info.symbol}` : info.label;
    const result = item.result === 'win' ? 'won' : (item.result === 'loss' ? 'lost' : 'drew');
    return {
      meta: `${activeIndex + 1}/${itemsForView().length} · ${badge} · ${result} vs ${item.opponent} · ${shortDateLabel(item.date)}`,
      title: `${item.moveNo} ${item.played}`,
      question: headingQuestion(item),
    };
  }
  const pattern = patternById.get(activePatternId);
  return {
    meta: `#${pattern.rank} · ${activeIndex + 1}/${examplesFor(activePatternId).length} · ${sideLabel(item.side)} vs ${item.opponent} · ${shortDateLabel(item.date)}`,
    title: pattern.name,
    question: headingQuestion(item),
  };
}

// --- board frames (linear, steppable back and forward) --------------------
function frameBrush(item, index) {
  const anchor = item.actual.anchorStep;
  if (index === anchor) return item.group === 'miss' || view === 'patterns' ? 'red' : 'green';
  if (index === anchor + 1) return 'blue';
  return 'yellow';
}

function frameStage(item, index) {
  const anchor = item.actual.anchorStep;
  if (index < anchor) return `Leading up to it · ${index + 1}/${anchor}`;
  if (index === anchor) return item.group === 'miss' ? 'The mistake' : (view === 'patterns' ? 'Your move' : 'The move');
  if (index === anchor + 1) return item.group === 'miss' ? 'How it was punished' : 'Their reply';
  return 'What it led to';
}

function buildFrames(item) {
  const out = [{ fen: item.actual.initialFen, stage: 'Start', move: '', caption: '', insight: false }];
  item.actual.steps.forEach((step, index) => {
    out.push({
      fen: step.fenAfter,
      uci: step.uci,
      brush: frameBrush(item, index),
      stage: frameStage(item, index),
      move: step.san,
      caption: conciseCaption(step),
      insight: index >= item.actual.anchorStep,
      shapes: patternShapes(step, 'actual'),
    });
  });
  const proof = item.line || item.better;
  if (proof && proof.steps?.length) {
    const keyMove = item.group === 'miss' ? item.best : item.played;
    out.push({
      fen: proof.initialFen,
      stage: item.group === 'miss' ? 'The better way' : 'Why it works',
      move: keyMove,
      caption: item.group === 'miss' ? `Back to the same position — this time play ${item.best}.` : 'Back to the same position — watch the idea pay off move by move.',
      insight: true,
    });
    proof.steps.forEach((step, index) => {
      out.push({
        fen: step.fenAfter,
        uci: step.uci,
        brush: 'green',
        stage: `${item.group === 'miss' ? 'The better way' : 'Why it works'} · ${index + 1}/${proof.steps.length}`,
        move: step.san,
        caption: conciseCaption(step),
        insight: true,
      });
    });
  }
  return out;
}

function loadItem(target) {
  const items = itemsForView();
  if (!items.length) { renderEmptyState(); return; }
  if (typeof target === 'number') {
    activeIndex = ((target % items.length) + items.length) % items.length;
  } else {
    const found = items.findIndex((item) => item.id === target);
    if (found >= 0) activeIndex = found;
  }
  activeItem = items[activeIndex];
  frames = buildFrames(activeItem);
  // Land on the key move so its classification + insight show immediately;
  // the user steps back for setup, forward for the aftermath and proof line.
  stepIndex = Math.min(frames.length - 1, 1 + activeItem.actual.anchorStep);
  renderFrame();
}

function renderEmptyState() {
  activeItem = null;
  frames = [];
  $('position-meta').textContent = '';
  $('position-title').textContent = 'Nothing to show here';
  $('position-question').textContent = '';
  $('stage-label').textContent = '';
  $('move-note').hidden = true;
  $('step-prev').disabled = true;
  $('step-next').disabled = true;
  setBoard('start');
}

function renderFrame() {
  if (!activeItem) return;
  const item = activeItem;
  const frame = frames[stepIndex];
  const heading = headingCopy(item);
  $('position-meta').textContent = heading.meta;
  $('position-title').textContent = heading.title;
  $('position-question').textContent = heading.question;
  setBoard(frame.fen, frame.uci || null, frame.brush || null, frame.shapes || []);
  $('stage-label').textContent = `${frame.stage} · ${stepIndex + 1}/${frames.length}`;
  // The lesson is ONE human line — everything else (labels table, links,
  // per-move narration) was clutter Jerry cut. Shown from the key move on.
  const note = $('move-note');
  const explanation = view === 'patterns'
    ? (currentLesson()?.explanation || item.takeaway || '')
    : (item.reason || '');
  if (frame.insight && explanation) {
    note.hidden = false;
    const first = explanation.split(/(?<=\.)\s+/u)[0];
    note.textContent = first.length > 170 ? `${first.slice(0, 167)}…` : first;
  } else {
    note.hidden = true;
    note.textContent = '';
  }
  const items = itemsForView();
  $('step-prev').disabled = stepIndex <= 0 && activeIndex <= 0;
  $('step-next').disabled = stepIndex >= frames.length - 1 && activeIndex >= items.length - 1;
  const badge = frame.insight && view === 'moves' ? ` ${CLASS_INFO[item.klass].label}.` : '';
  $('board').setAttribute('aria-label', `${frame.stage}.${frame.move ? ' ' + frame.move + '.' : ''} ${frame.caption || ''}${badge}`.trim());
}

function recordLabel(row) {
  return `${row.wins}W\u2013${row.losses}L${row.draws ? `\u2013${row.draws}D` : ''}`;
}

function renderOpenings() {
  const openings = REPORT.openings;
  $('openings-title').textContent = `What ${PROFILE.playerName} plays`;
  $('openings-scope').textContent = `${REPORT.gamesReviewed} rated ${PROFILE.timeControlLabel} games \u00b7 ${dateRangeLabel(REPORT.games[0].date, REPORT.games.at(-1).date)}`;
  // The answer first: the opening costing the most GAMES, judged across every
  // family in the whole corpus (builder-computed) — with its basis, so the
  // claim is checkable at a glance.
  const worstWhite = openings.white.mostLosses && { ...openings.white.mostLosses, colorName: 'White' };
  const worstBlack = openings.black.mostLosses && { ...openings.black.mostLosses, colorName: 'Black' };
  const worst = [worstWhite, worstBlack].filter(Boolean).sort((a, b) => b.losses - a.losses)[0];
  if (worst) {
    $('openings-answer').innerHTML = `The <strong>${escapeHtml(worst.name)}</strong> costs the most games as ${worst.colorName} — ${worst.losses} losses in ${worst.games} games with it (all ${REPORT.gamesReviewed} games analyzed).`;
  } else {
    $('openings-answer').innerHTML = `No single opening is costing games yet — losses are spread across families (all ${REPORT.gamesReviewed} games analyzed).`;
  }
  for (const color of ['white', 'black']) {
    const side = openings[color];
    $(`openings-${color}-n`).textContent = `\u00b7 ${side.totalGames} games`;
    const listed = side.top.reduce((sum, row) => sum + row.games, 0);
    const rest = side.totalGames - listed;
    const restFamilies = side.families - side.top.length;
    $(`openings-${color}`).innerHTML = side.top.map((row, index) => {
      const gloss = row.gloss ? `<span class="opening-gloss">${escapeHtml(row.gloss)}</span>` : '';
      const small = row.small ? ' \u00b7 small sample' : '';
      // "when i press fix it, it's just one game, and i'm not given the context
      // of, like, i do this wrong move how many times" — so each family says how
      // many costly positions it holds and which mistake repeats inside it, and
      // that repeat is itself a one-tap drill.
      const inFamily = drillPool({ opening: row.name }, PUZZLE_SET.puzzles);
      const subCounts = new Map();
      for (const puzzle of inFamily) {
        const sub = puzzleSub(puzzle);
        if (sub) subCounts.set(sub, (subCounts.get(sub) || 0) + 1);
      }
      const topSub = [...subCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const note = inFamily.length
        ? `<span class="opening-note">${inFamily.length} costly position${inFamily.length === 1 ? '' : 's'}</span>`
        : '';
      const repeat = topSub
        ? `<button type="button" class="sub-chip opening-sub" data-open-opening="${escapeHtml(row.name)}" data-open-sub="${escapeHtml(topSub[0])}" aria-label="Drill ${escapeHtml(topSub[0])} in the ${escapeHtml(row.name)}, ${topSub[1]} positions">${escapeHtml(topSub[0])} <b>\u00d7${topSub[1]}</b></button>`
        : '';
      return `<div class="opening-row-group">
        <button type="button" class="opening-row" data-open-opening="${escapeHtml(row.name)}">
          <span class="opening-rank">${index + 1}</span>
          <span class="opening-copy"><strong>${escapeHtml(row.name)}</strong>${gloss}<em>${row.games} games \u00b7 ${recordLabel(row)}${small}</em>${note}</span>
          <span class="opening-go" aria-hidden="true">Drill it \u2192</span>
        </button>
        ${repeat ? `<div class="sub-chip-row">${repeat}</div>` : ''}
      </div>`;
    }).join('')
      + (rest > 0 ? `<p class="opening-rest">+ ${rest} more across ${restFamilies} openings</p>` : '');
  }
}

function renderMistakes() {
  const most = Math.max(...REPORT.patterns.map((pattern) => pattern.episodes));
  // The answer first: what to train, before any chart.
  const top = REPORT.patterns[0];
  $('mistakes-answer').innerHTML = `Train <strong>${escapeHtml(top.name)}</strong> first — ${top.episodes} costly moments in ${top.games} of ${REPORT.gamesReviewed} games.`;
  // Jerry: "all of these subcategories should be extremely easy to query too …
  // there right now is not a way i can skip to like missed mate 29 and just
  // grind all of those out". So the row drills the pattern and EVERY breakdown
  // label below it is its own one-tap query. Chip counts come from the drill
  // pool itself, so the number on the chip is exactly what the tap queues.
  $('summary-mistakes').innerHTML = REPORT.patterns.map((pattern) => {
    const width = Math.max(6, Math.round((pattern.episodes / most) * 100));
    const chips = (pattern.breakdown || []).map((row) => {
      const count = drillPool({ filter: pattern.id, sub: row.label }, PUZZLE_SET.puzzles).length;
      if (!count) return '';
      return `<button type="button" class="sub-chip" data-drill-pattern="${escapeHtml(pattern.id)}" data-drill-sub="${escapeHtml(row.label)}"`
        + ` aria-label="Drill ${escapeHtml(row.label)} inside ${escapeHtml(pattern.name)} — ${count} positions">`
        + `${escapeHtml(row.label)} <b>×${count}</b></button>`;
    }).join('');
    return `<div class="priority-row">
      <button type="button" class="priority-main" data-drill-pattern="${escapeHtml(pattern.id)}" aria-label="Drill every ${escapeHtml(pattern.name)} position">
        <span class="priority-rank">${pattern.rank}</span>
        <span class="priority-copy">
          <strong>${escapeHtml(pattern.name)}</strong>
          <span class="priority-bar" aria-hidden="true"><i style="width:${width}%"></i></span>
          <em>${pattern.episodes} costly moments · ${pattern.games} of ${REPORT.gamesReviewed} games</em>
        </span>
        <span class="priority-go" aria-hidden="true">Drill all →</span>
      </button>
      ${chips ? `<div class="sub-chip-row">${chips}</div>` : ''}
    </div>`;
  }).join('');
  const phaseData = REPORT.phaseMistakes || [];
  const total = phaseData.reduce((sum, entry) => sum + entry.episodes, 0) || 1;
  const pct = (n) => Math.round((n / total) * 100);
  const byPhase = Object.fromEntries(phaseData.map((entry) => [entry.phase, entry]));
  const topPhase = phaseData.slice().sort((a, b) => b.episodes - a.episodes)[0];
  // Same rule for the phase strip: "aimless move", "missed the capture" are
  // rows Jerry wants to grind, so each one is a query scoped to that phase.
  const phaseRow = (phase) => {
    const entry = byPhase[phase] || { episodes: 0, rows: [] };
    const chips = (entry.rows || []).map((row) => {
      const count = drillPool({ sub: row.label, phaseOf: phase }, PUZZLE_SET.puzzles).length;
      if (!count) return '';
      return `<button type="button" class="sub-chip" data-drill-sub="${escapeHtml(row.label)}" data-drill-phase="${escapeHtml(phase)}"`
        + ` aria-label="Drill ${escapeHtml(row.label)} in the ${phase} — ${count} positions">`
        + `${escapeHtml(row.label)} <b>×${count}</b></button>`;
    }).join('');
    const all = drillPool({ phaseOf: phase }, PUZZLE_SET.puzzles).length;
    return `<div class="phase-row">
      <button type="button" class="phase-main" data-drill-phase="${escapeHtml(phase)}" aria-label="Drill every ${phase} position">
        <strong>${capitalized(phase)}</strong> <em>${pct(entry.episodes)}% · ${all}</em>
      </button>
      ${chips ? `<div class="sub-chip-row">${chips}</div>` : ''}
    </div>`;
  };
  $('phase-strip').innerHTML = `
    <span class="phase-answer">Mostly the <strong>${topPhase ? topPhase.phase : 'middlegame'}</strong>:</span>
    <span class="phase-bar" aria-hidden="true">
      <i class="phase-open" style="width:${pct((byPhase.opening || {}).episodes || 0)}%"></i><i class="phase-mid" style="width:${pct((byPhase.middlegame || {}).episodes || 0)}%"></i><i class="phase-end" style="width:${pct((byPhase.endgame || {}).episodes || 0)}%"></i>
    </span>
    ${phaseRow('opening')}${phaseRow('middlegame')}${phaseRow('endgame')}`;
  // The two prose "reads" that used to close this card are gone: the rows and
  // chips above already name the habit, the count, and the way to drill it
  // (Jerry: "cut the bad ui and subtext that is not useful").
}

function shortDateLabel(value) {
  const [year, month, day] = String(value).split('.').map(Number);
  if (!year || !month || !day || !MONTHS[month - 1]) return String(value);
  return `${MONTHS[month - 1]} ${day}`;
}

function sittingRows() {
  return REPORT.sittings.positions.map((row) => ({
    ...row,
    pct: Math.round((row.wins / row.games) * 100)
  }));
}

function sittingReadLine(rows) {
  // The stopping point is computed by the builder from the real per-position
  // record, never a static chart tail (Jerry: "make sure 7 game isnt just
  // static though").
  const dropoff = REPORT.sittings.dropoff;
  if (dropoff) {
    return `The data picks its own stopping point: through game ${dropoff.after} you win ${dropoff.rateBefore}%, `
      + `after that it falls to ${dropoff.rateAfter}% (${dropoff.tailGames} late games measured) — stop after game ${dropoff.after}.`;
  }
  const named = rows.slice(0, -1);
  const tail = rows.at(-1);
  const tailPhrase = tail.wins === 0 ? 'almost nothing' : `about 1 in ${Math.round(tail.games / tail.wins)}`;
  return `Not enough late-sitting games yet to compute a cliff — from game ${named.length + 1} the win rate is ${tailPhrase} so far.`;
}

function renderSessionCard() {
  $('session-title').textContent = `When in a sitting ${PROFILE.playerName} wins`;
  const sittings = REPORT.sittings;
  const rows = sittingRows();
  $('session-scope').textContent = `${sittings.count} sittings since ${shortDateLabel(sittings.since)} · a sitting = games with under an hour between them`;
  $('session-rows').innerHTML = rows.map((row, index) => {
    const low = index === rows.length - 1 && row.pct < 40;
    const tone = low ? ' low' : (row.pct >= 60 ? ' high' : '');
    return `<div class="session-row${tone}">
      <span class="session-label">${escapeHtml(row.label)}</span>
      <span class="session-bar" aria-hidden="true"><i style="width:${Math.max(3, row.pct)}%"></i></span>
      <span class="session-value">${row.pct}% <em>of ${row.games}</em></span>
    </div>`;
  }).join('');
  $('session-read').textContent = sittingReadLine(rows);
}

function renderChange() {
  // One changed signal plus the core habit that did or did not move. A refresh
  // compares new games with an equal-sized immediately prior window.
  const week = REPORT.week || {};
  const strengths = (week.historicallyGood || []).map((entry) => entry.name);
  const rows = [];
  const refresh = REPORT.refreshDelta;
  const verdict = $('change-verdict');
  verdict.hidden = true;
  verdict.textContent = '';
  if (refresh?.newGames && refresh?.comparisonGames) {
    $('change-title').textContent = `${refresh.newGames}-game update`;
    verdict.hidden = false;
    verdict.textContent = REPORT.progressVerdict?.headline || '';
    const priorRecord = refresh.previous.record;
    const newRecord = refresh.new.record;
    const record = (entry) => `${entry.win || 0}W–${entry.loss || 0}L${entry.draw ? `–${entry.draw}D` : ''}`;
    $('change-scope').textContent = `${shortDateLabel(refresh.newFrom)}–${shortDateLabel(refresh.newThrough)} · ${record(newRecord)} vs the prior ${refresh.comparisonGames}: ${record(priorRecord)} · same engine`;
    $('change-before-label').textContent = `Prior ${refresh.comparisonGames}`;
    $('change-now-label').textContent = `New ${refresh.newGames}`;
    const rank = (trend) => Math.abs(trend.delta || 0) / Math.max(Math.abs(trend.previous || 0), 1);
    const changed = (refresh.trends || [])
      .filter((trend) => trend.direction === 'improving' || trend.direction === 'worsening')
      .sort((a, b) => rank(b) - rank(a))[0];
    const core = (refresh.trends || []).find((trend) => trend.id === 'counter');
    const trendRow = (trend) => ({
      label: trend.label,
      before: trend.unit === '%' ? `${trend.previous}%` : String(trend.previous),
      now: trend.unit === '%' ? `${trend.recent}%` : String(trend.recent),
      delta: trend.direction === 'flat'
        ? 'not meaningfully changed'
        : `${Math.abs(trend.delta)} ${trend.unit}`,
      basis: trend.unit,
      state: trend.direction === 'improving' ? 'Better' : (trend.direction === 'worsening' ? 'Watch' : 'Still'),
      tone: trend.direction === 'improving' ? 'better' : (trend.direction === 'worsening' ? 'worse' : 'flat'),
    });
    if (changed) rows.push(trendRow(changed));
    if (core && core !== changed) rows.push(trendRow(core));
  } else if (week.weekGood || week.weekBad) {
    $('change-title').textContent = 'This week check';
    $('change-scope').textContent = 'Costly moments per game · lower is better';
    $('change-before-label').textContent = 'Before';
    $('change-now-label').textContent = 'This week';
    if (week.weekGood) {
      const delta = Math.abs(week.weekGood.baseRate - week.weekGood.weekRate);
      rows.push({
        label: week.weekGood.name,
        before: Number(week.weekGood.baseRate).toFixed(2),
        now: Number(week.weekGood.weekRate).toFixed(2),
        delta: `${delta.toFixed(2)} fewer`,
        basis: 'costly moments per game',
        better: true,
      });
    }
    if (week.weekBad) {
      const delta = Math.abs(week.weekBad.baseRate - week.weekBad.weekRate);
      rows.push({
        label: week.weekBad.name,
        before: Number(week.weekBad.baseRate).toFixed(2),
        now: Number(week.weekBad.weekRate).toFixed(2),
        delta: `${delta.toFixed(2)} more`,
        basis: 'costly moments per game',
        better: false,
      });
    }
  } else {
    // Young corpus: compare equal 20-game windows until a real prior-week
    // baseline exists.
    const timeline = REPORT.dashboard.timeline;
    const first = timeline[0];
    const latest = timeline.at(-1);
    $('change-title').textContent = '20-game check';
    $('change-scope').textContent = 'Games with a costly mistake · lower is better';
    $('change-before-label').textContent = 'Earlier';
    $('change-now-label').textContent = 'Latest';
    const defenseNames = { loose: 'Loose-piece games', fork: 'Fork games', mate: 'King-danger games', pin: 'Pin games' };
    const candidates = [];
    for (const [id, label] of Object.entries(defenseNames)) {
      const before = first.defense[id].gamesAffected;
      const now = latest.defense[id].gamesAffected;
      candidates.push({ label, before: `${before}/20`, now: `${now}/20`, delta: before - now });
    }
    const ranked = candidates.slice().sort((a, b) => b.delta - a.delta);
    const bestChange = ranked[0];
    const slide = ranked.at(-1);
    if (bestChange.delta > 0) {
      rows.push({
        label: bestChange.label,
        before: bestChange.before,
        now: bestChange.now,
        delta: `${bestChange.delta} fewer game${bestChange.delta === 1 ? '' : 's'}`,
        basis: 'in a 20-game window',
        better: true,
      });
    }
    if (slide.delta < 0) {
      const more = Math.abs(slide.delta);
      rows.push({
        label: slide.label,
        before: slide.before,
        now: slide.now,
        delta: `${more} more game${more === 1 ? '' : 's'}`,
        basis: 'in a 20-game window',
        better: false,
      });
    }
  }
  $('change-rows').innerHTML = rows.map((row) => {
    const tone = row.tone || (row.better ? 'better' : 'worse');
    const state = row.state || (row.better ? 'Better' : 'Watch');
    const aria = `${state}: ${row.label}. Before ${row.before}; now ${row.now}; ${row.delta} ${row.basis}.`;
    return `<div class="change-row ${tone}" aria-label="${escapeHtml(aria)}">
      <span class="change-copy">
        <strong class="change-label">${escapeHtml(row.label)}</strong>
        <span class="change-meta"><span class="change-state">${state}</span><span>${escapeHtml(row.delta)}</span></span>
      </span>
      <span class="change-value">${escapeHtml(row.before)}</span>
      <span class="change-arrow" aria-hidden="true">\u2192</span>
      <strong class="change-value change-now">${escapeHtml(row.now)}</strong>
    </div>`;
  }).join('');
  if (!rows.length) {
    $('change-rows').innerHTML = '<p class="change-empty">Not enough games yet to call a change.</p>';
  }
  const stableStrengths = strengths.filter((name) => !rows.some((row) => row.label === name));
  const stable = $('change-answer');
  stable.hidden = stableStrengths.length === 0;
  stable.innerHTML = stableStrengths.length
    ? `<span class="change-stable-label">Usually clean</span><span class="change-stable-list">${stableStrengths.map((name) => `<span><b aria-hidden="true">✓</b>${escapeHtml(name)}</span>`).join('')}</span>`
    : '';
}

// Jerry: "if you go to newest games, the one win one loss, it's two, like,
// little sample size — why do you only use two games?" Because the last sitting
// happened to be two games. A recent window is only worth reading if it is big
// enough to mean something, so this rolls the newest games up to at least
// MIN_RECENT and names the window it actually used.
const MIN_RECENT_GAMES = 20;

function recentWindow() {
  const games = REPORT.games || [];
  if (!games.length) return null;
  const size = Math.min(games.length, MIN_RECENT_GAMES);
  const rows = games.slice(-size);
  const record = { win: 0, loss: 0, draw: 0 };
  for (const row of rows) record[row.result] = (record[row.result] || 0) + 1;
  const ids = new Set(rows.map((row) => row.id));
  const positions = PUZZLE_SET.puzzles.filter((puzzle) => ids.has(puzzle.gameId));
  const patternHits = new Map();
  const subHits = new Map();
  for (const puzzle of positions) {
    for (const tag of puzzleTags(puzzle)) {
      if (patternById.has(tag)) patternHits.set(tag, (patternHits.get(tag) || 0) + 1);
    }
    const sub = puzzleSub(puzzle);
    if (sub) subHits.set(sub, (subHits.get(sub) || 0) + 1);
  }
  const topPattern = [...patternHits.entries()].sort((a, b) => b[1] - a[1])[0];
  const topSub = [...subHits.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    games: rows,
    ids,
    record,
    from: rows[0].date,
    through: rows.at(-1).date,
    positions: positions.length,
    topPattern: topPattern ? { id: topPattern[0], count: topPattern[1] } : null,
    topSub: topSub ? { label: topSub[0], count: topSub[1] } : null,
  };
}

function renderLatestSitting() {
  const card = document.querySelector('.latest-card');
  const window_ = recentWindow();
  if (!window_ || !card) {
    if (card) card.hidden = true;
    return;
  }
  card.hidden = false;
  const size = window_.games.length;
  $('latest-title').textContent = `Last ${size} games · ${shortDateLabel(window_.from)}–${shortDateLabel(window_.through)}`;
  const record = `${window_.record.win || 0}W–${window_.record.loss || 0}L${window_.record.draw ? `–${window_.record.draw}D` : ''}`;
  const focus = window_.topPattern
    ? ` Worst habit in them: <strong>${escapeHtml(patternById.get(window_.topPattern.id).name)}</strong>`
      + ` (${window_.topPattern.count} costly moment${window_.topPattern.count === 1 ? '' : 's'})`
      + (window_.topSub ? `, most often <strong>${escapeHtml(window_.topSub.label)}</strong> ×${window_.topSub.count}.` : '.')
    : ' No repeated costly pattern.';
  $('latest-answer').innerHTML = `<strong>${record}</strong> across ${size} games.${focus}`;
  const latest = REPORT.sittings?.latest;
  $('latest-sub').textContent = `${window_.positions} drillable positions`
    + (latest ? ` \u00b7 newest sitting ${shortDateLabel(latest.date)} was only ${latest.games} game${latest.games === 1 ? '' : 's'}` : '');
  $('latest-review').textContent = `Review these ${size} games →`;
}


// A blunder comparison needs a field. With Jerry and one other player it is a
// two-bar chart that says nothing new, so the whole Compare surface — tab,
// profile switch, and Summary card — stays hidden until a third player is in
// the league (Jerry: "blunder graph is obsolete if just two people... just
// remove or hide if not useful anymore"). It re-appears by itself the day
// build_blunder_league.py writes a third ledger; nothing to un-delete.
const LEAGUE_MIN_PLAYERS = 3;
const leagueIsUseful = () => (window.LEAGUE?.players?.length || 0) >= LEAGUE_MIN_PLAYERS;

function renderLeaguePreview() {
  const card = document.querySelector('.league-preview-card');
  if (!card) return;
  if (!leagueIsUseful()) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const link = $('league-preview-action');
  link.href = `/chess-league/?coach=${encodeURIComponent(PROFILE.id)}`;
  link.setAttribute('aria-label', `Compare ${PROFILE.playerName} with friends and replay verified blunders`);
}

// One card, three sentences, each with the sample behind it. No chart: the
// point is a fact he can act on before the next game, not a dashboard.
// Every rate carries its own denominator, next to the claim rather than in a
// footnote. One aggregate n hides an unequal split — the think-time answer reads
// "n=419" but is really 346 fast against 73 slow, and the reader deserves to
// calibrate the second number differently from the first.
function samples(a) {
  if (!a.samples || !a.samples.length) return `from ${a.n.toLocaleString()} of your decisions`;
  return a.samples.map((s) => `${s.n.toLocaleString()} ${escapeHtml(s.label)}`).join(' · ');
}

function renderRead() {
  const card = document.getElementById('read-card');
  if (!card) return;
  const answers = PRACTICAL_READ.answers || [];
  if (!answers.length) { card.hidden = true; return; }
  card.hidden = false;
  document.getElementById('read-answers').innerHTML = answers.map((a) => {
    const act = a.act ? `<p class="read-act">${escapeHtml(a.act)}</p>` : '';
    // Only findings the drill can actually practise get a link. An action the
    // app cannot honour is worse than none.
    // Declare the default state here too. A row with a link is marked and a row
    // without one is not, so silence reads as an oversight rather than a
    // decision. Every row now says what practises it, or why nothing does.
    const drill = a.drill
      ? ` <button type="button" class="read-drill" data-drill-filter="${escapeHtml(a.drill)}">${escapeHtml(a.drillLabel || 'Drill these')} →</button>`
      : (a.noDrill ? ` <span class="read-nodrill">${escapeHtml(a.noDrill)}</span>` : '');
    return `<div class="read-answer${a.worse ? ' is-cost' : ''}">`
      + `<p class="read-headline">${escapeHtml(a.headline)}</p>${act}`
      + `<p class="read-n">${samples(a)}${drill}</p></div>`;
  }).join('');
  // Survive silence. A refresh that finds no new games regenerates an identical
  // file, so without saying how old the newest game is the card would keep
  // implying it describes recent play. Same failure class as a frozen cache:
  // the surface looks current because nothing announces that it is not.
  const scope = document.getElementById('read-scope');
  const newest = PRACTICAL_READ.newestGame || PRACTICAL_READ.generated;
  // Say how many standing questions RAN, not just how many had something to
  // say. Otherwise a question that found nothing is indistinguishable from one
  // that was never asked, and the reader infers the surface is the whole survey.
  const asked = PRACTICAL_READ.questionsAsked;
  const answered = PRACTICAL_READ.questionsAnswered ?? answers.length;
  const survey = asked && asked !== answered
    ? `${answered} of ${asked} standing questions found something to act on · `
    : '';
  const base = `${survey}${PRACTICAL_READ.decisions.toLocaleString()} decisions across ${PRACTICAL_READ.games} games`;
  const days = newest ? Math.floor((Date.now() - Date.parse(newest.replace(/\./gu, '-'))) / 86400000) : null;
  if (days === null || Number.isNaN(days)) {
    scope.textContent = base;
  } else if (days <= 2) {
    scope.textContent = `${base} · through ${shortDateLabel(newest)}`;
  } else {
    scope.textContent = `${base} · newest game ${shortDateLabel(newest)}, ${days} days ago`;
    scope.classList.toggle('is-stale', days >= 10);
  }
}

// The read sits on Summary, so its link must SWITCH to the drill — the other
// data-drill-filter hosts live inside the drill already and only re-scope it.
// Wiring it to applyDrillFilter set the scope correctly and never navigated,
// which the matrix caught as "landed on Summary" in all six cells.
$('read-answers').addEventListener('click', (event) => {
  const button = event.target.closest('[data-drill-filter]');
  if (button) openDrill({ pattern: button.dataset.drillFilter });
});

function renderProgress() {
  renderRead();
  renderLatestSitting();
  renderLeaguePreview();
  renderOpenings();
  renderMistakes();
  renderChange();
  renderSessionCard();
  const host = $('progress-view');
  for (const cls of PROFILE.summaryOrder) {
    const card = host.querySelector(`.${cls}`);
    if (card) host.appendChild(card);
  }
}

const DRILL_STORE = PROFILE.stores.stats;
// The daily set: small enough to finish standing in a line, big enough that a
// motif repeats inside one sitting.
const DAILY_TARGET = 8;
const DRILL_PATTERN_LABELS = {
  piece_safety: 'Loose pieces',
  king_attack: 'King attack',
  fork: 'Forks',
  gift: 'Free captures',
  pin: 'Pins',
  passed_pawn: 'Passed pawns',
  coordination: 'Coordination'
};
// --- Exact queries: every number on the Summary resolves to real positions ---
// The dashboard counts moments two ways: a pattern row counts every episode
// TAGGED with that pattern (a moment can be both a hung piece and a mate), and
// a nuance/phase row counts the plain `sub` label. The drill pool must be
// filtered the same way or the row you tapped would not hand back the
// positions it just promised (Jerry: "all of these subcategories should be
// extremely easy to query too").
const puzzleTags = (puzzle) => (puzzle.tags && puzzle.tags.length ? puzzle.tags : [puzzle.pattern]);

// Older cached data (a service-worker copy from before `sub` shipped) still
// carries `threat`, which the builder writes from the same branch as `sub` —
// so the label is recoverable rather than lost.
const SUB_FROM_THREAT = [
  [/^your king can be mated by force$/, () => 'allowed a mate'],
  [/^you have a forced mate on the board$/, () => 'missed a mate'],
  [/^their (\w+) is one move from a fork on/, (m) => `${m[1]} fork`],
  [/^one of their defenders is pinned/, () => 'missed a pin win'],
  [/^their (\w+) can pin your (\w+)$/, () => 'walked into a pin'],
  [/^that capture loses the exchange back/, () => 'bad capture'],
  [/^your (\w+) on \w+ can be taken$/, (m) => `hung ${m[1]}`],
  [/^their (\w+) on \w+ is free right now$/, (m) => `missed a free ${m[1]}`],
  [/^their pawn on \w+ is about to queen$/, () => 'runner pawn ignored'],
  [/^a forcing check is on the board$/, () => 'missed a forcing check'],
  [/^you are worse/, () => 'collapsed while worse'],
  [/^a forcing sequence is available$/, () => 'missed their threat'],
];

function puzzleSub(puzzle) {
  if (puzzle.sub) return puzzle.sub;
  // Lichess puzzles carry no threat clause at all — they have no `sub` to
  // recover, and none is invented for them.
  if (typeof puzzle.threat !== 'string') return '';
  const threat = puzzle.threat;
  if (!threat) return 'aimless move';
  if (/^a forcing move is on the board this turn$/.test(threat)) {
    const san = (puzzle.takeaway || '').split(' was available right now')[0];
    return san.includes('x') ? 'missed a capture' : 'missed a check';
  }
  for (const [pattern, label] of SUB_FROM_THREAT) {
    const match = threat.match(pattern);
    if (match) return label(match);
  }
  return '';
}

const drill = {
  board: null,
  source: 'mine', // 'mine' = from the player's games · 'fresh' = curated lichess tactics
  filter: 'all',
  sub: null,     // a breakdown label ("allowed a mate", "hung bishop") from the Summary
  phaseOf: null, // 'opening' | 'middlegame' | 'endgame' — set by the phase strip
  opening: null, // an opening-family scope set from the Summary openings card
  queue: [],
  index: 0,
  puzzle: null,
  phase: 'solving',
  tries: 0,
  lineIndex: 0,
  hintStage: 0,
  timer: null,
  speedTimer: null,
  speedUntil: 0,
  animTimer: null,
  wrongTimer: null
};

// Speed mode's scoreboard: a rate over the pool, not mastery of a position.
const SPEED_STORE = `${PROFILE.id}-drill-speed-v1`;

function speedStats() {
  const raw = loadJson(SPEED_STORE);
  return { attempts: raw.attempts || 0, inTime: raw.inTime || 0, day: raw.day || '', today: raw.today || 0, todayInTime: raw.todayInTime || 0 };
}

function recordSpeedAttempt(inTime) {
  const stats = speedStats();
  const today = new Date().toISOString().slice(0, 10);
  const sameDay = stats.day === today;
  saveJson(SPEED_STORE, {
    attempts: stats.attempts + 1,
    inTime: stats.inTime + (inTime ? 1 : 0),
    day: today,
    today: (sameDay ? stats.today : 0) + 1,
    todayInTime: (sameDay ? stats.todayInTime : 0) + (inTime ? 1 : 0),
  });
}

function drillStats() {
  try {
    return JSON.parse(localStorage.getItem(DRILL_STORE)) || {};
  } catch {
    return {};
  }
}

function saveDrillStats(stats) {
  try {
    localStorage.setItem(DRILL_STORE, JSON.stringify(stats));
  } catch {
    /* private mode: session counter still works */
  }
}

function recordDrillSolve() {
  const stats = drillStats();
  const today = new Date().toISOString().slice(0, 10);
  stats.total = (stats.total || 0) + 1;
  stats.today = stats.day === today ? (stats.today || 0) + 1 : 1;
  stats.day = today;
  saveDrillStats(stats);
}

// --- Spaced repetition (SM-2-lite) + per-motif failure tracking ---------------
// Each puzzle is a real mistake from the player's own games. We resurface the
// ones they do NOT nail first try, on the Anki-style expanding schedule, and
// keep per-motif first-try accuracy so the app can name what keeps getting
// missed. Pass = solved first try; multiple tries or a reveal is a lapse.
const DRILL_SRS_STORE = PROFILE.stores.srs;
const DRILL_MOTIF_STORE = PROFILE.stores.motifs;
const DRILL_ROTATION_STORE = PROFILE.stores.rotation || `${PROFILE.id}-drill-rotation-v1`;
const DAY_MS = 86400000;

function loadJson(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
}
function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

function loadDrillRotation() {
  const stored = loadJson(DRILL_ROTATION_STORE);
  return {
    version: 2,
    positions: stored.positions && typeof stored.positions === 'object' ? stored.positions : {},
    games: stored.games && typeof stored.games === 'object' ? stored.games : {},
  };
}

function recordDrillExposure(puzzle) {
  const rotation = loadDrillRotation();
  const previous = rotation.positions[puzzle.id] || { views: 0, seenAt: 0 };
  const next = {
    views: (previous.views || 0) + 1,
    seenAt: Date.now(),
  };
  rotation.positions[puzzle.id] = next;
  const gameKey = drillGameKey(puzzle);
  const previousGame = rotation.games[gameKey] || { views: 0, seenAt: 0 };
  rotation.games[gameKey] = {
    views: (previousGame.views || 0) + 1,
    seenAt: next.seenAt,
  };
  // The current corpora are below 1,500 positions. Keep a bounded safety
  // margin so years of retired IDs cannot grow localStorage forever.
  const entries = Object.entries(rotation.positions);
  if (entries.length > 2_000) {
    entries
      .sort((a, b) => (b[1].seenAt || 0) - (a[1].seenAt || 0))
      .slice(1_500)
      .forEach(([id]) => delete rotation.positions[id]);
  }
  saveJson(DRILL_ROTATION_STORE, rotation);
  return next;
}

function gradeSrs(id, passed) {
  const store = loadJson(DRILL_SRS_STORE);
  const now = Date.now();
  const s = store[id] || { reps: 0, ease: 2.5, interval: 0, due: 0, lapses: 0 };
  if (passed) {
    s.reps += 1;
    if (s.reps === 1) s.interval = 1;
    else if (s.reps === 2) s.interval = 3;
    else s.interval = Math.max(1, Math.round(s.interval * s.ease));
    s.ease = Math.min(2.7, s.ease + 0.05);
    s.due = now + s.interval * DAY_MS;
  } else {
    s.reps = 0;
    s.lapses += 1;
    s.interval = 0;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.due = now + 10 * 60 * 1000; // ~10 min: comes back this or the next session
  }
  s.seen = now;
  store[id] = s;
  saveJson(DRILL_SRS_STORE, store);
}

function recordMotif(pattern, firstTry) {
  const store = loadJson(DRILL_MOTIF_STORE);
  const m = store[pattern] || { attempts: 0, firstTry: 0 };
  m.attempts += 1;
  if (firstTry) m.firstTry += 1;
  store[pattern] = m;
  saveJson(DRILL_MOTIF_STORE, store);
}

function drillSet() {
  return drill.source === 'fresh' ? FRESH_SET : PUZZLE_SET;
}

function drillReviewCounts() {
  const store = loadJson(DRILL_SRS_STORE);
  const rotation = loadDrillRotation().positions;
  const now = Date.now();
  let due = 0;
  let unseen = 0;
  // Counted over the CURRENT scope, not the whole set: "1,017 not shown yet"
  // while grinding a 29-position label was noise.
  const pool = drill.queue.length ? drill.queue : drillSet().puzzles;
  for (const puzzle of pool) {
    const s = store[puzzle.id];
    if (!rotation[puzzle.id]) unseen += 1;
    if (s && (s.due || 0) <= now) due += 1;
  }
  return { due, unseen };
}

function weakMotifs(minAttempts) {
  const store = loadJson(DRILL_MOTIF_STORE);
  return Object.entries(store)
    .filter(([, m]) => m.attempts >= (minAttempts || 3))
    .map(([id, m]) => ({ id, rate: m.firstTry / m.attempts, attempts: m.attempts, firstTry: m.firstTry }))
    .sort((a, b) => a.rate - b.rate);
}

function drillGameKey(puzzle) {
  return puzzle.gameId || puzzle.game || puzzle.id;
}

function interleaveDrillGames(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = drillGameKey(entry.puzzle);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  let active = [...groups.values()];
  const out = [];
  while (active.length) {
    for (const group of active) out.push(group.shift());
    active = active.filter((group) => group.length);
  }
  return out;
}

// SRS-ordered and exposure-aware: failed/due reviews first, then positions
// never shown on this device, then the least recently shown. Within every
// bucket, take one position per game before taking a second from that game.
// The single definition of "what am I drilling": pattern ∧ subcategory ∧ phase
// ∧ opening. Every entry point (a pattern row, a nuance chip, a phase chip, an
// opening row, the picker) sets fields on `scope` and gets a pool from here, so
// the count shown and the count drilled are the same number by construction.
// "aimless move" is the drift bucket: its own takeaway says "Nothing was
// hanging yet". There is no punishment to see and no motif to name, so as a
// graded puzzle it is a coin flip with a vague prompt ("Find the move that
// keeps your position together") — and at 168 positions it was leading the
// default queue. It stays fully reachable as an explicit choice (the Summary
// nuance chip and the picker's "aimless move · 168"), but it no longer eats
// the drill you open when you have five minutes.
const DRIFT_SUB = 'aimless move';
const isDrift = (puzzle) => puzzleSub(puzzle) === DRIFT_SUB;

// Measured with Maia-3 over the whole corpus (projects/chess-learnability-study.md):
// for two thirds of these positions the right move is ALREADY in the top 3 of a
// player at this rating. Those are not knowledge gaps, they are execution
// slips — he knows the move and did not look. An explanation teaches nothing
// there; the training that helps is seeing it before the clock runs out.
//
// Only the split that survived the study is used. The finer trainable/reach
// distinction is not measurable with this tool and is deliberately not shipped.
const isSlip = (puzzle) => LEARNABILITY.bands[puzzle.id] === 'k';
const SPEED_SECONDS = 8;
const mineDrillableCount = PUZZLE_SET.puzzles.reduce((n, puzzle) => n + (isDrift(puzzle) ? 0 : 1), 0);

function drillPool(scope, puzzles) {
  const source = puzzles || drillSet().puzzles;
  const wantsDrift = scope.sub === DRIFT_SUB;
  return source.filter((puzzle) => {
    if (!wantsDrift && isDrift(puzzle)) return false;
    if (scope.filter === 'speed' && !isSlip(puzzle)) return false;
    if (scope.filter === 'explain' && isSlip(puzzle)) return false;
    if (scope.filter === 'punish' && !puzzle.punish) return false;
    if (scope.filter && !['all', 'punish', 'speed', 'explain'].includes(scope.filter)
      && !puzzleTags(puzzle).includes(scope.filter)) return false;
    if (scope.sub && puzzleSub(puzzle) !== scope.sub) return false;
    if (scope.phaseOf && puzzle.phase !== scope.phaseOf) return false;
    if (scope.opening && puzzle.op !== scope.opening) return false;
    return true;
  });
}

function drillQueue() {
  const set = drillSet();
  const pool = drillPool({
    filter: drill.filter,
    sub: drill.sub,
    phaseOf: drill.phaseOf,
    opening: drill.source === 'mine' ? drill.opening : null,
  }, set.puzzles);
  const store = loadJson(DRILL_SRS_STORE);
  const rotationState = loadDrillRotation();
  const rotation = rotationState.positions;
  const gameRotation = rotationState.games;
  const now = Date.now();
  // Why the app "kept giving the same puzzles": the queue is deterministic and
  // every visit to the tab rebuilt it and jumped back to #1, so whatever sat in
  // the review buckets led EVERY session. A position you have already looked at
  // in the last few hours now cools off to the back of the queue regardless of
  // its SRS state — a lapse still returns today, just not as the first thing
  // you see each time you open the app.
  const COOLDOWN_MS = 5 * 60 * 60 * 1000;
  const cooling = (puzzle) => now - (rotation[puzzle.id]?.seenAt || 0) < COOLDOWN_MS;
  const speed = speedMode();
  const bucket = (puzzle) => {
    if (cooling(puzzle)) return 4; // seen very recently — send it to the back
    // Speed mode writes no SRS, so it must not READ one either: an old lapse
    // from a hinted session would drag the same position back to the front of a
    // queue whose whole value is freshness.
    if (speed) return rotation[puzzle.id] ? 3 : 2;
    const s = store[puzzle.id];
    if (s && (s.due || 0) <= now && s.lapses > 0) return 0; // missed before, due again
    if (s && (s.due || 0) <= now) return 1; // due review
    if (!rotation[puzzle.id]) return 2; // never shown on this device
    return 3; // shown before, not due: oldest exposure first
  };
  const ordered = pool.map((puzzle, order) => ({ puzzle, order }));
  const queue = [];
  for (let targetBucket = 0; targetBucket <= 4; targetBucket += 1) {
    const entries = ordered
      .filter((entry) => bucket(entry.puzzle) === targetBucket)
      .sort((a, b) => {
        if (targetBucket === 2) {
          const gameTime = (gameRotation[drillGameKey(a.puzzle)]?.seenAt || 0)
            - (gameRotation[drillGameKey(b.puzzle)]?.seenAt || 0);
          return gameTime || a.order - b.order;
        }
        if (targetBucket === 3 || targetBucket === 4) {
          const time = (rotation[a.puzzle.id]?.seenAt || 0) - (rotation[b.puzzle.id]?.seenAt || 0);
          return time || a.order - b.order;
        }
        const due = (store[a.puzzle.id]?.due || 0) - (store[b.puzzle.id]?.due || 0);
        return due || a.order - b.order;
      });
    queue.push(...interleaveDrillGames(entries));
  }
  return queue.map((entry) => entry.puzzle);
}

// One name per pattern everywhere: the Summary's wording wins, so a row that
// says "King danger" cannot become "King attack" once you are drilling it.
function drillPatternLabel(id) {
  return patternById.get(id)?.name || DRILL_PATTERN_LABELS[id] || id;
}


// One decision, one row: WHICH set you are drilling (segmented pair), and a
// single native picker for narrowing it. Every pattern lives inside the
// picker (zero screen cost, familiar iOS wheel) instead of a chip crowd.
function renderDrillFilters() {
  const set = drillSet();
  const counts = new Map();
  const subCounts = new Map();
  const phaseCounts = new Map();
  // Pattern and phase counts describe what the picker will actually queue, so
  // they are taken over the drillable set. The exact-mistake list keeps the
  // drift label with its true size — choosing it explicitly still works.
  for (const puzzle of set.puzzles) {
    const sub = puzzleSub(puzzle);
    if (sub) subCounts.set(sub, (subCounts.get(sub) || 0) + 1);
    if (isDrift(puzzle)) continue;
    for (const tag of puzzleTags(puzzle)) counts.set(tag, (counts.get(tag) || 0) + 1);
    if (puzzle.phase) phaseCounts.set(puzzle.phase, (phaseCounts.get(puzzle.phase) || 0) + 1);
  }
  const drillableCount = set.puzzles.reduce((n, puzzle) => n + (isDrift(puzzle) ? 0 : 1), 0);
  const focusId = REPORT.summary.focus.patternId;
  const current = drill.sub
    ? `sub:${drill.sub}`
    : (drill.phaseOf ? `phase:${drill.phaseOf}` : (drill.opening && drill.source === 'mine' ? 'op' : drill.filter));
  const option = (id, label) =>
    `<option value="${escapeHtml(id)}"${id === current ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  let options = '';
  if (drill.opening && drill.source === 'mine') {
    const n = drillPool({ opening: drill.opening }, set.puzzles).length;
    options += `<option value="op"${current === 'op' ? ' selected' : ''}>Opening: ${escapeHtml(drill.opening)} · ${n}</option>`;
  }
  options += option('all', `All · ${drillableCount}`);
  // The two training modes the measurement implies. They are scopes, not new
  // chrome: the same one-row picker that already narrows by pattern.
  // Explain only. The Speed scope was built and then withdrawn: his own clock
  // data refutes its premise — error rate rises monotonically with think time,
  // so a clock would pressure the regime where he is already strongest and
  // manufacture failures on moves he plays correctly in real games. The pool
  // and the band data stay, so it is one line to bring back if the mechanism
  // is ever identified. See projects/chess-learnability-study.md.
  if (drill.source === 'mine' && LEARNABILITY.count) {
    const explain = drillPool({ filter: 'explain' }, set.puzzles).length;
    if (explain) options += option('explain', `Explain · ${explain}`);
  }
  if (counts.has(focusId)) {
    options += option(focusId, `★ ${drillPatternLabel(focusId)} · ${counts.get(focusId)} — recommended`);
  }
  if (drill.source === 'mine' && PUZZLE_SET.punishCount) {
    options += option('punish', `Punish the blunder · ${PUZZLE_SET.punishCount}`);
  }
  const rest = [...counts.entries()]
    .filter(([id]) => id !== focusId)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => option(id, `${drillPatternLabel(id)} · ${count}`))
    .join('');
  if (rest) options += `<optgroup label="More patterns">${rest}</optgroup>`;
  // Every nuance row on the Summary is also reachable from inside Drill, so a
  // grind session can hop straight from "missed a mate ×29" to the next label
  // without going back to the dashboard.
  const subs = [...subCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => option(`sub:${label}`, `${label} · ${count}`))
    .join('');
  if (subs) options += `<optgroup label="Exact mistake">${subs}</optgroup>`;
  const phases = ['opening', 'middlegame', 'endgame']
    .filter((phase) => phaseCounts.get(phase))
    .map((phase) => option(`phase:${phase}`, `${capitalized(phase)} · ${phaseCounts.get(phase)}`))
    .join('');
  if (phases) options += `<optgroup label="Game phase">${phases}</optgroup>`;
  $('drill-filters').innerHTML = `
    <div class="drill-seg" role="group" aria-label="What to drill">
      <button type="button" data-drill-source="mine" aria-pressed="${drill.source === 'mine'}">My mistakes<span class="seg-count"> · ${mineDrillableCount}</span></button>
      <button type="button" data-drill-source="fresh" aria-pressed="${drill.source === 'fresh'}">New puzzles<span class="seg-count"> · ${FRESH_SET.count}</span></button>
    </div>
    <label class="drill-pick">
      <span class="visually-hidden">Narrow the set</span>
      <select id="drill-filter-select">${options}</select>
    </label>`;
  const select = document.getElementById('drill-filter-select');
  select.addEventListener('change', () => applyDrillFilter(select.value));
}

// One line under the picker naming EXACTLY what is queued, with the way out.
// Without it, arriving from a nuance chip feels like a random puzzle stream.
function renderDrillScope() {
  const el = $('drill-scope');
  if (!el) return;
  const parts = [];
  if (drill.opening && drill.source === 'mine') parts.push(drill.opening);
  const SCOPE_NAMES = {
    punish: 'Punish the blunder',
    speed: 'Speed drill',
    explain: 'Explain',
  };
  if (drill.filter !== 'all') {
    parts.push(SCOPE_NAMES[drill.filter] || drillPatternLabel(drill.filter));
  }
  if (drill.phaseOf) parts.push(capitalized(drill.phaseOf));
  if (drill.sub) parts.push(drill.sub);
  if (!parts.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const n = drill.queue.length;
  const games = new Set(drill.queue.map((puzzle) => drillGameKey(puzzle))).size;
  el.hidden = false;
  el.innerHTML = `<span class="drill-scope-copy"><strong>${parts.map(escapeHtml).join(' \u2192 ')}</strong>`
    + ` \u00b7 ${n} position${n === 1 ? '' : 's'} \u00b7 ${games} game${games === 1 ? '' : 's'}</span>`
    + '<button type="button" class="drill-scope-clear" data-drill-filter="all" aria-label="Clear this filter">Clear \u00d7</button>';
}

function renderDrillStats() {
  const stats = drillStats();
  const today = new Date().toISOString().slice(0, 10);
  const solvedToday = stats.day === today ? (stats.today || 0) : 0;
  // Position in the queue, what is owed, and today's count. The "N not shown
  // yet / from your games / all-time" tail was noise nobody acts on.
  const { due } = drillReviewCounts();
  const parts = [];
  // A finish line, not an odometer. "#1 of 1018" is a number nobody can
  // finish, so a short sitting never feels like it counted; a small daily set
  // is the version you can actually clear before the bus comes.
  if (speedMode()) {
    // The meaningful number for a scan habit is the rate over the pool, not how
    // many individual positions have been "mastered".
    const sp = speedStats();
    const today = new Date().toISOString().slice(0, 10);
    const shownToday = sp.day === today ? sp.today : 0;
    const hitToday = sp.day === today ? sp.todayInTime : 0;
    // "0 of 0" is a dead number before the first rep; say what the set IS.
    parts.push(shownToday
      ? `${hitToday} of ${shownToday} in time today`
      : `${drill.queue.length} to scan · ${SPEED_SECONDS}s each`);
    if (sp.attempts >= 20) parts.push(`${Math.round((sp.inTime / sp.attempts) * 100)}% all-time`);
    $('drill-stats').textContent = parts.join(' · ');
    $('drill-stats').classList.remove('drill-stats-done');
    $('drill-weakspots').hidden = true;
    return;
  }
  if (solvedToday >= DAILY_TARGET) {
    parts.push(`Today's set done · ${solvedToday} solved`);
  } else {
    parts.push(`${solvedToday} of ${DAILY_TARGET} today · ${DAILY_TARGET - solvedToday} to go`);
  }
  if (due > 0) parts.push(`${due} due`);
  $('drill-stats').textContent = parts.join(' · ');
  $('drill-stats').classList.toggle('drill-stats-done', solvedToday >= DAILY_TARGET);
  const el = $('drill-weakspots');
  const weak = weakMotifs(3).slice(0, 3);
  if (weak.length && weak[0].rate < 0.85) {
    el.hidden = false;
    el.innerHTML = 'Keep missing: ' + weak
      .filter((w) => w.rate < 0.85)
      .map((w) => `<button type="button" class="weakspot-drill" data-drill-filter="${escapeHtml(w.id)}">${escapeHtml(drillPatternLabel(w.id))}</button> ${w.firstTry}/${w.attempts} first try`)
      .join(' · ') + ' <span class="weakspot-hint">— tap to drill it</span>';
  } else {
    el.hidden = true;
  }
}

function ensureDrillBoard() {
  if (drill.board) return;
  drill.board = BoardCore.makeBoard($('drill-board'), {
    movable: { free: false, color: 'white', showDests: true, events: { after: onDrillMove } },
    premovable: { enabled: false },
    draggable: { showGhost: true },
    drawable: { enabled: false, visible: true, brushes: { ...BoardCore.THIN_BRUSHES, ...BoardCore.HINT_BRUSHES } }
  });
}

// Legal destinations come from the builder (python-chess), compact form
// { e2: "e3e4" } — the UI ships no move generator.
function drillDests(puzzle) {
  const map = new Map();
  for (const [orig, str] of Object.entries(puzzle.dests || {})) {
    map.set(orig, str.match(/.{2}/g) || []);
  }
  return map;
}

const NO_MOVES = new Map();

function drillMovable(puzzle, dests) {
  return {
    free: false,
    color: puzzle.side,
    dests,
    showDests: true,
    events: { after: onDrillMove }
  };
}

// Speed mode. For a position whose answer a player at this level already knows,
// the useful pressure is the clock, not a hint — so the hint ladder is gone and
// the only feedback is whether it was seen in time. The bar is the whole
// display: no number counting down in your face, just a line that runs out.
function stopSpeedClock() {
  if (drill.speedTimer) cancelAnimationFrame(drill.speedTimer);
  drill.speedTimer = null;
  const bar = $('drill-clock');
  if (bar) bar.hidden = true;
}

function speedMode() {
  return drill.filter === 'speed' && drill.source === 'mine';
}

function startSpeedClock() {
  const bar = $('drill-clock');
  if (!bar || !speedMode() || BoardCore.REDUCED_MOTION) return;
  const fill = bar.firstElementChild;
  drill.speedUntil = Date.now() + SPEED_SECONDS * 1000;
  bar.hidden = false;
  bar.classList.remove('is-out');
  const tick = () => {
    const left = drill.speedUntil - Date.now();
    if (drill.phase !== 'solving') return stopSpeedClock();
    if (left <= 0) {
      bar.classList.add('is-out');
      fill.style.width = '0%';
      drill.speedTimer = null;
      drill.speedExpired = true;
      $('drill-verdict').textContent = `Time — you knew this one, you just did not look in ${SPEED_SECONDS}s.`;
      $('drill-verdict').className = 'drill-verdict bad';
      drillHint();
      drillHint();
      return;
    }
    fill.style.width = `${(left / (SPEED_SECONDS * 1000)) * 100}%`;
    drill.speedTimer = requestAnimationFrame(tick);
  };
  drill.speedTimer = requestAnimationFrame(tick);
}

function loadDrillPuzzle() {
  clearTimeout(drill.timer);
  clearTimeout(drill.animTimer);
  clearTimeout(drill.wrongTimer);
  stopSpeedClock();
  if (!drill.queue.length) drill.queue = drillQueue();
  if (!drill.queue.length) {
    // An empty pool only happens for a combination nobody played (an opening
    // crossed with a rare label). Say so instead of leaving the last puzzle up.
    renderDrillScope();
    $('drill-badge').textContent = 'Nothing here';
    $('drill-gameline').textContent = '';
    $('drill-question').textContent = 'No positions match this combination — clear it or pick another label.';
    $('drill-verdict').textContent = '';
    $('drill-answer').hidden = true;
    return;
  }
  drill.index = ((drill.index % drill.queue.length) + drill.queue.length) % drill.queue.length;
  drill.puzzle = drill.queue[drill.index];
  drill.phase = 'solving';
  drill.speedExpired = false;
  drill.tries = 0;
  drill.lineIndex = 0;
  drill.hintStage = 0;
  const puzzle = drill.puzzle;
  const exposure = recordDrillExposure(puzzle);
  ensureDrillBoard();
  // The board may have been hidden (0x0 cached bounds) — re-measure first.
  remeasureBoards();
  drill.board.setShapes([]);
  const live = () => drill.puzzle === puzzle && drill.phase === 'solving' && !$('drill-view').hidden;
  if (puzzle.prev && puzzle.prevFen && !BoardCore.REDUCED_MOTION) {
    // chess.com puzzle load: show the position before the opponent's move,
    // then animate their move in and leave the yellow from/to highlight.
    // Input opens when the real position lands (empty dests until then).
    drill.board.set({
      fen: puzzle.prevFen,
      orientation: puzzle.side,
      turnColor: puzzle.side === 'white' ? 'black' : 'white',
      lastMove: undefined,
      movable: drillMovable(puzzle, NO_MOVES)
    });
    drill.animTimer = setTimeout(() => {
      if (!live()) return;
      drill.board.move(puzzle.prev.uci.slice(0, 2), puzzle.prev.uci.slice(2, 4));
      moveSfx(puzzle.prev.san);
      // True-up to the exact puzzle position (castle rook, en passant,
      // promotion) and open input with the real legal-move map.
      drill.animTimer = setTimeout(() => {
        if (!live()) return;
        drill.board.set({
          fen: puzzle.fen,
          turnColor: puzzle.side,
          lastMove: uciSquares(puzzle.prev.uci),
          movable: drillMovable(puzzle, drillDests(puzzle))
        });
      }, 210);
    }, 420);
  } else {
    drill.board.set({
      fen: puzzle.fen,
      orientation: puzzle.side,
      turnColor: puzzle.side,
      lastMove: puzzle.prev ? uciSquares(puzzle.prev.uci) : undefined,
      movable: drillMovable(puzzle, drillDests(puzzle))
    });
  }
  // After the orientation-carrying set() — a flip rebuilds the wrap.
  BoardCore.setCoordsOrientation(drill.board.coordsEl, puzzle.side);
  $('drill-board').dataset.fen = puzzle.fen;
  $('drill-board').dataset.puzzleId = puzzle.id;
  $('drill-board').dataset.gameId = drillGameKey(puzzle);
  const srs = loadJson(DRILL_SRS_STORE)[puzzle.id];
  const missedBefore = srs && srs.lapses > 0;
  const seenBefore = exposure.views > 1;
  const returnLabel = missedBefore ? 'Review after miss · ' : (seenBefore ? 'Seen before · ' : '');
  const badge = $('drill-badge');
  if (drill.source === 'fresh') {
    badge.innerHTML = `<span class="badge-kicker">New puzzle</span>`
      + `<span class="badge-label">${escapeHtml(puzzle.patternLabel || drillPatternLabel(puzzle.pattern))}</span>`
      + `<span class="badge-count">rated ${puzzle.rating}</span>`;
  } else {
    // "i'm not given the context of, like, i do this wrong move how many
    // times" — the badge answers that for the EXACT mistake on the board (its
    // breakdown label), falling back to the pattern when a position has none.
    const sub = puzzleSub(puzzle);
    const scoped = sub
      ? PUZZLE_SET.puzzles.filter((item) => puzzleSub(item) === sub)
      : PUZZLE_SET.puzzles.filter((item) => item.pattern === puzzle.pattern);
    const patternInfo = REPORT.patterns.find((pattern) => pattern.id === puzzle.pattern);
    const label = sub || patternInfo?.name || drillPatternLabel(puzzle.pattern);
    const games = new Set(scoped.map((item) => item.gameId || item.game)).size;
    // The family name used to be appended raw, so "walked into a pin" +
    // "Pinned defenders" read as one run-on all-caps phrase on a 390px phone.
    // Only the kicker is uppercase now, and the family is dropped: the exact
    // label already says it, and its family is one tap away in the picker.
    badge.innerHTML = `<span class="badge-kicker">Your mistake</span>`
      + `<span class="badge-label">${escapeHtml(label)}</span>`
      + `<span class="badge-count">${scoped.length}× in ${games} games</span>`;
  }
  // One line of context above the board: which game this comes from, and how
  // deep into that game's story you are. The dot keeps its color for every
  // puzzle of one game and changes when the game changes — the "am I still in
  // the same game?" signal at a glance.
  const gameline = $('drill-gameline');
  if (drill.source === 'fresh') {
    gameline.innerHTML = `${returnLabel}lichess puzzle · rated ${puzzle.rating}`;
    gameline.classList.remove('has-dot');
    gameline.style.removeProperty('--game-hue');
  } else {
    const run = gameRunOf(puzzle);
    const resultWord = puzzle.result === 'win' ? 'won' : (puzzle.result === 'loss' ? 'lost' : 'drew');
    const runText = run.n > 1 ? ` · <strong>${run.i} of ${run.n}</strong> from this game` : '';
    gameline.innerHTML = returnLabel
      + `vs <strong>${escapeHtml(puzzle.opponent)}</strong> (${resultWord}, ${escapeHtml(shortDateLabel(puzzle.date))}) · move ${puzzle.moveNo}${runText}`;
    gameline.classList.add('has-dot');
    gameline.style.setProperty('--game-hue', String(gameHue(puzzle.gameId || puzzle.game)));
  }
  $('drill-question').textContent = `${puzzle.side === 'white' ? 'White' : 'Black'} to move — ${puzzle.task}`;
  $('drill-verdict').textContent = '';
  $('drill-verdict').className = 'drill-verdict';
  $('drill-answer').hidden = true;
  $('drill-retry').hidden = true;
  $('drill-hint').textContent = 'Hint';
  $('drill-hint').disabled = false;
  // Speed mode has no hint ladder — a hint answers "what is the move", which is
  // the one thing these positions do not need.
  $('drill-hint').hidden = speedMode();
  $('drill-next').textContent = 'Skip →';
  $('drill-next').classList.remove('primary-action');
  $('drill-next').classList.add('drill-secondary');
  renderDrillStats();
  renderDrillScope();
  if (speedMode()) {
    const delay = puzzle.prev && puzzle.prevFen && !BoardCore.REDUCED_MOTION ? 640 : 0;
    drill.timer = setTimeout(startSpeedClock, delay);
  }
}

// Consecutive puzzles from the same game inside the CURRENT queue: "k of n
// from this game". Filters reorder the queue, so this is computed live.
function gameRunOf(puzzle) {
  const queue = drill.queue;
  const key = puzzle.gameId || puzzle.game;
  let start = drill.index;
  while (start > 0 && (queue[start - 1].gameId || queue[start - 1].game) === key) start -= 1;
  let end = drill.index;
  while (end + 1 < queue.length && (queue[end + 1].gameId || queue[end + 1].game) === key) end += 1;
  return { i: drill.index - start + 1, n: end - start + 1 };
}

// A stable hue per game id — muted, theme-agnostic (used at low saturation).
function gameHue(key) {
  let hash = 0;
  for (const character of String(key)) hash = (hash * 31 + character.charCodeAt(0)) % 360;
  return hash;
}

function finishDrillLine() {
  drill.phase = 'done';
  const puzzle = drill.puzzle;
  const firstTry = drill.tries === 0;
  const inTime = firstTry && !drill.speedExpired;
  if (speedMode()) {
    // A slip is NOT a memory item, so it must not enter spaced repetition.
    // Grading a timeout as a lapse puts the position in the lapsed-and-due
    // bucket, which is the permanent front of the queue — and a simulated three
    // weeks of speed sessions showed that ending with 96% of every session
    // spent re-showing the same nine positions while 800+ fresh ones never
    // appeared. Re-showing one anyway teaches nothing: after one exposure the
    // answer is remembered, which is meaningless for a move he already knew.
    // What is being trained is the habit of scanning, and that only transfers
    // across FRESH positions. So: no SRS write, no in-session requeue, and the
    // thing tracked is the rate across the pool rather than mastery of any one.
    recordSpeedAttempt(inTime);
    renderDrillStats();
  } else {
    // Grade for spaced repetition + per-motif tracking. A clean first-try solve
    // with no move shown passes; tries or hint stage 2 lapse it back sooner.
    gradeSrs(puzzle.id, firstTry);
    recordMotif(puzzle.pattern, firstTry);
    if (!firstTry && drill.requeued && !drill.requeued.has(puzzle.id)) {
      drill.requeued.add(puzzle.id);
      drill.queue.push(puzzle); // see it again before the session ends
    }
  }
  renderDrillStats();
  // chess.com's solved badge on the final move of the line.
  const last = puzzle.better.at(-1);
  drill.board.setShapes([{ orig: last.uci.slice(2, 4), customSvg: { html: BoardCore.BADGE_SOLVED } }]);
  sfx('solve');
  if (puzzle.played?.san) {
    $('drill-answer-title').textContent = `${puzzle.better[0].san} instead of ${puzzle.played.san}`;
    $('drill-game-link').textContent = 'Chess.com game ↗';
  } else {
    $('drill-answer-title').textContent = `${puzzle.better[0].san} was the move`;
    $('drill-game-link').textContent = 'Open on lichess ↗';
  }
  // ONE human takeaway. The "it cost about a pawn or two" line is gone — the
  // title already names the move you played, and pawn-value words were the
  // metric Jerry said does not help.
  $('drill-answer-copy').textContent = puzzle.takeaway || puzzle.explanation;
  $('drill-game-link').href = puzzle.game;
  $('drill-answer').hidden = false;
  // The line now ends somewhere real, so say where: mate delivered, material
  // collected, or the position settled.
  $('drill-question').textContent = puzzle.end?.text || 'Line complete — here is the point:';
  $('drill-verdict').textContent = firstTry
    ? 'Solved first try.'
    : 'Solved with help — it will come back around.';
  $('drill-verdict').className = 'drill-verdict good';
  $('drill-next').textContent = 'Next →';
  $('drill-next').classList.add('primary-action');
  $('drill-next').classList.remove('drill-secondary');
}

// After a correct move: the opponent's reply animates in, then YOU play the
// next move of the line yourself (chess.com's puzzle model — no auto-walk).
// The remaining legal map is just that move, so finding the right PIECE is
// still on you; wrong squares simply don't respond.
function continueDrillLine() {
  const puzzle = drill.puzzle;
  const steps = puzzle.better;
  if (drill.lineIndex >= steps.length) {
    finishDrillLine();
    return;
  }
  const reply = steps[drill.lineIndex];
  drill.board.set({ fen: reply.fenAfter, lastMove: uciSquares(reply.uci), movable: drillMovable(puzzle, NO_MOVES) });
  moveSfx(reply.san);
  $('drill-board').dataset.fen = reply.fenAfter;
  $('drill-verdict').textContent = reply.caption;
  $('drill-verdict').className = 'drill-verdict';
  drill.lineIndex += 1;
  if (drill.lineIndex >= steps.length) {
    drill.timer = setTimeout(finishDrillLine, 650);
    return;
  }
  drill.timer = setTimeout(() => {
    if (drill.phase !== 'line' || drill.puzzle !== puzzle) return;
    // You play the moves that matter; a long material tail replays itself so
    // the line still finishes on the board instead of stopping mid-air.
    if (drill.lineIndex >= (puzzle.solvePlies || steps.length)) {
      $('drill-question').textContent = 'Watch it finish:';
      autoplayLineTail();
      return;
    }
    promptLineStep();
  }, 500);
}

function autoplayLineTail() {
  const puzzle = drill.puzzle;
  const steps = puzzle.better;
  if (drill.lineIndex >= steps.length) {
    finishDrillLine();
    return;
  }
  const step = steps[drill.lineIndex];
  drill.board.set({ fen: step.fenAfter, lastMove: uciSquares(step.uci), movable: drillMovable(puzzle, NO_MOVES) });
  moveSfx(step.san);
  $('drill-board').dataset.fen = step.fenAfter;
  $('drill-verdict').textContent = step.caption;
  $('drill-verdict').className = 'drill-verdict';
  drill.lineIndex += 1;
  drill.timer = setTimeout(() => {
    if (drill.phase !== 'line' || drill.puzzle !== puzzle) return;
    autoplayLineTail();
  }, 560);
}

function promptLineStep() {
  const puzzle = drill.puzzle;
  const step = puzzle.better[drill.lineIndex];
  // Full legality at every solver turn (any piece answers; a wrong move
  // flashes red like the first move). Falls back to the single line move for
  // pre-refresh data without per-step maps.
  const map = step.dests
    ? drillDests(step)
    : new Map([[step.uci.slice(0, 2), [step.uci.slice(2, 4)]]]);
  drill.board.set({ turnColor: puzzle.side, movable: drillMovable(puzzle, map) });
  drill.hintStage = 0;
  $('drill-hint').textContent = 'Hint';
  $('drill-hint').disabled = false;
  // On a mate line, name the target: you are finishing a mate, not guessing.
  $('drill-question').textContent = puzzle.end?.kind === 'mate'
    ? 'Mate is forced — finish it.'
    : 'Keep going — find the follow-up.';
}

// The board position at the current line prompt (for wrong-move snap-back).
function linePromptFen() {
  const puzzle = drill.puzzle;
  return drill.lineIndex >= 1 ? puzzle.better[drill.lineIndex - 1].fenAfter : puzzle.fen;
}

function snapBackDrill() {
  clearTimeout(drill.wrongTimer);
  const puzzle = drill.puzzle;
  if (!puzzle || drill.phase !== 'solving') return;
  drill.board.setShapes([]);
  drill.board.set({
    fen: puzzle.fen,
    turnColor: puzzle.side,
    lastMove: puzzle.prev ? uciSquares(puzzle.prev.uci) : undefined,
    movable: drillMovable(puzzle, drillDests(puzzle))
  });
  $('drill-retry').hidden = true;
}

function onDrillMove(orig, dest) {
  if (!drill.puzzle) return;
  const puzzle = drill.puzzle;
  const attempt = `${orig}${dest}`;
  // Mid-line: any legal move plays; only the line move advances. A wrong one
  // gets the same red flash + snap-back as the first move.
  if (drill.phase === 'line') {
    const step = puzzle.better[drill.lineIndex];
    if (!step) return;
    if (attempt !== step.uci.slice(0, 4)) {
      drill.tries += 1;
      sfx('wrong');
      drill.board.set({ movable: drillMovable(puzzle, NO_MOVES) });
      drill.board.setShapes([
        { orig, customSvg: { html: BoardCore.SQ_RED } },
        { orig: dest, customSvg: { html: BoardCore.SQ_RED + BoardCore.BADGE_WRONG } }
      ]);
      $('drill-verdict').textContent = 'Not that one — stay in the line.';
      $('drill-verdict').className = 'drill-verdict bad';
      drill.wrongTimer = setTimeout(() => {
        if (drill.phase !== 'line' || drill.puzzle !== puzzle) return;
        drill.board.setShapes([]);
        drill.board.set({ fen: linePromptFen(), turnColor: puzzle.side, lastMove: undefined });
        promptLineStep();
      }, 900);
      return;
    }
    clearTimeout(drill.timer);
    moveSfx(step.san);
    $('drill-verdict').textContent = step.caption;
    $('drill-verdict').className = 'drill-verdict good';
    drill.board.set({ movable: drillMovable(puzzle, NO_MOVES) });
    drill.lineIndex += 1;
    drill.timer = setTimeout(() => {
      if (drill.phase !== 'line' || drill.puzzle !== puzzle) return;
      continueDrillLine();
    }, 400);
    return;
  }
  if (drill.phase !== 'solving') return;
  const answer = puzzle.better[0].uci.slice(0, 4);
  if (attempt === answer) {
    moveSfx(puzzle.better[0].san);
    recordDrillSolve();
    $('drill-verdict').textContent = puzzle.better[0].caption || 'Yes.';
    $('drill-verdict').className = 'drill-verdict good';
    $('drill-retry').hidden = true;
    renderDrillStats();
    drill.phase = 'line';
    drill.lineIndex = 1;
    drill.board.set({ movable: drillMovable(puzzle, NO_MOVES) });
    drill.timer = setTimeout(() => {
      if (drill.phase !== 'line' || drill.puzzle !== puzzle) return;
      continueDrillLine();
    }, 400);
    return;
  }
  // Legal but wrong — chess.com's wrong-move state: the move stays on the
  // board with red from/to squares and a corner ✗ badge, input pauses, and
  // Retry appears. It snaps back on Retry or by itself after the flash.
  drill.tries += 1;
  sfx('wrong');
  drill.board.set({ movable: drillMovable(puzzle, NO_MOVES) });
  drill.board.setShapes([
    { orig, customSvg: { html: BoardCore.SQ_RED } },
    { orig: dest, customSvg: { html: BoardCore.SQ_RED + BoardCore.BADGE_WRONG } }
  ]);
  const playedGameMove = attempt === puzzle.played.uci.slice(0, 4);
  $('drill-verdict').textContent = playedGameMove
    ? (puzzle.threat
      ? `That is the game move — ${puzzle.threat}. Find the better one.`
      : 'That is the game move — find the better one.')
    : 'Not it — look again.';
  $('drill-verdict').className = 'drill-verdict bad';
  $('drill-retry').hidden = false;
  drill.wrongTimer = setTimeout(snapBackDrill, 1400);
}

// chess.com's two-stage hint: first the piece (teal square), then the move
// (orange arrow). You still play the move yourself; seeing it grades as a
// lapse for spaced repetition, the nudge alone stays free.
function drillHint() {
  if (!drill.puzzle || (drill.phase !== 'solving' && drill.phase !== 'line')) return;
  if (drill.phase === 'solving') snapBackDrill();
  const answer = drill.phase === 'line' ? drill.puzzle.better[drill.lineIndex] : drill.puzzle.better[0];
  if (!answer) return;
  if (drill.hintStage === 0) {
    drill.hintStage = 1;
    drill.board.setShapes([{ orig: answer.uci.slice(0, 2), customSvg: { html: BoardCore.SQ_TEAL } }]);
    $('drill-hint').textContent = 'Show move';
    return;
  }
  if (drill.hintStage === 1) {
    drill.hintStage = 2;
    drill.tries += 1;
    drill.board.setShapes([
      { orig: answer.uci.slice(0, 2), customSvg: { html: BoardCore.SQ_TEAL } },
      { orig: answer.uci.slice(0, 2), dest: answer.uci.slice(2, 4), brush: 'hint' }
    ]);
    $('drill-hint').textContent = 'Move shown';
    $('drill-hint').disabled = true;
  }
}

function renderDrill() {
  renderDrillFilters();
  startDrillSession();
  loadDrillPuzzle();
}

function startDrillSession() {
  drill.queue = drillQueue();
  drill.index = 0;
  drill.requeued = new Set();
}

// Step forward/back through the current line; past the edge, the SAME control
// crosses into the previous/next move — one bar drives the whole review
// (Jerry: "there should only be one bar on top to click through the moves").
function stepBy(delta) {
  if (!activeItem || !frames.length) return;
  const next = stepIndex + delta;
  const items = itemsForView();
  if (next < 0) {
    if (activeIndex > 0) {
      loadItem(activeIndex - 1);
      stepIndex = frames.length - 1;
      renderFrame();
    }
    return;
  }
  if (next > frames.length - 1) {
    if (activeIndex < items.length - 1) {
      loadItem(activeIndex + 1);
      stepIndex = 0;
      renderFrame();
    }
    return;
  }
  stepIndex = next;
  renderFrame();
}

function itemBy(delta) {
  const items = itemsForView();
  if (!items.length) return;
  const next = Math.max(0, Math.min(items.length - 1, activeIndex + delta));
  if (next === activeIndex) return;
  loadItem(next);
}

// --- Move-by-move game review -----------------------------------------------
const REVIEW_CLASS = {
  best: { label: 'Best', tone: 'good' },
  excellent: { label: 'Excellent', tone: 'good' },
  good: { label: 'Good', tone: 'good' },
  inaccuracy: { label: 'Inaccuracy', tone: 'warn', mark: '?!' },
  mistake: { label: 'Mistake', tone: 'bad', mark: '?' },
  blunder: { label: 'Blunder', tone: 'bad', mark: '??' }
};
const reviewById = new Map(GAME_REVIEW.games.map((game) => [game.id, game]));
const review = { board: null, game: null, index: 0 };

function reviewEval(cp) {
  if (cp >= 99000) return 'winning (mate)';
  if (cp <= -99000) return 'lost (mated)';
  return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
}

function ensureReviewBoard() {
  if (review.board) return;
  review.board = BoardCore.makeBoard($('review-board'), { viewOnly: true });
}

function renderReviewMoves() {
  const game = review.game;
  $('review-moves').innerHTML = game.moves.map((move, index) => {
    const info = REVIEW_CLASS[move.klass];
    const label = game.color === 'white' ? `${move.n}.` : `${move.n}…`;
    return `<li data-review-index="${index}" class="tone-${info.tone}"><span class="rm-no">${label}</span><span class="rm-san">${escapeHtml(move.san)}</span><span class="rm-badge">${info.mark || '·'}</span></li>`;
  }).join('');
}

function showReviewMove(index) {
  const game = review.game;
  review.index = Math.max(0, Math.min(game.moves.length - 1, index));
  const move = game.moves[review.index];
  const info = REVIEW_CLASS[move.klass];
  ensureReviewBoard();
  const flipped = review.board.state.orientation !== game.color;
  review.board.set({ fen: move.fen, orientation: game.color, lastMove: uciSquares(move.uci) });
  BoardCore.setCoordsOrientation(review.board.coordsEl, game.color);
  const brush = info.tone === 'bad' ? 'red' : (info.tone === 'warn' ? 'yellow' : 'green');
  // ONE arrow only — two arrows on the same board read as a bug (Jerry).
  const shapes = [{ orig: move.uci.slice(0, 2), dest: move.uci.slice(2, 4), brush }];
  const walkerToken = (review.paintToken = (review.paintToken || 0) + 1);
  const paintWalker = () => {
    if (walkerToken === review.paintToken && !$('review-walker').hidden) review.board.setShapes(shapes);
  };
  if (flipped) remeasureBoards();
  requestAnimationFrame(paintWalker);
  setTimeout(paintWalker, 260);
  const label = game.color === 'white' ? `${move.n}.` : `${move.n}…`;
  // One line of facts, then ONE human sentence (the episode takeaway) for the
  // moves that actually went wrong — no stacked eval prose.
  const better = !move.t && move.best ? ` · better: <strong>${escapeHtml(move.best)}</strong>` : '';
  const note = move.t ? `<span class="review-takeaway">${escapeHtml(move.t)}</span>` : '';
  $('review-current').innerHTML = `<span class="review-badge tone-${info.tone}">${info.label}${info.mark ? ` ${info.mark}` : ''}</span> <strong>${label} ${escapeHtml(move.san)}</strong>${better}${note}`;
  $('review-progress').textContent = `${review.index + 1} / ${game.moves.length}`;
  $('review-prev').disabled = review.index <= 0;
  $('review-next').disabled = review.index >= game.moves.length - 1;
  const jump = $('review-jump');
  const nextSlip = game.moves.findIndex((mv, i) => i > review.index && ['inaccuracy', 'mistake', 'blunder'].includes(mv.klass));
  if (nextSlip >= 0) {
    const slip = game.moves[nextSlip];
    jump.hidden = false;
    jump.dataset.target = String(nextSlip);
    jump.textContent = `${review.index === 0 ? 'Your first slip' : 'Next slip'} → ${game.color === 'white' ? `${slip.n}.` : `${slip.n}…`} ${slip.san}`;
  } else {
    jump.hidden = true;
  }
  const list = $('review-moves');
  list.querySelectorAll('li').forEach((li, i) => li.classList.toggle('active', i === review.index));
  const active = list.querySelector('li.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function openReview(gameId) {
  const game = reviewById.get(gameId);
  if (!game || !game.moves.length) return;
  review.game = game;
  $('review-games').hidden = true;
  $('review-walker').hidden = false;
  remeasureBoards();
  $('review-title').textContent = `vs ${game.opponent}`;
  const acc = typeof game.accuracy === 'number' ? ` · ${game.accuracy}% accuracy` : '';
  $('review-scope').textContent = `${game.color === 'white' ? 'White' : 'Black'} · ${shortDateLabel(game.date)} · ${game.result}, rated ${game.rating}${acc}`;
  $('review-game-link').href = game.url;
  renderReviewMoves();
  showReviewMove(0);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function closeReview() {
  $('review-walker').hidden = true;
  $('review-games').hidden = false;
}

// When set, the By-game list narrows to these ids (an opening family or the
// newest sitting) with a one-tap clear chip. Cleared on manual tab entry.
let reviewFilter = null;

function renderGameList() {
  const chip = $('review-filter-chip');
  const rows = reviewFilter
    ? REPORT.games.filter((game) => reviewFilter.ids.has(game.id))
    : REPORT.games;
  if (reviewFilter) {
    chip.hidden = false;
    chip.innerHTML = `${escapeHtml(reviewFilter.label)} · ${rows.length} game${rows.length === 1 ? '' : 's'} <span aria-hidden="true">×</span><span class="visually-hidden"> — clear filter</span>`;
  } else {
    chip.hidden = true;
  }
  $('game-audit-count').textContent = reviewFilter
    ? `showing ${rows.length} of ${REPORT.gamesReviewed} games · newest first`
    : `${REPORT.gamesReviewed}/${REPORT.gamesReviewed} games · ${REPORT.seriousEpisodes} episodes · newest first`;
  $('game-list').innerHTML = rows.slice().reverse().map((game) => {
    const result = game.result === 'win' ? 'W' : (game.result === 'loss' ? 'L' : 'D');
    const accuracy = typeof game.accuracy === 'number' ? ` · <span class="game-accuracy">${game.accuracy}% accuracy</span>` : '';
    return `<article class="game-row">
      <div class="game-result ${escapeHtml(game.result)}">${result}</div>
      <div><p><strong>vs ${escapeHtml(game.opponent)}</strong> · ${escapeHtml(game.color)} · ${game.rating}${accuracy}</p><p>${escapeHtml(game.verdict)}</p><p class="micro">What worked: ${escapeHtml(game.positive)}</p></div>
      <button type="button" class="game-review-open" data-review-game="${escapeHtml(game.id)}" aria-label="Review your moves in the game against ${escapeHtml(game.opponent)}">Review</button>
    </article>`;
  }).join('');
}

// Boards cache their pixel bounds; after unhiding one, ask every board to
// re-measure. (chessground listens for this event on document.body. Never use
// api.redrawAll here — it rebuilds the wrap and orphans the old svg layers.)
function remeasureBoards() {
  document.body.dispatchEvent(new Event('chessground.resize'));
}

function showCoach(mode) {
  view = mode;
  document.documentElement.dataset.coach = mode;
  $('coach').hidden = false;
  remeasureBoards();
  $('moves-filters').hidden = true;
  $('coach-topbar').hidden = false;
  renderCoachTopbar();
  activeIndex = 0;
  loadItem(0);
}

function renderCoachTopbar() {
  const bar = $('coach-topbar');
  if (tab === 'drill') {
    bar.innerHTML = '<button type="button" class="chip" data-coach-back="drill">\u2190 Back to puzzles</button>';
    return;
  }
  // Same control grammar as Drill: one segmented pair + one native picker.
  let picker = '';
  if (reviewFace === 'best') {
    const counts = new Map();
    for (const item of MOVES_CORPUS) counts.set(item.klass, (counts.get(item.klass) || 0) + 1);
    const option = (id, label) =>
      `<option value="${escapeHtml(id)}"${id === movesFilter ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    // First option, because it is the one with a finish line: a handful of
    // decisions from the games just played, not 43 cards with no end.
    // Short label on purpose: WebKit ignores text-overflow on a closed <select>,
    // so the control hard-clips instead of ellipsizing and "Costliest lately"
    // rendered as "Costliest latel" with the count cut off. The card's own meta
    // line already carries the dates, so the scope word is enough.
    const costly = costliestRecent();
    let options = costly.length
      ? option('costly', `Recent · ${costly.length}`)
      : '';
    options += option('all', `All · ${MOVES_CORPUS.length}`);
    for (const key of SCALE_ORDER) {
      if (!counts.has(key)) continue;
      const info = CLASS_INFO[key];
      options += option(key, `${info.label}${info.symbol ? ` ${info.symbol}` : ''} · ${counts.get(key)}`);
    }
    picker = `<label class="drill-pick"><span class="visually-hidden">Filter by grade</span><select id="review-filter-select">${options}</select></label>`;
  }
  bar.innerHTML = `
    <div class="drill-seg" role="group" aria-label="Review mode">
      <button type="button" data-review-face="best" aria-pressed="${reviewFace === 'best'}">Moves</button>
      <button type="button" data-review-face="games" aria-pressed="${reviewFace === 'games'}">By game</button>
    </div>${picker}`;
  const select = document.getElementById('review-filter-select');
  if (select) {
    select.addEventListener('change', () => {
      movesFilter = select.value;
      activeIndex = 0;
      loadItem(0);
      renderCoachTopbar();
    });
  }
}

function setView(nextTab) {
  tab = resolveTab(nextTab);
  $('app-heading').textContent = tab === 'summary' ? PROFILE.heading : PROFILE.playerName;
  document.documentElement.dataset.view = tab;
  document.querySelectorAll('.tabs [data-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === tab));
  });
  history.replaceState(null, '', `${location.pathname}${location.search}#${tab}`);
  window.scrollTo(0, 0);
  clearTimeout(drill.timer);
  clearTimeout(drill.animTimer);
  clearTimeout(drill.wrongTimer);
  // A chessground board that collapses to 0x0 recomputes its arrows to NaN —
  // clear shapes on everything about to be hidden; renderers re-add their own.
  board.setShapes([]);
  if (drill.board) drill.board.setShapes([]);
  if (review.board) review.board.setShapes([]);
  delete document.documentElement.dataset.coach;
  $('coach').hidden = true;
  $('coach-topbar').hidden = true;
  $('progress-view').hidden = true;
  $('drill-view').hidden = true;
  $('review-games').hidden = true;
  $('review-walker').hidden = true;
  if (tab === 'summary') {
    $('progress-view').hidden = false;
    renderProgress();
    return;
  }
  if (tab === 'drill') {
    if (drillFace === 'examples') {
      showCoach('patterns');
    } else {
      $('drill-view').hidden = false;
      renderDrill();
    }
    return;
  }
  // review tab
  if (reviewFace === 'best') {
    showCoach('moves');
  } else {
    $('coach-topbar').hidden = false;
    renderCoachTopbar();
    $('review-games').hidden = false;
    renderGameList();
  }
}

document.querySelectorAll('.tabs [data-view]').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.view === 'review') reviewFilter = null;
  setView(button.dataset.view);
}));
// Mistakes card + phase strip: pattern rows, nuance chips and phase chips all
// carry their query on the element, so one delegated handler covers every
// "skip straight to this and grind it" tap.
for (const hostId of ['summary-mistakes', 'phase-strip']) {
  $(hostId).addEventListener('click', (event) => {
    const button = event.target.closest('[data-drill-pattern],[data-drill-sub],[data-drill-phase]');
    if (!button) return;
    openDrill({
      pattern: button.dataset.drillPattern || 'all',
      sub: button.dataset.drillSub || null,
      phase: button.dataset.drillPhase || null,
    });
  });
}
function applyDrillFilter(id) {
  if (id === 'op') return; // the active opening scope itself
  if (!id) return;
  drill.opening = null; // picking any pattern clears an opening scope
  if (id.startsWith('sub:')) {
    drill.sub = id.slice(4);
    drill.phaseOf = null;
    drill.filter = 'all';
  } else if (id.startsWith('phase:')) {
    drill.phaseOf = id.slice(6);
    drill.sub = null;
    drill.filter = 'all';
  } else {
    drill.filter = id;
    drill.sub = null;
    drill.phaseOf = null;
  }
  renderDrillFilters();
  startDrillSession();
  loadDrillPuzzle();
}

// The one door from the Summary into Drill: a pattern row, a nuance chip, a
// phase chip and an opening row all come through here, so a tap always lands
// on the first position of exactly what was tapped.
function openDrill({ pattern = 'all', sub = null, phase = null, opening = null } = {}) {
  drillFace = 'puzzles';
  drill.source = 'mine';
  drill.filter = pattern || 'all';
  drill.sub = sub;
  drill.phaseOf = phase;
  drill.opening = opening;
  setView('drill');
}
$('drill-filters').addEventListener('click', (event) => {
  const source = event.target.closest('[data-drill-source]');
  if (source && source.dataset.drillSource !== drill.source) {
    drill.source = source.dataset.drillSource;
    drill.filter = 'all';
    drill.sub = null;
    drill.phaseOf = null;
    drill.opening = null;
    renderDrillFilters();
    startDrillSession();
    loadDrillPuzzle();
    return;
  }
  const button = event.target.closest('[data-drill-filter]');
  if (button) applyDrillFilter(button.dataset.drillFilter);
});
for (const hostId of ['drill-weakspots', 'drill-scope']) {
  $(hostId).addEventListener('click', (event) => {
    const button = event.target.closest('[data-drill-filter]');
    if (button) applyDrillFilter(button.dataset.drillFilter);
  });
}
$('drill-next').addEventListener('click', () => {
  drill.index += 1;
  loadDrillPuzzle();
});
$('drill-hint').addEventListener('click', drillHint);
$('drill-retry').addEventListener('click', snapBackDrill);

$('coach-topbar').addEventListener('click', (event) => {
  const back = event.target.closest('[data-coach-back]');
  if (back) {
    drillFace = 'puzzles';
    setView('drill');
    return;
  }
  const face = event.target.closest('[data-review-face]');
  if (face && face.dataset.reviewFace !== reviewFace) {
    reviewFace = face.dataset.reviewFace;
    setView('review');
  }
});
$('game-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-review-game]');
  if (button) openReview(button.dataset.reviewGame);
});
$('review-back').addEventListener('click', closeReview);
$('review-filter-chip').addEventListener('click', () => {
  reviewFilter = null;
  renderGameList();
});
$('latest-review').addEventListener('click', () => {
  // The same window the card reads from — not the last sitting, which can be
  // two games.
  const window_ = recentWindow();
  reviewFilter = window_
    ? { ids: window_.ids, label: `Last ${window_.games.length} games` }
    : null;
  reviewFace = 'games';
  setView('review');
});
// Openings rows: tap an opening -> DRILL its mistakes with the correct moves
// (Jerry: "i just want to see whats the mistake im making on that opening and
// why … or just show the correct moves" — not a list of old games).
$('progress-view').addEventListener('click', (event) => {
  const opening = event.target.closest('[data-open-opening]');
  if (!opening) return;
  openDrill({ opening: opening.dataset.openOpening, sub: opening.dataset.openSub || null });
});
$('review-jump').addEventListener('click', () => showReviewMove(Number($('review-jump').dataset.target)));
$('review-prev').addEventListener('click', () => showReviewMove(review.index - 1));
$('review-next').addEventListener('click', () => showReviewMove(review.index + 1));
$('review-moves').addEventListener('click', (event) => {
  const button = event.target.closest('[data-review-index]');
  if (button) showReviewMove(Number(button.dataset.reviewIndex));
});
$('step-prev').addEventListener('click', () => stepBy(-1));
$('step-next').addEventListener('click', () => stepBy(1));

// Keyboard: ← / → step through the line; ↑ / ↓ (or [ / ]) change the move/line.
document.addEventListener('keydown', (event) => {
  if ($('coach').hidden || event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = (event.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const actions = {
    ArrowLeft: () => stepBy(-1),
    ArrowRight: () => stepBy(1),
    ArrowUp: () => itemBy(-1),
    ArrowDown: () => itemBy(1),
    '[': () => itemBy(-1),
    ']': () => itemBy(1),
  };
  if (actions[event.key]) {
    actions[event.key]();
    event.preventDefault();
  }
});

window.addEventListener('hashchange', () => {
  const nextTab = resolveTab(location.hash.slice(1));
  if (TABS.includes(nextTab) && nextTab !== tab) setView(nextTab);
});

// "make sure its a full PWA not jsut link" — when opened as a plain Safari
// tab on iOS, offer the one action that turns it into an app. One line,
// dismissible forever, never shown inside the installed app.
{
  const hint = $('install-hint');
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (standalone) document.documentElement.dataset.standalone = '1';
  const dismissed = (() => { try { return localStorage.getItem('coach-install-hint') === 'no'; } catch { return false; } })();
  if (hint && isIOS && !standalone && !dismissed) {
    hint.hidden = false;
    $('install-hint-close').addEventListener('click', () => {
      hint.hidden = true;
      try { localStorage.setItem('coach-install-hint', 'no'); } catch { /* private mode */ }
    });
  }
}

$('app-heading').textContent = PROFILE.heading;
$('progress-view').setAttribute('aria-label', `${PROFILE.playerName} summary`);
const switchLink = $('profile-switch');
const compareLink = $('compare-tab');
const otherName = PROFILE.other.label.replace('\u21c4', '').trim();
{
  switchLink.innerHTML = `<span class="switch-glyph" aria-hidden="true">\u21c4</span><span class="switch-name">\u00a0${escapeHtml(otherName)}</span>`;
}
switchLink.href = PROFILE.other.href;
switchLink.setAttribute('aria-label', `Switch to ${otherName}'s coach`);
compareLink.href = `/chess-league/?coach=${encodeURIComponent(PROFILE.id)}`;
compareLink.setAttribute('aria-label', `Compare ${PROFILE.playerName} with friends`);
// One player's coach, one name in the masthead. The other-player switch and
// the Compare tab are both league chrome \u2014 they go together (see
// LEAGUE_MIN_PLAYERS) so a two-player field cannot make this look like
// somebody else's app.
if (!leagueIsUseful()) {
  switchLink.hidden = true;
  compareLink.hidden = true;
}
$('masthead-stats').textContent = `${REPORT.gamesReviewed} games \u00b7 ${REPORT.movesReviewed.toLocaleString()} decisions \u00b7 ${REPORT.seriousEpisodes} coaching episodes \u00b7 through ${shortDateLabel(REPORT.games.at(-1).date)}`;
setView(tab);
document.documentElement.dataset.gamesReviewed = String(REPORT.gamesReviewed);
document.documentElement.dataset.brilliantCandidates = String(HIGHLIGHTS.brilliantCount);
document.documentElement.dataset.selectedBlunders = String(HIGHLIGHTS.selectedBlunderCount);
document.documentElement.dataset.schema = `${REPORT.schema}+${HIGHLIGHTS.schema}`;
