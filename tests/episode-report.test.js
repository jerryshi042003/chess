import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EPISODE_REPORT as report } from '../data/episodes.js';
import { PUZZLE_SET as puzzles } from '../data/puzzles.js';
import { HIGHLIGHT_REPORT as highlights } from '../data/highlights.js';

test('the phone payload carries the complete audit counts and 18 distinct examples', () => {
  assert.equal(report.schema, 'chess-episode-coach/v2');
  // Nightly-refreshing corpus: internal consistency here; PGN exactness in python.
  assert.ok(report.gamesReviewed >= 79);
  assert.ok(report.movesReviewed > report.gamesReviewed * 10);
  assert.ok(report.seriousEpisodes >= 494);
  // Same brittleness as londonsacrifice/tests/move-gallery.test.js: rank is
  // data. A tie shifting between refreshes must not abort the nightly publish.
  assert.deepEqual(
    [...report.patterns.map((pattern) => pattern.id)].sort(),
    ['fork', 'gift', 'king_attack', 'passed_pawn', 'piece_safety', 'pin']
  );
  // Rank is by roiScore (cost x frequency), not raw episode count — asserting
  // the real ordering rule is both stronger and refresh-proof.
  const roi = report.patterns.map((pattern) => pattern.roiScore);
  assert.deepEqual(roi, [...roi].sort((a, b) => b - a), 'patterns ranked by roiScore');
  assert.deepEqual(report.patterns.map((pattern) => pattern.rank), [1, 2, 3, 4, 5, 6]);
  assert.equal(report.episodes.length, 18);
  assert.equal(new Set(report.episodes.map((episode) => episode.id)).size, 18);
  assert.ok(report.episodes.every((episode) => episode.actual.steps.length >= 2));
  assert.ok(report.episodes.every((episode) => episode.better.steps.length >= 1));
  assert.ok(report.episodes.every((episode) => episode.tags.every((tag) => tag === 'coordination' || episode.lessons[tag])));
});

test('fork, pin, gift, and progress numbers stay internally consistent', () => {
  assert.ok(report.forks.costly <= report.forks.faced);
  assert.ok(report.forks.classicCostly <= report.forks.classicFaced);
  assert.ok(report.pins.punishedAbsolutePins <= report.pins.faced);
  assert.equal(
    report.gifts.handled + report.gifts.missed + report.gifts.safeAlternatives,
    report.gifts.opportunities
  );
  assert.equal(report.cohorts.previous.games, 20);
  assert.equal(report.cohorts.recent.games, 20);
  assert.ok(Number.isInteger(report.progressVerdict.ratingChange));
});

test('the openings summary names real families with real records', () => {
  const openings = report.openings;
  assert.equal(openings.schema, 'chess-openings-summary/v2');
  for (const color of ['white', 'black']) {
    const side = openings[color];
    assert.equal(side.top.length, 3);
    assert.ok(side.top[0].games >= side.top[1].games && side.top[1].games >= side.top[2].games);
    for (const row of side.top) {
      assert.ok(row.name.length > 3 && !/\d/u.test(row.name), 'family names carry no move numbers');
      assert.equal(row.wins + row.losses + row.draws, row.games);
    }
    assert.ok(side.top.reduce((sum, row) => sum + row.games, 0) <= side.totalGames);
  }
  assert.equal(openings.white.totalGames + openings.black.totalGames, report.gamesReviewed);
  assert.ok(openings.white.top[0].name.length > 3);
  for (const color of ['white', 'black']) {
    const worst = openings[color].mostLosses;
    if (worst) {
      assert.ok(worst.games >= 5 && worst.losses >= 3);
      assert.equal(worst.wins + worst.losses + worst.draws, worst.games);
    }
  }
});

test('the summary, sittings, and drill payloads are present and exact', () => {
  assert.equal(report.summary.schema, 'chess-play-summary/v1');
  assert.ok(report.summary.white.games <= report.summary.white.totalGames);
  assert.ok(report.summary.black.e4.games <= report.summary.black.e4.totalGames);
  assert.ok(report.summary.wins.games <= report.summary.wins.totalGames);
  assert.equal(report.summary.losses.patternId, 'piece_safety');
  assert.ok(report.summary.focus.recentGames <= report.summary.focus.recentWindow);

  assert.equal(report.sittings.schema, 'chess-sitting-summary/v2');
  assert.equal(report.sittings.since, '2026.07.13');
  assert.equal(report.sittings.positions.reduce((sum, row) => sum + row.games, 0), report.gamesReviewed);
  assert.ok(report.sittings.latest.games >= 1);
  assert.equal(report.sittings.latest.urls.length, report.sittings.latest.games);

  assert.equal(report.dashboard.schema, 'chess-learning-dashboard/v2');
  assert.equal(report.dashboard.windowSize, 20);
  assert.ok(report.dashboard.timeline.length >= 3);

  assert.equal(puzzles.schema, 'chess-puzzle-set/v5');
  assert.equal(puzzles.count, report.seriousEpisodes);
  assert.equal(puzzles.puzzles.length, puzzles.count);
  assert.equal(new Set(puzzles.puzzles.map((puzzle) => puzzle.id)).size, puzzles.count);
  assert.ok(puzzles.puzzles[0].date >= puzzles.puzzles.at(-1).date, 'newest games come first');
  assert.ok(puzzles.puzzles.every((puzzle) => puzzle.better.length >= 1));
  // Every line reaches a stated conclusion and ends on the solver's own move
  // (Jerry: "make sure it actually goes all the way to the missed mate").
  assert.ok(puzzles.puzzles.every((puzzle) => puzzle.end && puzzle.end.text && puzzle.end.kind));
  assert.ok(puzzles.puzzles.every((puzzle) => puzzle.better.length % 2 === 1), 'lines end on your move');
  assert.ok(
    puzzles.puzzles
      .filter((puzzle) => puzzle.sub === 'missed a mate')
      .every((puzzle) => puzzle.end.kind === 'mate' || puzzle.end.kind === 'openEnded'),
    'a promised mate is delivered or explicitly flagged as running long');
  assert.ok(
    puzzles.puzzles
      .filter((puzzle) => puzzle.end.kind === 'mate')
      .every((puzzle) => puzzle.better.at(-1).san.includes('#')));
  assert.ok(puzzles.puzzles.every((puzzle) => puzzle.solvePlies >= 1 && puzzle.solvePlies <= puzzle.better.length));
  assert.ok(puzzles.puzzles.every((puzzle) => puzzle.better[0].uci !== puzzle.played.uci));
  assert.ok(puzzles.puzzles.every((puzzle) => puzzle.task && puzzle.explanation && puzzle.cost));
  assert.ok(puzzles.puzzles.every((puzzle) => puzzle.prev === null || (puzzle.prev.san && puzzle.prev.uci.length >= 4)));
  assert.ok(puzzles.puzzles.every((puzzle) => puzzle.dests && Object.keys(puzzle.dests).length > 0));
  assert.ok(puzzles.puzzles.every((puzzle) => {
    const orig = puzzle.better[0].uci.slice(0, 2);
    const dest = puzzle.better[0].uci.slice(2, 4);
    return (puzzle.dests[orig] || '').match(/.{2}/gu)?.includes(dest);
  }), 'the answer move is always inside its own legal-move map');
  assert.ok(puzzles.puzzles.every((puzzle) => (puzzle.prev === null) === (puzzle.prevFen === null)));
});

test('the newest refresh is compared with an equal immediately prior window', () => {
  const delta = report.refreshDelta;
  assert.ok(delta);
  assert.equal(delta.previousGames + delta.newGames, report.gamesReviewed);
  assert.equal(delta.currentGames, report.gamesReviewed);
  assert.equal(delta.comparisonGames, Math.min(delta.previousGames, delta.newGames));
  assert.equal(delta.previous.games, delta.comparisonGames);
  assert.equal(delta.new.games, delta.newGames);
  assert.ok(Number.isInteger(delta.previous.averageOpponentRating));
  assert.ok(Number.isInteger(delta.new.averageOpponentRating));
  assert.equal(
    report.progressVerdict.headline,
    `Rating rose ${report.progressVerdict.ratingChange} points against opponents averaging ${delta.new.averageOpponentRating - delta.previous.averageOpponentRating} points stronger, but move safety got worse.`
  );
  assert.ok(delta.trends.some((row) => row.id === 'counter'));
  assert.ok(delta.trends.every((row) => ['improving', 'worsening', 'flat', 'not enough data'].includes(row.direction)));
  assert.equal(report.progressVerdict.basis, `${delta.newGames} new games versus the immediately prior ${delta.comparisonGames}`);
  // The payload carries numbers; the sentence renders them to one decimal. A
  // regex built from the raw number therefore matched only while the value had
  // a fractional part — the night counterBlunder.pct landed on exactly 50.0,
  // "50% → 0%" stopped matching "50.0% → 0.0%" and the whole publish aborted.
  // Match the rendered form, tolerating either spelling.
  const shown = (value) => {
    const n = Number(value);
    return Number.isInteger(n) ? `${n}(?:\\.0)?` : String(n).replace('.', '\\.');
  };
  assert.match(
    report.practicePlan[0],
    new RegExp(`${shown(delta.previous.hangsPer100)} → ${shown(delta.new.hangsPer100)}`)
  );
  assert.match(
    report.practicePlan[1],
    new RegExp(`${shown(delta.previousPressure.counterBlunder.pct)}% → ${shown(delta.newPressure.counterBlunder.pct)}%`)
  );
});

test('the highlight corpus ships every verified Jerry Brilliant candidate', () => {
  assert.equal(highlights.schema, 'chess-highlight-report/v1');
  assert.equal(highlights.gamesReviewed, report.gamesReviewed);
  assert.equal(highlights.brilliantCount, highlights.brilliantCandidates.length);
  assert.ok(highlights.brilliantCount >= 3);
  // 30 biggest moments overall, PLUS the turning point of every one of the
  // newest 20 games — ranking by size alone left the games just played with a
  // single reviewable decision (allowed-mate scores ~99,666 and takes every
  // slot). Still at most one card per game.
  assert.ok(highlights.turningPointBlunders.length >= 30);
  assert.equal(
    new Set(highlights.turningPointBlunders.map((item) => item.gameId)).size,
    highlights.turningPointBlunders.length,
    'one turning point per game'
  );
  const recentGameIds = new Set(report.games.slice(-20).map((game) => game.id));
  const covered = highlights.turningPointBlunders.filter((item) => recentGameIds.has(item.gameId));
  assert.ok(covered.length >= 5, `recent games are reviewable (got ${covered.length})`);
  assert.ok(highlights.brilliantCandidates.every((item) => item.offer?.piece && item.question));
});

test('the offline shell is small, local, and contains every active runtime asset', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const shellBlock = sw.match(/const SHELL = \[([\s\S]*?)\];/u)?.[1] || '';
  const paths = [...shellBlock.matchAll(/'([^']+)'/chess/gu)].map((match) => match[1]);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.length <= 27, `expected a focused shell, got ${paths.length} assets`);
  assert.ok(paths.includes('/chess/ui/board.js'));
  assert.ok(paths.includes('/chess/ui/board.css'));
  assert.ok(paths.includes('/chess/ui/navigation.css'));
  assert.ok(paths.includes('/chess/ui/profile.js'));
  assert.ok(paths.includes('/chess/data/highlights.js'));
  assert.ok(paths.includes('/chess/data/puzzles.js'));
  assert.ok(paths.includes('/chess/data/fresh.js'));
  assert.ok(paths.includes('/chess/data/learnability.js'));
  assert.ok(paths.includes('/chess/data/read.js'));
  assert.ok(paths.includes('/chess/chess-league/data.js?v=16'));
  for (const pathname of paths) {
    if (pathname === '/chess/chess-league/data.js?v=16') continue;
    if (pathname === '/chess/' || pathname === '/chess/index.html') continue;
    const relative = pathname.replace('/chess/', '');
    assert.ok(existsSync(new URL(`../${relative}`, import.meta.url)), `${pathname} does not exist`);
  }
  for (const stale of ['ui/review.js', 'data/drills.js', 'data/repertoire.js', 'engine/lozza.js', 'vendor/chess.js']) {
    assert.ok(!sw.includes(stale), `${stale} should not be cached`);
  }
});

test('the active app loads no remote scripts, styles, fonts, or images', () => {
  for (const path of ['../index.html', '../ui/main.js', '../ui/navigation.css', '../ui/styles.css']) {
    const text = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /<(?:script|link|img)[^>]+(?:src|href)=["']https?:|@import\s+url\(["']?https?:|fetch\(["']https?:/u);
  }
});

// The service worker precaches every data and UI file and serves them
// cache-first, so its CACHE token is the only thing that delivers new games to
// an installed phone. A hand-maintained token drifted silently for weeks and
// froze the app. The token is now derived from the bytes it names; this test is
// what stops it from ever quietly drifting again.
test('the service-worker cache token matches the content it caches', async () => {
  const { createHash } = await import('node:crypto');
  const { readdirSync } = await import('node:fs');
  const appDir = new URL('../', import.meta.url);
  const generated = [
    'ui/main.js', 'ui/board.js', 'ui/board.css', 'ui/navigation.css',
    'ui/classify.js', 'ui/styles.css', 'index.html', 'pwa.js',
  ];
  const hash = createHash('sha256');
  for (const name of generated) {
    hash.update(name);
    hash.update(readFileSync(new URL(name, appDir), 'utf8').replace(/(const CACHE = ')[^']*(')/u, '$1$2'));
  }
  const dataDir = new URL('data/', appDir);
  for (const name of readdirSync(dataDir).sort()) {
    hash.update(name);
    hash.update(readFileSync(new URL(name, dataDir)));
  }
  const expected = `chess-openings-${hash.digest('hex').slice(0, 10)}`;
  const sw = readFileSync(new URL('sw.js', appDir), 'utf8');
  const actual = sw.match(/const CACHE = '([^']+)'/chess/u)?.[1];
  assert.equal(actual, expected,
    'sw.js CACHE is stale — run `node scripts/chess/sync_coach_ui.mjs` so installed phones get the new data');
});
