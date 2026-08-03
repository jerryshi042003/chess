// Functional coverage for the unified London coach (Chromium).
// Board geometry / one-screen checks live in board-visual.spec.js (WebKit).
// Tabs: Summary · Drill · Review — the board follows the chess.com interaction
// spec in wisdom/chess-coach/docs/ux-spec.md (dots, wrong-flash, hint stages).

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { HIGHLIGHT_REPORT as highlights } from '../../data/highlights.js';
import { EPISODE_REPORT as report } from '../../data/episodes.js';
import { PUZZLE_SET as puzzles } from '../../data/puzzles.js';
import { FRESH_SET as fresh } from '../../data/fresh.js';

const FIRST = puzzles.puzzles[0];
const leagueSource = fs.readFileSync(
  new URL('../../../chess-league/data.js', import.meta.url),
  'utf8'
);
const league = JSON.parse(
  leagueSource.slice(leagueSource.indexOf('{'), leagueSource.lastIndexOf(';'))
);
const leagueLondon = league.players.find((player) => player.name === 'London');
const leagueJerry = league.players.find((player) => player.name === 'Jerry');
const leagueGap = Math.abs(leagueLondon.blunderPer100 - leagueJerry.blunderPer100).toFixed(1);

// The corpus refreshes nightly — expectations derive from the data, so the
// suite validates display-vs-data instead of pinning last week's numbers.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (value) => {
  const [, month, day] = String(value).split('.').map(Number);
  return `${MONTHS[month - 1]} ${day}`;
};
const phasePct = (() => {
  const counts = { opening: 0, middlegame: 0, endgame: 0 };
  for (const puzzle of puzzles.puzzles) counts[puzzle.phase] += 1;
  const total = counts.opening + counts.middlegame + counts.endgame;
  const pct = (n) => Math.round((n / total) * 100);
  return `opening ${pct(counts.opening)}% · middlegame ${pct(counts.middlegame)}% · endgame ${pct(counts.endgame)}%`;
})();
const worstOpening = (() => {
  const white = report.openings.white.mostLosses && { ...report.openings.white.mostLosses, colorName: 'White' };
  const black = report.openings.black.mostLosses && { ...report.openings.black.mostLosses, colorName: 'Black' };
  return [white, black].filter(Boolean).sort((a, b) => b.losses - a.losses)[0];
})();

function collectFailures(page) {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
  return failures;
}

async function noHorizontalOverflow(page) {
  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(geometry.scrollWidth, 'no horizontal overflow').toBeLessThanOrEqual(geometry.innerWidth + 1);
}

async function clickSquare(page, boardSelector, square, orientation = 'white') {
  const box = await page.locator(`${boardSelector} cg-board`).boundingBox();
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;
  await page.mouse.click(box.x + (col + 0.5) * (box.width / 8), box.y + (row + 0.5) * (box.height / 8));
}

async function playLine(page, line, side) {
  for (let i = 0; i < line.length; i += 2) {
    await clickSquare(page, '#drill-board', line[i].slice(0, 2), side);
    await page.waitForTimeout(120);
    await clickSquare(page, '#drill-board', line[i].slice(2, 4), side);
    await page.waitForTimeout(1500); // their reply animates, next prompt opens
  }
}

// The load animation replays the opponent's move; the yellow from/to marks
// arriving is the signal that the real position + legal moves are live.
async function waitForDrillReady(page) {
  await expect(page.locator('#drill-board cg-board')).toBeVisible();
  await expect(page.locator('#drill-board square.last-move')).toHaveCount(2, { timeout: 5000 });
}

test('three coach views plus persistent Compare; Summary is the compact default', async ({ page }) => {
  const failures = collectFailures(page);
  await page.goto('/chess/londonsacrifice/');
  await expect(page.locator('.tabs [data-view]')).toHaveCount(3);
  await expect(page.locator('.tabs > *')).toHaveText(['Summary', 'Drill', 'Review', 'Compare']);
  await expect(page.locator('.tabs [data-view="summary"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#app-heading')).toHaveText('London');
  await expect(page.locator('.profile-switch')).toHaveText('⇄ Jerry');
  await expect(page.locator('.profile-switch')).toHaveAttribute('href', '/chess/#summary');
  await expect(page.locator('.profile-switch')).toHaveAttribute('aria-label', "Switch to Jerry's coach");
  await expect(page.locator('#compare-tab')).toHaveAttribute('href', '/chess/chess-league/?coach=londonsacrifice');
  await expect(page.locator('#compare-tab')).toHaveAttribute('aria-label', 'Compare London with friends');
  await expect(page.locator('.league-link')).toHaveCount(0);
  await expect(page.locator('#masthead-stats')).toHaveText(
    `${report.gamesReviewed} games · ${report.movesReviewed.toLocaleString('en-US')} decisions · ${report.seriousEpisodes} coaching episodes · through ${shortDate(report.games.at(-1).date)}`);

  // Profile order: what to train first, then the recent window; trend and
  // rhythm are collapsed at the bottom.
  const order = await page.locator('#progress-view > *').evaluateAll(
    (nodes) => nodes.map((node) => node.className.split(' ')[0]));
  expect(order).toEqual(['mistake-card', 'latest-card', 'opening-card', 'league-preview-card', 'minor-cards']);
  await expect(page.locator('.league-preview-row')).toHaveCount(0);
  await expect(page.locator('#league-preview-action')).toHaveAttribute('href', '/chess/chess-league/?coach=londonsacrifice');
  await expect(page.locator('#progress-view > :first-child')).toHaveClass(/mistake-card/u);
  await expect(page.locator('#progress-view')).toHaveAttribute('aria-label', 'London summary');

  // Newest games reads a window big enough to mean something, not one sitting.
  const recentSize = Math.min(report.games.length, 20);
  const recent = report.games.slice(-recentSize);
  await expect(page.locator('#latest-title')).toHaveText(
    `Last ${recentSize} games · ${shortDate(recent[0].date)}–${shortDate(recent.at(-1).date)}`);
  await expect(page.locator('#latest-answer')).toContainText(`across ${recentSize} games`);
  await expect(page.locator('#latest-sub')).toContainText('drillable positions');

  await expect(page.locator('#summary-mistakes .priority-row')).toHaveCount(6);
  // Nuance rows: every pattern names its concrete sub-mistakes with counts.
  const firstSubs = page.locator('#summary-mistakes .priority-row').first().locator('.sub-chip').first();
  await expect(firstSubs).toHaveText(`${report.patterns[0].breakdown[0].label} ×${report.patterns[0].breakdown[0].count}`);
  // The openings answer is corpus-honest: absolute losses + its basis.
  await expect(page.locator('#openings-answer')).toContainText('costs the most games');
  await expect(page.locator('#openings-answer')).toContainText(`all ${report.gamesReviewed} games analyzed`);
  await expect(page.locator('#openings-answer')).toContainText(
    `${worstOpening.losses} losses in ${worstOpening.games} games`);
  await expect(page.locator('#openings-white .opening-row').first()).toContainText(report.openings.white.top[0].name);
  await expect(page.locator('#openings-white .opening-row').first()).toContainText(`${report.openings.white.top[0].games} games`);
  // Phase rows: each stage of the game names its own failure modes.
  const phaseTop = report.phaseMistakes.slice().sort((a, b) => b.episodes - a.episodes)[0];
  await expect(page.locator('#phase-strip')).toContainText(phaseTop.phase);
  await expect(page.locator('.phase-row')).toHaveCount(3);
  await expect(page.locator('.phase-row').first()).toContainText(report.phaseMistakes.find((entry) => entry.phase === 'opening').rows[0].label);
  // Trend + rhythm live inside the collapsed disclosure at the bottom.
  await expect(page.locator('#change-title')).toBeHidden();
  await page.locator('.minor-summary').click();
  // Trend card: two scan-first signals with an explicit measure and baseline.
  const changeRows = await page.locator('.change-row').count();
  expect(changeRows).toBeLessThanOrEqual(2);
  await expect(page.locator('#change-title')).toHaveText('This week check');
  await expect(page.locator('#change-scope')).toContainText('Costly moments per game');
  await expect(page.locator('#change-scope')).toContainText('lower is better');
  await expect(page.locator('#change-before-label')).toHaveText('Before');
  await expect(page.locator('#change-now-label')).toHaveText('This week');
  await expect(page.locator('.change-state')).toContainText(['Better', 'Watch']);
  await expect(page.locator('#change-answer')).toContainText('Usually clean');
  await expect(page.locator('#change-answer')).toContainText(report.week.historicallyGood[0].name);
  await expect(page.locator('.session-row')).toHaveCount(7);
  // The stopping point is computed from the data, never a static chart tail.
  if (report.sittings.dropoff) {
    await expect(page.locator('#session-read')).toContainText(`stop after game ${report.sittings.dropoff.after}`);
    await expect(page.locator('#session-read')).toContainText(`${report.sittings.dropoff.rateBefore}%`);
  }
  // Openings are doors into DRILL: tap a family -> its mistakes, with the
  // correct moves, scoped in the one picker.
  const firstOpening = report.openings.white.top[0];
  const scoped = puzzles.puzzles.filter((p2) => p2.op === firstOpening.name).length;
  await page.locator('#openings-white button.opening-row').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-view', 'drill');
  await expect(page.locator('#drill-filter-select')).toHaveValue('op');
  await expect(page.locator('#drill-filter-select option[value="op"]')).toContainText(firstOpening.name);
  await expect(page.locator('#drill-stats')).toContainText(`of ${scoped}`);
  // Picking any pattern clears the opening scope.
  await page.locator('#drill-filter-select').selectOption('all');
  await expect(page.locator('#drill-stats')).toContainText(`of ${puzzles.count}`);
  await page.goto('/chess/londonsacrifice/');
  await noHorizontalOverflow(page);

  // Tapping a mistake opens the drill pre-filtered (shown in the picker).
  await page.locator('#summary-mistakes .priority-main').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-view', 'drill');
  await expect(page.locator('#drill-filter-select')).toHaveValue('piece_safety');
  expect(failures).toEqual([]);
});

test('the newest-games window opens exactly those games in Review', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chess/londonsacrifice/#summary');
  const size = Math.min(report.games.length, 20);
  await page.locator('#latest-review').click();
  await expect(page.locator('.tabs [data-view="review"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#review-filter-chip')).toContainText(`Last ${size} games · ${size} games`);
  await expect(page.locator('#game-list .game-row')).toHaveCount(size);
  await expect(page.locator('#game-audit-count')).toContainText(`showing ${size} of ${report.gamesReviewed} games`);
});

test('legacy hashes resolve into the three-tab shell', async ({ page }) => {
  for (const [hash, view] of [['moves', 'review'], ['brilliant', 'review'], ['blunders', 'review'],
    ['counts', 'review'], ['learn', 'drill'], ['patterns', 'drill'], ['progress', 'summary']]) {
    await page.goto(`/londonsacrifice/#${hash}`);
    await expect(page.locator('html')).toHaveAttribute('data-view', view);
  }
});

test('Drill: the opponent move animates in, the ask reads true, chips rank by priority', async ({ page }) => {
  const failures = collectFailures(page);
  await page.goto('/chess/londonsacrifice/#drill');
  await waitForDrillReady(page);
  // ONE context line above the board: opponent, result, and date. The new
  // queue deliberately takes one position per source game before returning.
  await expect(page.locator('#drill-gameline')).toContainText(`vs ${FIRST.opponent}`);
  await expect(page.locator('#drill-gameline')).toContainText(`move ${FIRST.moveNo}`);
  await expect(page.locator('#drill-gameline')).not.toContainText('from this game');
  await expect(page.locator('#drill-stats')).toContainText(`#1 of ${puzzles.count}`);
  await expect(page.locator('#drill-question')).toContainText('to move — ');
  // The old grey stack is gone for good.
  await expect(page.locator('#drill-context')).toHaveCount(0);
  await expect(page.locator('#drill-meta')).toHaveCount(0);

  // One decision row: segmented source pair + a single picker whose options
  // run All → ★ recommended → Punish → the rest.
  await expect(page.locator('.drill-seg button')).toHaveCount(2);
  await expect(page.locator('.drill-seg [data-drill-source="mine"]')).toHaveAttribute('aria-pressed', 'true');
  const optionValues = await page.locator('#drill-filter-select option').evaluateAll(
    (options) => options.map((option) => option.value));
  expect(optionValues[0]).toBe('all');
  expect(optionValues[1]).toBe(report.summary.focus.patternId);
  expect(optionValues[2]).toBe('punish');
  const recommended = await page.locator(`#drill-filter-select option[value="${report.summary.focus.patternId}"]`).textContent();
  expect(recommended).toContain('★');
  expect(recommended).toContain('recommended');

  // The study list is gone from Drill — the Summary owns priorities.
  await expect(page.locator('#study-details')).toHaveCount(0);
  expect(failures).toEqual([]);
});

test('Drill board: tapping a piece shows exactly the legal-move dots from the data', async ({ page }) => {
  const failures = collectFailures(page);
  await page.goto('/chess/londonsacrifice/#drill');
  await waitForDrillReady(page);
  const orig = FIRST.better[0].uci.slice(0, 2);
  const expected = (FIRST.dests[orig] || '').length / 2;
  expect(expected).toBeGreaterThan(0);
  await clickSquare(page, '#drill-board', orig, FIRST.side);
  await expect(page.locator('#drill-board square.selected')).toHaveCount(1);
  await expect(page.locator('#drill-board square.move-dest')).toHaveCount(expected);
  // Tapping an empty non-destination square clears the selection.
  const empty = (() => {
    const occupied = new Set();
    FIRST.fen.split(' ')[0].split('/chess/').forEach((row, r) => {
      let file = 0;
      for (const ch of row) {
        if (/\d/u.test(ch)) file += Number(ch);
        else { occupied.add('abcdefgh'[file] + String(8 - r)); file += 1; }
      }
    });
    const dests = new Set((FIRST.dests[orig] || '').match(/.{2}/gu) || []);
    for (const f of 'abcdefgh') {
      for (let r = 1; r <= 8; r += 1) {
        const sq = f + String(r);
        if (!occupied.has(sq) && !dests.has(sq)) return sq;
      }
    }
    return null;
  })();
  await clickSquare(page, '#drill-board', empty, FIRST.side);
  await expect(page.locator('#drill-board square.move-dest')).toHaveCount(0);
  expect(failures).toEqual([]);
});

test('Drill: wrong flashes red with a ✗ and Retry; hint stages teal then arrow; lapse requeues', async ({ page }) => {
  await page.goto('/chess/londonsacrifice/#drill');
  await waitForDrillReady(page);
  const answer = FIRST.better[0].uci.slice(0, 4);
  // Any legal move that is not the answer.
  let wrong = null;
  for (const [orig, str] of Object.entries(FIRST.dests)) {
    for (const dest of str.match(/.{2}/g) || []) {
      if (`${orig}${dest}` !== answer) { wrong = [orig, dest]; break; }
    }
    if (wrong) break;
  }
  await clickSquare(page, '#drill-board', wrong[0], FIRST.side);
  await clickSquare(page, '#drill-board', wrong[1], FIRST.side);
  // chess.com wrong-state: red from/to fills + corner ✗ badge, Retry offered.
  await expect(page.locator('#drill-board svg.cg-custom-svgs rect')).toHaveCount(2);
  await expect(page.locator('#drill-board svg.cg-custom-svgs circle')).toHaveCount(1);
  await expect(page.locator('#drill-verdict')).toHaveClass(/bad/);
  await expect(page.locator('#drill-retry')).toBeVisible();
  await page.locator('#drill-retry').click();
  await expect(page.locator('#drill-board svg.cg-custom-svgs rect')).toHaveCount(0);
  await expect(page.locator('#drill-board square.last-move')).toHaveCount(2);

  // Hint stage 1: teal square on the piece, button relabels.
  await page.locator('#drill-hint').click();
  await expect(page.locator('#drill-board svg.cg-custom-svgs rect')).toHaveCount(1);
  await expect(page.locator('#drill-hint')).toHaveText('Show move');
  // Hint stage 2: the move as an arrow; you still play it yourself.
  await page.locator('#drill-hint').click();
  await expect(page.locator('#drill-board svg.cg-shapes line')).toHaveCount(1);
  await expect(page.locator('#drill-hint')).toBeDisabled();

  // Step-play: you play the moves that matter yourself; anything past
  // solvePlies replays itself so the line still reaches its conclusion.
  await playLine(page, FIRST.better.slice(0, FIRST.solvePlies).map((step) => step.uci), FIRST.side);
  await expect(page.locator('#drill-verdict')).toContainText('come back around', { timeout: 20000 });
  await expect(page.locator('#drill-board svg.cg-custom-svgs path')).toHaveCount(1); // solved ✓ badge
  // The line ends somewhere real and the question line says where.
  await expect(page.locator('#drill-question')).toHaveText(FIRST.end.text);
  await expect(page.locator('#drill-answer')).toBeVisible();
  // ONE human takeaway, and no pawn-value tail underneath it.
  await expect(page.locator('#drill-answer-copy')).toHaveText(FIRST.takeaway);
  await expect(page.locator('#drill-answer-sub')).toHaveCount(0);
  await expect(page.locator('#drill-next')).toHaveText('Next →');
  await page.locator('#drill-next').click();
  // The lapse re-entered this session's queue.
  await expect(page.locator('#drill-stats')).toContainText(`#2 of ${puzzles.count + 1}`);
  const srs = await page.evaluate(() => localStorage.getItem('londonsacrifice-drill-srs-v1'));
  expect(srs).toContain('lapses');
});

test('mid-line: any piece answers with real moves; wrong ones flash and snap back', async ({ page }) => {
  // Pick a puzzle whose line has a second solver move with a full legal map.
  const target = puzzles.puzzles.find((p) => p.better.length >= 3 && p.better[2].dests
    && Object.keys(p.better[2].dests).length > 1);
  expect(target).toBeTruthy();
  const index = puzzles.puzzles.indexOf(target);
  await page.goto('/chess/londonsacrifice/#drill');
  await waitForDrillReady(page);
  // Skip to the target puzzle.
  for (let i = 0; i < index; i += 1) {
    await page.locator('#drill-next').click();
  }
  await expect(page.locator('#drill-stats')).toContainText(`#${index + 1} of `);
  await page.waitForTimeout(900);
  // Solve move 1, wait through the scripted reply.
  await clickSquare(page, '#drill-board', target.better[0].uci.slice(0, 2), target.side);
  await clickSquare(page, '#drill-board', target.better[0].uci.slice(2, 4), target.side);
  await expect(page.locator('#drill-question')).toContainText('Keep going', { timeout: 8000 });
  // A DIFFERENT piece with legal moves must show its dots (the round-8 bug:
  // only the solution piece responded).
  const lineUci = target.better[2].uci;
  const other = Object.keys(target.better[2].dests).find((orig) => orig !== lineUci.slice(0, 2));
  expect(other).toBeTruthy();
  await clickSquare(page, '#drill-board', other, target.side);
  await expect(page.locator('#drill-board square.move-dest')).not.toHaveCount(0);
  // Play a legal-but-wrong move: red flash, then snap back to the prompt.
  const wrongDest = (target.better[2].dests[other].match(/.{2}/g) || [])
    .find((dest) => `${other}${dest}` !== lineUci.slice(0, 4));
  await clickSquare(page, '#drill-board', wrongDest, target.side);
  await expect(page.locator('#drill-verdict')).toContainText('stay in the line');
  await expect(page.locator('#drill-question')).toContainText('Keep going', { timeout: 8000 });
});

test('one board implementation: drill, coach, and walker boards share theme, coords, and SIZE', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chess/londonsacrifice/#drill');
  await waitForDrillReady(page);
  const drillBg = await page.locator('#drill-board cg-board').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(drillBg).toContain('svg');
  await expect(page.locator('#drill-board .sq-coords .sqc')).toHaveCount(16);
  const drillW = (await page.locator('#drill-board cg-board').boundingBox()).width;

  await page.goto('/chess/londonsacrifice/#review');
  await expect(page.locator('#board cg-board')).toBeVisible();
  const coachBg = await page.locator('#board cg-board').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(coachBg).toBe(drillBg);
  await expect(page.locator('#board .sq-coords .sqc')).toHaveCount(16);
  const coachW = (await page.locator('#board cg-board').boundingBox()).width;
  expect(Math.abs(coachW - drillW), 'coach board must match the drill board size').toBeLessThanOrEqual(1.5);

  // #review -> #counts is a same-document hash change; the by-game face is
  // picked on load, so force a real navigation.
  await page.goto('/chess/londonsacrifice/#counts');
  await page.reload();
  await page.locator('#game-list [data-review-game]').first().click();
  await expect(page.locator('#review-board cg-board')).toBeVisible();
  const walkerBg = await page.locator('#review-board cg-board').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(walkerBg).toBe(drillBg);
  await expect(page.locator('#review-board .sq-coords .sqc')).toHaveCount(16);
  const walkerW = (await page.locator('#review-board cg-board').boundingBox()).width;
  expect(Math.abs(walkerW - drillW), 'walker board must match the drill board size').toBeLessThanOrEqual(1.5);
  // The walker highlights the played move like every other board.
  await expect(page.locator('#review-board square.last-move')).toHaveCount(2);
});

test('phone drill: chips, board, ask, and actions all visible with zero scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chess/londonsacrifice/#drill');
  await waitForDrillReady(page);
  const vh = 844;
  for (const sel of ['#drill-filters', '#drill-gameline', '#drill-board', '#drill-question', '#drill-hint', '#drill-next']) {
    const box = await page.locator(sel).boundingBox();
    expect(box, `${sel} present`).toBeTruthy();
    expect(box.y, `${sel} starts on screen`).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height, `${sel} must be fully visible with no scroll`).toBeLessThanOrEqual(vh + 1);
  }
});

test('fresh tactics: the second source drills curated lichess puzzles', async ({ page }) => {
  await page.goto('/chess/londonsacrifice/#drill');
  await waitForDrillReady(page);
  await page.locator('[data-drill-source="fresh"]').click();
  await expect(page.locator('#drill-gameline')).toContainText('lichess puzzle · rated', { timeout: 6000 });
  await expect(page.locator('#drill-stats')).toContainText(`#1 of ${fresh.count}`);
  await expect(page.locator('#drill-board square.last-move')).toHaveCount(2, { timeout: 6000 });
  await page.locator('[data-drill-source="mine"]').click();
  await expect(page.locator('#drill-gameline')).toContainText('vs ', { timeout: 6000 });
});

test('Review: graded best & worst moves with honest labels and class chips', async ({ page }) => {
  const failures = collectFailures(page);
  await page.goto('/chess/londonsacrifice/#review');
  await expect(page.locator('#coach')).toBeVisible();
  // Drill's control grammar: a segmented pair + ONE native picker (no chip rows).
  await expect(page.locator('#coach-topbar .drill-seg [data-review-face="best"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#review-filter-select')).toBeVisible();
  await expect(page.locator('#moves-filters')).toBeHidden();
  await expect(page.locator('#item-rail')).toHaveCount(0);
  await expect(page.locator('#position-meta')).toContainText(
    `1/${highlights.brilliantCandidates.length + highlights.turningPointBlunders.length}`);
  await expect(page.locator('#position-meta')).toContainText('Brilliant !!');
  // The one-line human note is VISIBLE at the key move — never only inside
  // the collapsed full note (Jerry: "i cant see any explanation at all").
  await expect(page.locator('#move-note')).toBeVisible();
  await expect(page.locator('#move-note')).not.toBeEmpty();
  // The same ‹ › control crosses into the next move at the line's end.
  const total = await page.locator('#position-meta').textContent();
  for (let i = 0; i < 24 && !(await page.locator('#step-next').isDisabled()); i += 1) {
    const meta = await page.locator('#position-meta').textContent();
    if (meta.startsWith('2/')) break;
    await page.locator('#step-next').click();
    await page.waitForTimeout(60);
  }
  await expect(page.locator('#position-meta')).toContainText('2/');
  await page.locator('#review-filter-select').selectOption('blunder');
  await expect(page.locator('#position-meta')).toContainText('1/30');
  await expect(page.locator('#position-meta')).toContainText('Blunder ??');
  // The lesson is ONE line: no labels table, no links, no explainer dropdown.
  await expect(page.locator('#insight-more')).toHaveCount(0);
  await expect(page.locator('#scale-explainer')).toHaveCount(0);
  await expect(page.locator('#lesson .source-links')).toHaveCount(0);
  expect(failures).toEqual([]);
});

test('Review: the by-game face lists every game and walks one move by move', async ({ page }) => {
  const failures = collectFailures(page);
  await page.goto('/chess/londonsacrifice/#counts');
  await expect(page.locator('html')).toHaveAttribute('data-view', 'review');
  await expect(page.locator('#review-games')).toBeVisible();
  await expect(page.locator('#game-list .game-row')).toHaveCount(report.gamesReviewed);
  await page.locator('#game-list [data-review-game]').first().click();
  await expect(page.locator('#review-walker')).toBeVisible();
  await expect(page.locator('#review-board cg-board')).toBeVisible();
  await expect(page.locator('#review-moves [data-review-index]').first()).toBeVisible();
  await expect(page.locator('#review-current')).not.toBeEmpty();
  await page.locator('#review-next').click();
  await page.locator('#review-back').click();
  await expect(page.locator('#review-games')).toBeVisible();
  expect(failures).toEqual([]);
});

test('desktop drill: big board left, ask beside it, few chips, one strong highlight', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/chess/londonsacrifice/#drill');
  await waitForDrillReady(page);
  const board = await page.locator('#drill-board cg-board').boundingBox();
  expect(board.width, 'desktop drill board must be large').toBeGreaterThanOrEqual(420);
  const ask = await page.locator('.drill-ask').boundingBox();
  expect(ask.x, 'the ask sits beside the board, not under it').toBeGreaterThan(board.x + board.width - 4);
  const next = await page.locator('#drill-next').boundingBox();
  expect(next.y + next.height, 'actions above the fold').toBeLessThanOrEqual(800);
  // One decision row: 2 segmented buttons + 1 picker; the active segment is
  // the row's only strong fill (the picker stays quiet).
  await expect(page.locator('#drill-filters button')).toHaveCount(2);
  await expect(page.locator('#drill-filter-select')).toBeVisible();
  const segBg = await page.locator('.drill-seg button[aria-pressed="true"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  const pickBg = await page.locator('#drill-filter-select').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(segBg, 'segment active is the strong fill; the picker is quiet').not.toBe(pickBg);
  // Desktop board parity with the review coach.
  await page.goto('/chess/londonsacrifice/#review');
  await expect(page.locator('#board cg-board')).toBeVisible();
  const coach = await page.locator('#board cg-board').boundingBox();
  expect(Math.abs(coach.width - board.width), 'desktop review board equals the drill board').toBeLessThanOrEqual(1.5);
});

test('landscape phone drill: board, ask, and actions share one screen', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/chess/londonsacrifice/#drill');
  await waitForDrillReady(page);
  for (const sel of ['#drill-board', '#drill-question', '#drill-hint', '#drill-next']) {
    const box = await page.locator(sel).boundingBox();
    expect(box.y, `${sel} on screen`).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height, `${sel} fully visible`).toBeLessThanOrEqual(391);
  }
  const drillBoard = await page.locator('#drill-board cg-board').boundingBox();
  await page.goto('/chess/londonsacrifice/#review');
  await expect(page.locator('#board cg-board')).toBeVisible();
  const coach = await page.locator('#board cg-board').boundingBox();
  expect(Math.abs(coach.width - drillBoard.width), 'landscape boards equal').toBeLessThanOrEqual(1.5);
});

test('drill badge says why you are practicing this', async ({ page }) => {
  await page.goto('/chess/londonsacrifice/#drill');
  await waitForDrillReady(page);
  await expect(page.locator('#drill-badge')).toContainText('Your mistake ·');
  await expect(page.locator('#drill-badge')).toContainText('× in ');
  await page.locator('[data-drill-source="fresh"]').click();
  await expect(page.locator('#drill-badge')).toContainText('New puzzle ·', { timeout: 6000 });
  await expect(page.locator('#drill-badge')).toContainText('rated');
});

test('no horizontal overflow at 320, 390, and landscape widths across tabs', async ({ page }) => {
  for (const [width, height] of [[320, 720], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    for (const view of ['summary', 'drill', 'review']) {
      await page.goto(`/londonsacrifice/#${view}`);
      await page.waitForTimeout(120);
      if (view !== 'summary') {
        await expect(page.locator('#app-heading')).toHaveText('London');
        await expect(page.locator('.profile-switch')).toHaveText('⇄ Jerry');
      }
      await expect(page.locator('.tabs > *')).toHaveText(['Summary', 'Drill', 'Review', 'Compare']);
      await expect(page.locator('#compare-tab')).toBeVisible();
      await noHorizontalOverflow(page);
    }
  }
});

test('offline: the unified shell reloads from its route-scoped cache', async ({ page, context }) => {
  await page.goto('/chess/londonsacrifice/#review');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cacheName = (await page.evaluate(async () => {
    const sw = await fetch('/chess/londonsacrifice/sw.js').then((response) => response.text());
    return sw.match(/const CACHE = '([^']+)'/chess/u)[1];
  }));
  await expect.poll(() => page.evaluate((name) => caches.has(name), cacheName)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#board cg-board')).toBeVisible();
  await expect(page.locator('#move-note')).toBeVisible();
  await page.goto('/chess/londonsacrifice/#drill');
  await expect(page.locator('#drill-stats')).toContainText(`#1 of ${puzzles.count}`);
  await context.setOffline(false);
});

test('accessibility: all three coach views and persistent Compare have no serious axe violations', async ({ page }) => {
  for (const view of ['summary', 'drill', 'review']) {
    await page.goto(`/londonsacrifice/#${view}`);
    await page.waitForTimeout(150);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(serious, serious.map((v) => v.id).join(', ')).toEqual([]);
  }
});

// Keep the drill puzzle count honest against the data.
test('drill data sanity', async () => {
  expect(puzzles.count).toBe(report.seriousEpisodes);
  expect(puzzles.schema).toBe('chess-puzzle-set/v5');
  expect(puzzles.puzzles.every((p) => p.dests && Object.keys(p.dests).length > 0)).toBe(true);
  expect(puzzles.puzzles.every((p) => !p.prev || typeof p.prevFen === 'string')).toBe(true);
});
