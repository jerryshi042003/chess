// Functional coverage for the unified Jerry coach (Chromium).
// Same shared shell as londonsacrifice; Jerry's data and profile order.
// Board interaction follows wisdom/chess-coach/docs/ux-spec.md.

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { HIGHLIGHT_REPORT as highlights } from '../../data/highlights.js';
import { EPISODE_REPORT as report } from '../../data/episodes.js';
import { PUZZLE_SET as puzzles } from '../../data/puzzles.js';
import { FRESH_SET as fresh } from '../../data/fresh.js';

const FIRST = puzzles.puzzles[0];
const RECENT = 20; // main.js MIN_RECENT_GAMES — the newest-games window
const league = JSON.parse(
  readFileSync(new URL('../../../chess-league/data.js', import.meta.url), 'utf8')
    .match(/const LEAGUE = (.*);/u)[1]
);
const leagueJerry = league.players.find((player) => player.user === 'jerryshi042003');
const leagueLondon = league.players.find((player) => player.user === 'londonsacrifice');
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
    await page.waitForTimeout(1500);
  }
}

async function waitForDrillReady(page) {
  await expect(page.locator('#drill-board cg-board')).toBeVisible();
  await expect(page.locator('#drill-board square.last-move')).toHaveCount(2, { timeout: 5000 });
}

test('three coach views plus persistent Compare; Summary leads for the returning player', async ({ page }) => {
  const failures = collectFailures(page);
  const remote = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:8799')) remote.push(request.url());
  });
  await page.goto('/chess/');
  await expect(page.locator('.tabs [data-view]')).toHaveCount(3);
  await expect(page.locator('.tabs > *')).toHaveText(['Summary', 'Drill', 'Review', 'Compare']);
  await expect(page.locator('#app-heading')).toHaveText("Jerry's Blitz Coach");
  await expect(page.locator('.profile-switch')).toHaveText('⇄ London');
  await expect(page.locator('.profile-switch')).toHaveAttribute('href', '/chess/londonsacrifice/#summary');
  await expect(page.locator('.profile-switch')).toHaveAttribute('aria-label', "Switch to London's coach");
  await expect(page.locator('#compare-tab')).toHaveAttribute('href', '/chess/chess-league/?coach=chess-openings');
  await expect(page.locator('#compare-tab')).toHaveAttribute('aria-label', 'Compare Jerry with friends');
  await expect(page.locator('.league-link')).toHaveCount(0);
  await expect(page.locator('#masthead-stats')).toHaveText(
    `${report.gamesReviewed} games · ${report.movesReviewed.toLocaleString('en-US')} decisions · ${report.seriousEpisodes} coaching episodes · through ${shortDate(report.games.at(-1).date)}`);

  // Mistakes lead the dashboard; trend + rhythm are collapsed at the bottom.
  const order = await page.locator('#progress-view > *').evaluateAll(
    (nodes) => nodes.map((node) => node.className.split(' ')[0]));
  expect(order).toEqual(['mistake-card', 'latest-card', 'opening-card', 'league-preview-card', 'minor-cards']);
  await expect(page.locator('#progress-view > :first-child')).toHaveClass(/mistake-card/u);
  await expect(page.locator('#progress-view')).toHaveAttribute('aria-label', 'Jerry summary');
  // The friends card is one link: no comparison chart to read past.
  await expect(page.locator('.league-preview-row')).toHaveCount(0);
  await expect(page.locator('#league-preview-action')).toHaveAttribute('href', '/chess/chess-league/?coach=chess-openings');

  await expect(page.locator('#openings-scope')).toContainText(`${report.gamesReviewed} rated 3+2 games`);
  await expect(page.locator('#openings-white .opening-row').first()).toContainText(report.openings.white.top[0].name);
  await expect(page.locator('#summary-mistakes .priority-row')).toHaveCount(6);
  // Nuance rows under each pattern are BUTTONS: "hung knight ×52" is its own query.
  await expect(page.locator('#summary-mistakes .sub-chip').first()).toHaveText(
    `${report.patterns[0].breakdown[0].label} ×${report.patterns[0].breakdown[0].count}`);
  await expect(page.locator('#openings-answer')).toContainText(`all ${report.gamesReviewed} games analyzed`);
  // Newest games reads a 20-game window, never a two-game sitting, and says so.
  const recent = report.games.slice(-RECENT);
  const wins = recent.filter((game) => game.result === 'win').length;
  const losses = recent.filter((game) => game.result === 'loss').length;
  await expect(page.locator('#latest-title')).toHaveText(
    `Last ${RECENT} games · ${shortDate(recent[0].date)}–${shortDate(recent.at(-1).date)}`);
  await expect(page.locator('#latest-answer')).toContainText(`${wins}W–${losses}L`);
  await expect(page.locator('#latest-answer')).toContainText(`across ${RECENT} games`);
  const latest = report.sittings.latest;
  await expect(page.locator('#latest-sub')).toContainText('drillable positions');
  await expect(page.locator('#latest-sub')).toContainText(`newest sitting ${shortDate(latest.date)} was only ${latest.games} game`);
  await page.locator('#latest-review').click();
  await expect(page.locator('#game-list [data-review-game]')).toHaveCount(RECENT);
  expect(await page.locator('#game-list [data-review-game]').evaluateAll(
    (buttons) => buttons.map((button) => button.dataset.reviewGame)
  )).toEqual(recent.map((game) => game.id).reverse());
  await page.locator('.tabs [data-view="summary"]').click();
  // Phase rows name each stage's specific failure — and each is drillable.
  await expect(page.locator('.phase-row')).toHaveCount(3);
  await expect(page.locator('.phase-row .phase-main')).toHaveCount(3);
  await expect(page.locator('.phase-row').nth(1).locator('.sub-chip').first()).toHaveText(
    `${report.phaseMistakes[1].rows[0].label} ×${report.phaseMistakes[1].rows[0].count}`);
  // The two prose reads under the mistake card are gone; the chips carry it.
  await expect(page.locator('#mistake-read')).toHaveCount(0);
  await expect(page.locator('#pressure-read')).toHaveCount(0);
  // Refresh card: new games against an equal immediately prior set. It lives
  // inside the collapsed "Trend & rhythm" disclosure now.
  await expect(page.locator('#change-title')).toBeHidden();
  await page.locator('.minor-summary').click();
  expect(await page.locator('.change-row').count()).toBeLessThanOrEqual(2);
  await expect(page.locator('#change-title')).toHaveText(`${report.refreshDelta.newGames}-game update`);
  await expect(page.locator('#change-verdict')).toHaveText(report.progressVerdict.headline);
  await expect(page.locator('#change-scope')).toContainText(`vs the prior ${report.refreshDelta.comparisonGames}`);
  await expect(page.locator('#change-scope')).toContainText('same engine');
  await expect(page.locator('#change-before-label')).toHaveText(`Prior ${report.refreshDelta.comparisonGames}`);
  await expect(page.locator('#change-now-label')).toHaveText(`New ${report.refreshDelta.newGames}`);
  await expect(page.locator('.change-state')).toContainText(['Watch', 'Still']);
  await expect(page.locator('.change-row').nth(1)).toContainText('Blunder after their blunder');
  await expect(page.locator('#change-answer')).toContainText('Usually clean');
  await expect(page.locator('#change-answer')).toContainText(report.week.historicallyGood[0].name);
  await expect(page.locator('.session-row')).toHaveCount(7);
  if (report.sittings.dropoff) {
    await expect(page.locator('#session-read')).toContainText(`stop after game ${report.sittings.dropoff.after}`);
  }
  await noHorizontalOverflow(page);
  expect(remote).toEqual([]);
  expect(failures).toEqual([]);
});

// Jerry's round-10 ask, verbatim: "all of these subcategories should be
// extremely easy to query too, and there right now is not a way i can skip to
// like missed mate 29 and just grind all of those out". Every count on the
// dashboard must therefore BE the size of the pool it opens.
const poolFor = ({ pattern = null, sub = null, phase = null }) => puzzles.puzzles.filter((puzzle) => {
  const tags = puzzle.tags && puzzle.tags.length ? puzzle.tags : [puzzle.pattern];
  if (pattern && !tags.includes(pattern)) return false;
  if (sub && puzzle.sub !== sub) return false;
  if (phase && puzzle.phase !== phase) return false;
  return true;
});

test('every mistake label on the Summary is a one-tap drill of exactly that many positions', async ({ page }) => {
  const failures = collectFailures(page);
  await page.goto('/chess/');

  // 1. The counts printed on the chips are the real pool sizes.
  const chips = await page.locator('#summary-mistakes .sub-chip').evaluateAll((nodes) => nodes.map((node) => ({
    pattern: node.dataset.drillPattern,
    sub: node.dataset.drillSub,
    text: node.textContent.trim(),
  })));
  expect(chips.length).toBeGreaterThanOrEqual(6);
  for (const chip of chips) {
    expect(chip.text).toBe(`${chip.sub} ×${poolFor({ pattern: chip.pattern, sub: chip.sub }).length}`);
  }

  // 2. Tapping one lands in Drill on that exact pool — "missed a mate ×29".
  const target = chips.find((chip) => chip.sub === 'missed a mate') || chips[0];
  const size = poolFor({ pattern: target.pattern, sub: target.sub }).length;
  await page.locator(`#summary-mistakes .sub-chip[data-drill-sub="${target.sub}"][data-drill-pattern="${target.pattern}"]`).click();
  await expect(page.locator('html')).toHaveAttribute('data-view', 'drill');
  await waitForDrillReady(page);
  await expect(page.locator('#drill-scope')).toContainText(target.sub);
  await expect(page.locator('#drill-scope')).toContainText(`${size} positions`);
  await expect(page.locator('#drill-stats')).toContainText(`#1 of ${size}`);
  // Every queued position really carries that label.
  const badge = await page.locator('#drill-badge').textContent();
  expect(badge).toContain(target.sub);
  // The picker keeps the scope selected, so you can hop to the next label.
  expect(await page.locator('#drill-filter-select').inputValue()).toBe(`sub:${target.sub}`);

  // 3. Clear goes back to the whole set.
  await page.locator('.drill-scope-clear').click();
  await expect(page.locator('#drill-scope')).toBeHidden();
  await expect(page.locator('#drill-stats')).toContainText(`of ${puzzles.count}`);

  // 4. Phase chips ("aimless move" in the middlegame) work the same way.
  await page.locator('.tabs [data-view="summary"]').click();
  const phaseChip = page.locator('.phase-row .sub-chip').first();
  const phaseInfo = await phaseChip.evaluate((node) => ({ sub: node.dataset.drillSub, phase: node.dataset.drillPhase }));
  const phaseSize = poolFor(phaseInfo).length;
  await phaseChip.click();
  await waitForDrillReady(page);
  await expect(page.locator('#drill-scope')).toContainText(phaseInfo.sub);
  await expect(page.locator('#drill-stats')).toContainText(`#1 of ${phaseSize}`);

  // 5. A whole phase is drillable too.
  await page.locator('.tabs [data-view="summary"]').click();
  await page.locator('.phase-main[data-drill-phase="endgame"]').click();
  await waitForDrillReady(page);
  await expect(page.locator('#drill-stats')).toContainText(`#1 of ${poolFor({ phase: 'endgame' }).length}`);
  expect(failures).toEqual([]);
});

test('pattern rows drill every tagged position, matching the number on the row', async ({ page }) => {
  await page.goto('/chess/');
  const pattern = report.patterns[0];
  await expect(page.locator('#summary-mistakes .priority-main').first()).toContainText(
    `${pattern.episodes} costly moments`);
  await page.locator(`#summary-mistakes .priority-main[data-drill-pattern="${pattern.id}"]`).click();
  await waitForDrillReady(page);
  await expect(page.locator('#drill-stats')).toContainText(`#1 of ${pattern.episodes}`);
  await expect(page.locator('#drill-scope')).toContainText(pattern.name);
});

test('an opening row drills that family and names how often its mistake repeats', async ({ page }) => {
  await page.goto('/chess/');
  const family = report.openings.white.top[0].name;
  const inFamily = puzzles.puzzles.filter((puzzle) => puzzle.op === family);
  const row = page.locator(`#openings-white .opening-row[data-open-opening="${family}"]`);
  await expect(row).toContainText(`${inFamily.length} costly position`);
  await row.click();
  await waitForDrillReady(page);
  await expect(page.locator('#drill-scope')).toContainText(family);
  await expect(page.locator('#drill-stats')).toContainText(`#1 of ${inFamily.length}`);
});

test('legacy hashes resolve into the three-view coach shell', async ({ page }) => {
  for (const [hash, view] of [['learn', 'drill'], ['counts', 'review'], ['summary', 'summary'], ['patterns', 'drill']]) {
    await page.goto(`/#${hash}`);
    await expect(page.locator('html')).toHaveAttribute('data-view', view);
  }
});

test('Drill: animated situation, priority chips, study list, examples round-trip', async ({ page }) => {
  const failures = collectFailures(page);
  await page.goto('/chess/#drill');
  await waitForDrillReady(page);
  await expect(page.locator('#drill-gameline')).toContainText(`vs ${FIRST.opponent}`);
  await expect(page.locator('#drill-gameline')).toContainText(`move ${FIRST.moveNo}`);
  await expect(page.locator('#drill-stats')).toContainText(`#1 of ${puzzles.count}`);
  await expect(page.locator('#drill-question')).toHaveText(
    `${FIRST.side === 'white' ? 'White' : 'Black'} to move — ${FIRST.task}`);
  await expect(page.locator('#drill-context')).toHaveCount(0);
  await expect(page.locator('#drill-meta')).toHaveCount(0);
  await expect(page.locator('#drill-filter-select option[value="punish"]')).toHaveText(`Punish the blunder · ${puzzles.punishCount}`);

  const optionValues = await page.locator('#drill-filter-select option').evaluateAll(
    (options) => options.map((option) => option.value));
  expect(optionValues[0]).toBe('all');
  expect(optionValues[1]).toBe(report.summary.focus.patternId);
  expect(optionValues[2]).toBe('punish');

  // The study list is gone from Drill — the Summary owns priorities.
  await expect(page.locator('#study-details')).toHaveCount(0);
  expect(failures).toEqual([]);
});

test('Drill rotates across games and remembers skipped positions after reload', async ({ page }) => {
  await page.goto('/chess/#drill');
  await waitForDrillReady(page);
  const firstGame = await page.locator('#drill-board').getAttribute('data-game-id');
  let rotation = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('chess-openings-drill-rotation-v1')));
  expect(Object.keys(rotation.positions)).toHaveLength(1);
  expect(Object.keys(rotation.games)).toHaveLength(1);

  await page.locator('#drill-next').click();
  const secondGame = await page.locator('#drill-board').getAttribute('data-game-id');
  expect(secondGame).not.toBe(firstGame);
  rotation = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('chess-openings-drill-rotation-v1')));
  expect(Object.keys(rotation.positions)).toHaveLength(2);
  expect(Object.keys(rotation.games)).toHaveLength(2);

  await page.reload();
  await waitForDrillReady(page);
  const thirdGame = await page.locator('#drill-board').getAttribute('data-game-id');
  expect(thirdGame).not.toBe(firstGame);
  expect(thirdGame).not.toBe(secondGame);
  rotation = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('chess-openings-drill-rotation-v1')));
  expect(Object.keys(rotation.positions)).toHaveLength(3);
  expect(Object.keys(rotation.games)).toHaveLength(3);
  await expect(page.locator('#drill-stats')).toContainText('solved today');
});

test('Drill board: legal dots, hint stages, en-passant answer, lapse requeue', async ({ page }) => {
  await page.goto('/chess/#drill');
  await waitForDrillReady(page);
  const answer = FIRST.better[0].uci.slice(0, 4);
  const orig = answer.slice(0, 2);
  const expected = (FIRST.dests[orig] || '').length / 2;
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

  // Hint stage 1 (teal piece square) then stage 2 (the move as an arrow).
  await page.locator('#drill-hint').click();
  await expect(page.locator('#drill-board svg.cg-custom-svgs rect')).toHaveCount(1);
  await expect(page.locator('#drill-hint')).toHaveText('Show move');
  await page.locator('#drill-hint').click();
  await expect(page.locator('#drill-board svg.cg-shapes line')).toHaveCount(1);
  await expect(page.locator('#drill-hint')).toBeDisabled();

  // Play the whole line yourself (starts with an en passant capture here).
  await playLine(page, FIRST.better.slice(0, FIRST.solvePlies).map((step) => step.uci), FIRST.side);
  await expect(page.locator('#drill-verdict')).toContainText('come back around', { timeout: 15000 });
  await expect(page.locator('#drill-answer')).toBeVisible();
  await expect(page.locator('#drill-next')).toHaveText('Next →');
  await page.locator('#drill-next').click();
  await expect(page.locator('#drill-stats')).toContainText(`#2 of ${puzzles.count + 1}`);
  const srs = await page.evaluate(() => localStorage.getItem('chess-openings-drill-srs-v1'));
  expect(srs).toContain('lapses');
});

test('one board implementation: drill, coach, and walker boards share theme and coords', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chess/#drill');
  await waitForDrillReady(page);
  const drillBg = await page.locator('#drill-board cg-board').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(drillBg).toContain('svg');
  await expect(page.locator('#drill-board .sq-coords .sqc')).toHaveCount(16);

  await page.goto('/chess/#review');
  await expect(page.locator('#board cg-board')).toBeVisible();
  expect(await page.locator('#board cg-board').evaluate((el) => getComputedStyle(el).backgroundImage)).toBe(drillBg);
  await expect(page.locator('#board .sq-coords .sqc')).toHaveCount(16);

  // #review -> #counts is a same-document hash change; the by-game face is
  // picked on load, so force a real navigation.
  await page.goto('/chess/#counts');
  await page.reload();
  await page.locator('#game-list [data-review-game]').first().click();
  await expect(page.locator('#review-board cg-board')).toBeVisible();
  expect(await page.locator('#review-board cg-board').evaluate((el) => getComputedStyle(el).backgroundImage)).toBe(drillBg);
  await expect(page.locator('#review-board square.last-move')).toHaveCount(2);
});

test('fresh tactics source loads rated lichess puzzles', async ({ page }) => {
  await page.goto('/chess/#drill');
  await waitForDrillReady(page);
  await page.locator('[data-drill-source="fresh"]').click();
  await expect(page.locator('#drill-gameline')).toContainText('lichess puzzle · rated', { timeout: 6000 });
  await expect(page.locator('#drill-board square.last-move')).toHaveCount(2, { timeout: 6000 });
});

test('Review: Jerry finally sees his Brilliant candidates, honestly graded', async ({ page }) => {
  const failures = collectFailures(page);
  await page.goto('/chess/#review');
  await expect(page.locator('#coach')).toBeVisible();
  // ONE control bar: no rail; the meta line carries the position; the class
  // filter is the same native-picker grammar as Drill.
  await expect(page.locator('#item-rail')).toHaveCount(0);
  await expect(page.locator('#position-meta')).toContainText(
    `1/${highlights.brilliantCandidates.length + highlights.turningPointBlunders.length}`);
  await expect(page.locator('#review-filter-select option[value="all"]')).toContainText(
    `All · ${highlights.brilliantCandidates.length + highlights.turningPointBlunders.length}`);
  await expect(page.locator('#moves-filters')).toBeHidden();
  await expect(page.locator('#position-meta')).toContainText('/chess/');
  // The one-line human note is visible at the key move.
  await expect(page.locator('#move-note')).toBeVisible();
  await expect(page.locator('#move-note')).not.toBeEmpty();
  await expect(page.locator('#scale-explainer')).toHaveCount(0);
  expect(failures).toEqual([]);
});

test('Review: by-game face walks a game move by move', async ({ page }) => {
  await page.goto('/chess/#counts');
  await expect(page.locator('#review-games')).toBeVisible();
  await expect(page.locator('#game-list .game-row')).toHaveCount(report.gamesReviewed);
  await page.locator('#game-list [data-review-game]').first().click();
  await expect(page.locator('#review-walker')).toBeVisible();
  await expect(page.locator('#review-board cg-board')).toBeVisible();
  await page.locator('#review-back').click();
  await expect(page.locator('#review-games')).toBeVisible();
});

test('desktop drill: big board left, ask beside it, few chips, one strong highlight', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/chess/#drill');
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
  await page.goto('/chess/#review');
  await expect(page.locator('#board cg-board')).toBeVisible();
  const coach = await page.locator('#board cg-board').boundingBox();
  expect(Math.abs(coach.width - board.width), 'desktop review board equals the drill board').toBeLessThanOrEqual(1.5);
});

test('landscape phone drill: board, ask, and actions share one screen', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/chess/#drill');
  await waitForDrillReady(page);
  for (const sel of ['#drill-board', '#drill-question', '#drill-hint', '#drill-next']) {
    const box = await page.locator(sel).boundingBox();
    expect(box.y, `${sel} on screen`).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height, `${sel} fully visible`).toBeLessThanOrEqual(391);
  }
  const drillBoard = await page.locator('#drill-board cg-board').boundingBox();
  await page.goto('/chess/#review');
  await expect(page.locator('#board cg-board')).toBeVisible();
  const coach = await page.locator('#board cg-board').boundingBox();
  expect(Math.abs(coach.width - drillBoard.width), 'landscape boards equal').toBeLessThanOrEqual(1.5);
});

test('drill badge says why you are practicing this', async ({ page }) => {
  await page.goto('/chess/#drill');
  await waitForDrillReady(page);
  await expect(page.locator('#drill-badge')).toContainText('Your mistake ·');
  // (The frequency line appears for the six ranked patterns; the first puzzle
  // here is a coordination mistake, which has no rank row.)
  await page.locator('[data-drill-source="fresh"]').click();
  await expect(page.locator('#drill-badge')).toContainText('New puzzle ·', { timeout: 6000 });
  await expect(page.locator('#drill-badge')).toContainText('rated');
});

test('no horizontal overflow at 320, 390, and landscape widths across tabs', async ({ page }) => {
  for (const [width, height] of [[320, 720], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    for (const view of ['summary', 'drill', 'review']) {
      await page.goto(`/#${view}`);
      await page.waitForTimeout(120);
      if (view !== 'summary') {
        await expect(page.locator('#app-heading')).toHaveText('Jerry');
        await expect(page.locator('.profile-switch')).toHaveText('⇄ London');
      }
      await expect(page.locator('.tabs > *')).toHaveText(['Summary', 'Drill', 'Review', 'Compare']);
      await expect(page.locator('#compare-tab')).toBeVisible();
      await noHorizontalOverflow(page);
    }
  }
});

test('offline: the unified shell reloads from its atomic cache', async ({ page, context }) => {
  await page.goto('/chess/#review');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cacheName = (await page.evaluate(async () => {
    const sw = await fetch('/chess/sw.js').then((response) => response.text());
    return sw.match(/const CACHE = '([^']+)'/chess/u)[1];
  }));
  await expect.poll(() => page.evaluate((name) => caches.has(name), cacheName)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#board cg-board')).toBeVisible();
  await page.goto('/chess/#drill');
  await expect(page.locator('#drill-stats')).toContainText(`#1 of ${puzzles.count}`);
  await context.setOffline(false);
});

test('accessibility: all three coach views and persistent Compare have no serious axe violations', async ({ page }) => {
  for (const view of ['summary', 'drill', 'review']) {
    await page.goto(`/#${view}`);
    await page.waitForTimeout(150);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(serious, serious.map((v) => v.id).join(', ')).toEqual([]);
  }
});
