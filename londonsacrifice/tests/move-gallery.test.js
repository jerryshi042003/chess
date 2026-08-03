import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EPISODE_REPORT as report } from '../data/episodes.js';
import { HIGHLIGHT_REPORT as highlights } from '../data/highlights.js';
import { PUZZLE_SET as puzzles } from '../data/puzzles.js';
import { PRACTICAL_READ as read } from '../data/read.js';
import { LEARNABILITY as bands } from '../data/learnability.js';

test('the phone payload represents the complete audit and focused curriculum', () => {
  assert.equal(report.schema, 'chess-episode-coach/v2');
  assert.equal(highlights.schema, 'chess-highlight-report/v1');
  // The corpus refreshes nightly: the invariant is internal consistency, not
  // last week's totals. (Source-exactness vs the PGN lives in the python suite.)
  assert.ok(report.gamesReviewed >= 124);
  assert.ok(report.movesReviewed > report.gamesReviewed * 10);
  assert.ok(report.seriousEpisodes >= 764);
  assert.equal(report.games.length, report.gamesReviewed);
  assert.equal(report.episodes.length, 18);
  assert.equal(new Set(report.episodes.map((episode) => episode.id)).size, 18);
  // Pattern RANK is data, not a constant: 21 new games swapped gift (127) and
  // fork (124) and this assertion failed on nothing but that reordering — which
  // aborts nightly_refresh.sh at the test step under `set -e` and silently
  // stops publishing forever. Assert what the comment above actually claims:
  // the same six patterns are present, and the ranking really is by weight.
  assert.deepEqual(
    [...report.patterns.map((pattern) => pattern.id)].sort(),
    ['fork', 'gift', 'king_attack', 'passed_pawn', 'piece_safety', 'pin']
  );
  // Rank is by roiScore (cost x frequency), not raw episode count — asserting
  // the real ordering rule is both stronger and refresh-proof.
  const roi = report.patterns.map((pattern) => pattern.roiScore);
  assert.deepEqual(roi, [...roi].sort((a, b) => b - a), 'patterns ranked by roiScore');
  assert.deepEqual(report.patterns.map((pattern) => pattern.rank), [1, 2, 3, 4, 5, 6]);
  assert.ok(report.episodes.every((episode) => episode.actual.steps.length >= 2));
  assert.ok(report.episodes.every((episode) => episode.better.steps.length >= 1));
});

test('the learning dashboard uses real dates and source-exact trailing windows', () => {
  const dashboard = report.dashboard;
  assert.equal(dashboard.schema, 'chess-learning-dashboard/v2');
  assert.equal(dashboard.windowSize, 20);
  assert.ok(dashboard.timeline.length >= 3);
  assert.ok(dashboard.timeline.every((point) => point.games === 20));
  const dates = dashboard.timeline.map((point) => point.date);
  assert.deepEqual(dates, [...dates].sort(), 'timeline dates ascend');
  assert.ok(dashboard.timeline.every((point) => point.lastSequence - point.firstSequence === 19));
  assert.deepEqual(dashboard.defenseCategories.map((category) => category.id), ['loose', 'fork', 'mate', 'pin']);
  assert.deepEqual(dashboard.attackCategories.map((category) => category.id), ['loose', 'fork', 'mate', 'pin']);

  const latest = dashboard.timeline.at(-1);
  for (const point of dashboard.timeline) {
    for (const id of ['loose', 'fork', 'mate', 'pin']) {
      assert.ok(point.defense[id].gamesAffected >= 0 && point.defense[id].gamesAffected <= 20);
      const attack = point.attack[id];
      assert.ok(attack.found >= 0 && attack.missed >= 0);
      assert.ok(attack.rate >= 0 && attack.rate <= 100);
    }
  }
  assert.ok(latest.defense.loose.gamesAffected > 0, 'the focus pattern still shows up');
});

test('the summary says what London plays, how games end, and what to train first', () => {
  assert.equal(report.summary.schema, 'chess-play-summary/v1');
  assert.equal(report.summary.white.label, 'London System');
  assert.ok(report.summary.white.games <= report.summary.white.totalGames);
  assert.ok(report.summary.white.weakSpot.reply.length >= 2);
  assert.ok(report.summary.black.e4.games <= report.summary.black.e4.totalGames);
  assert.ok(['time', 'checkmate', 'resign'].includes(report.summary.wins.mode));
  assert.ok(report.summary.wins.games <= report.summary.wins.totalGames);
  assert.equal(report.summary.losses.patternId, 'piece_safety');
  assert.ok(report.summary.losses.games <= report.summary.losses.totalGames);
  assert.equal(report.summary.focus.patternId, 'piece_safety');
  assert.equal(report.summary.focus.recentWindow, 20);
  assert.ok(report.summary.focus.recentGames <= report.summary.focus.recentWindow);
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
  // mostLosses judges every family with a real sample, by games actually lost.
  for (const color of ['white', 'black']) {
    const worst = openings[color].mostLosses;
    if (worst) {
      assert.ok(worst.games >= 5);
      assert.ok(worst.losses >= 3);
      assert.equal(worst.wins + worst.losses + worst.draws, worst.games);
    }
  }
});

test('the sitting summary covers every game and pools the late-game tail', () => {
  const sittings = report.sittings;
  assert.equal(sittings.schema, 'chess-sitting-summary/v2');
  assert.equal(sittings.gapMinutes, 60);
  assert.equal(sittings.since, '2026.07.04');
  assert.equal(sittings.positions.length, 7);
  assert.deepEqual(sittings.positions.map((row) => row.label),
    ['Game 1', 'Game 2', 'Game 3', 'Game 4', 'Game 5', 'Game 6', 'Game 7+']);
  assert.equal(sittings.positions.reduce((sum, row) => sum + row.games, 0), report.gamesReviewed);
  assert.equal(sittings.positions[0].games, sittings.count);
  assert.ok(sittings.positions.every((row) => row.wins <= row.games));
  // The latest sitting powers the "since you played" card.
  assert.ok(sittings.latest.games >= 1);
  assert.equal(sittings.latest.urls.length, sittings.latest.games);
  assert.equal(
    sittings.latest.wins + sittings.latest.losses + sittings.latest.draws,
    sittings.latest.games);
  assert.ok(typeof sittings.latest.newEpisodes === 'number');
});

test('practice reuses source games across problem types without duplicating a position', () => {
  const episodes = new Map(report.episodes.map((episode) => [episode.id, episode]));
  const selections = report.patterns.flatMap((pattern) => pattern.exampleIds.map((id) => ({
    pattern: pattern.id,
    episode: episodes.get(id)
  })));
  assert.equal(selections.length, 18);
  assert.equal(new Set(selections.map(({ episode }) => episode.id)).size, 18);

  // Every selection resolves to a real episode (the reuse profile shifts as
  // the corpus grows — distinctness and resolvability are the invariants).
  assert.ok(selections.every(({ episode }) => episode));
});

test('all brilliant candidates and only one turning point per blunder game ship', () => {
  assert.equal(highlights.gamesReviewed, report.gamesReviewed);
  assert.equal(highlights.brilliantCount, highlights.brilliantCandidates.length);
  assert.ok(highlights.brilliantCount >= 4);
  const motifs = new Set(highlights.brilliantCandidates.map((item) => item.motif));
  for (const motif of ['Clearance sacrifice', 'Deflection into simplification', 'Poisoned bishop', 'Deflection sacrifice']) {
    assert.ok(motifs.has(motif));
  }
  assert.ok(highlights.brilliantCandidates.every((item) => item.line.steps[0].uci === item.playedUci));
  assert.ok(highlights.brilliantCandidates.every((item) => item.question && item.reason && item.cue));
  assert.ok(highlights.brilliantCandidates.every((item) => item.reason.trim().split(/\s+/u).length <= 30));
  assert.ok(highlights.brilliantCandidates.every((item) => item.cue.trim().split(/\s+/u).length <= 15));
  assert.ok(highlights.brilliantCandidates.every((item) => /^2026\.\d{2}\.\d{2}$/u.test(item.date)));
  assert.ok(highlights.brilliantCandidates.every((item) => ['win', 'loss', 'draw'].includes(item.result)));
  assert.ok(highlights.brilliantCandidates.every((item) => item.offer?.piece && item.offer?.square));
  assert.ok(highlights.brilliantCandidates.every((item) => Number.isInteger(item.cpLoss) && Number.isInteger(item.scoreAfter)));
  assert.equal(highlights.selectedBlunderCount, 30);
  // 30 biggest moments overall, PLUS the turning point of every one of the
  // newest 20 games (see chess-openings/tests/episode-report.test.js).
  assert.ok(highlights.turningPointBlunders.length >= 30);
  assert.equal(
    new Set(highlights.turningPointBlunders.map((item) => item.gameId)).size,
    highlights.turningPointBlunders.length,
    'one turning point per game'
  );
  assert.equal(new Set(highlights.turningPointBlunders.map((item) => item.gameId)).size, 30);
  assert.ok(highlights.totalBlunders >= highlights.selectedBlunderCount);
  assert.match(highlights.criteria.disclaimer, /not official premium Game Review badges/u);
});

test('the drill set covers every serious episode with solvable, newest-first puzzles', () => {
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
  // v3: the board's legality + load animation come from the builder.
  assert.ok(puzzles.puzzles.every((puzzle) => puzzle.dests && Object.keys(puzzle.dests).length > 0));
  assert.ok(puzzles.puzzles.every((puzzle) => {
    const orig = puzzle.better[0].uci.slice(0, 2);
    const dest = puzzle.better[0].uci.slice(2, 4);
    return (puzzle.dests[orig] || '').match(/.{2}/gu)?.includes(dest);
  }), 'the answer move is always inside its own legal-move map');
  assert.ok(puzzles.puzzles.every((puzzle) => (puzzle.prev === null) === (puzzle.prevFen === null)));
  assert.ok(puzzles.puzzles.every((puzzle) => puzzle.prevFen === null || /^[\dpnbrqkPNBRQK/]+ [wb] /u.test(puzzle.prevFen)));
  assert.ok(puzzles.puzzles.filter((puzzle) => puzzle.prev).length >= puzzles.count - 2, 'nearly every puzzle shows the opponent move');
  assert.ok(puzzles.puzzles.every((puzzle) => ['white', 'black'].includes(puzzle.side)));
  const known = new Set(['piece_safety', 'king_attack', 'fork', 'gift', 'pin', 'passed_pawn', 'coordination']);
  assert.ok(puzzles.puzzles.every((puzzle) => known.has(puzzle.pattern)));
});

test('the offline shell is route-scoped, local, and complete', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const shellBlock = sw.match(/const SHELL = \[([\s\S]*?)\];/u)?.[1] || '';
  const paths = [...shellBlock.matchAll(/'([^']+)'/chess/gu)].map((match) => match[1]);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.length <= 27, `expected a focused shell, got ${paths.length} assets`);
  assert.ok(paths.includes('/chess/londonsacrifice/ui/board.js'));
  assert.ok(paths.includes('/chess/londonsacrifice/ui/board.css'));
  assert.ok(paths.includes('/chess/londonsacrifice/ui/navigation.css'));
  assert.ok(paths.includes('/chess/londonsacrifice/ui/profile.js'));
  assert.ok(paths.includes('/chess/londonsacrifice/data/reviews.js'));
  assert.ok(paths.includes('/chess/londonsacrifice/data/puzzles.js'));
  assert.ok(paths.includes('/chess/londonsacrifice/data/fresh.js'));
  assert.ok(paths.every((pathname) => pathname.startsWith('/chess/londonsacrifice/') || pathname === '/chess/chess-league/data.js?v=16'));
  for (const pathname of paths) {
    if (pathname === '/chess/chess-league/data.js?v=16') continue;
    if (pathname === '/chess/londonsacrifice/' || pathname === '/chess/londonsacrifice/index.html') continue;
    const relative = pathname.replace('/chess/londonsacrifice/', '');
    assert.ok(existsSync(new URL(`../${relative}`, import.meta.url)), `${pathname} does not exist`);
  }
  assert.match(sw, /startsWith\('londonsacrifice-'\)/u);
  assert.match(sw, /request\.mode === 'navigate'[\s\S]*caches\.match\('\/londonsacrifice\/index\.html'\)/u);
  const cacheName = sw.match(/const CACHE = '([^']+)'/chess/u)?.[1] || '';
  // The token is derived from content now (see sync_coach_ui.mjs), not
  // hand-versioned — a hand-maintained token drifted silently and froze the
  // installed app. Assert the shape it actually has.
  assert.match(cacheName, /^londonsacrifice-[0-9a-f]{10}$/u);
  assert.doesNotMatch(sw, /startsWith\('chess-openings-'/chess/u);
});

test('the active app has no remote runtime or unrelated player data', () => {
  for (const path of ['../index.html', '../ui/main.js', '../ui/navigation.css', '../ui/styles.css', '../data/episodes.js', '../data/highlights.js']) {
    const text = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /<(?:script|link|img)[^>]+(?:src|href)=["']https?:|@import\s+url\(["']?https?:|fetch\(["']https?:/u);
    assert.doesNotMatch(text, /jerryshi042003|Jerry's Blitz Coach/iu);
  }
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.match(index, /<title>London · Chess Lessons<\/title>/u);
  assert.match(index, /<h1 id="app-heading"><\/h1>/u); // heading is profile-driven
  assert.equal(manifest.short_name, 'London');
});

test('the board runtime is the pinned official Chessground release', () => {
  const expected = {
    'chessground.min.js': '878c755e2aa1105d646d149266817fd96ecabe9bbefca65f445306273ab7196b',
    'chessground.base.css': 'fbfa4b0e791c58c9e793161e543ce712d85663318a82e547aee7db8f817770f2',
    'chessground.brown.css': 'cc666266d116b752ea085851f2514b25a0273501c6e6f224cbf4282bf01e8123',
    'chessground.cburnett.css': 'f9216192b5383a83e62a81de1cf58520f7c251f6f24930f5710a3c797f78ced4',
    'LICENSE.chessground': '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903'
  };
  for (const [filename, digest] of Object.entries(expected)) {
    const contents = readFileSync(new URL(`../vendor/${filename}`, import.meta.url));
    assert.equal(createHash('sha256').update(contents).digest('hex'), digest, filename);
  }
  assert.match(readFileSync(new URL('../vendor/README.md', import.meta.url), 'utf8'), /@lichess-org\/chessground@10\.1\.1/u);
});

test('move classification is honest: only a true sacrifice from a non-winning position is Brilliant', async () => {
  const { classifyCandidate, classifyMistake } = await import('../ui/classify.js');
  const byMove = Object.fromEntries(
    highlights.brilliantCandidates.map((item) => [`${item.moveNo} ${item.played}`.trim(), classifyCandidate(item)])
  );
  // 6 Nxe5: a real knight sacrifice, near-best, from +1.8 (not already winning) -> the one genuine Brilliant.
  assert.equal(byMove['6 Nxe5'], 'brilliant');
  // Already completely winning before the move (>= +3.0) -> Best, never Brilliant.
  assert.equal(byMove['20… Nxd2'], 'best');
  assert.equal(byMove['34 Bxf6'], 'best');
  // Not near-best (the engine had a clearly better move) -> cannot be Brilliant.
  assert.equal(byMove['14… Nxd5'], 'good');
  // Exactly one Brilliant survives the real chess.com bar.
  const brilliants = highlights.brilliantCandidates.filter((item) => classifyCandidate(item) === 'brilliant');
  assert.equal(brilliants.length, 1);
  // Every turning-point mistake grades as a real error (never Best/Good/Brilliant).
  assert.ok(highlights.turningPointBlunders.every((item) =>
    ['inaccuracy', 'mistake', 'blunder'].includes(classifyMistake(item))));
});

// The coach UI is SHARED with chess-openings, so a feature built for one app
// ships into the other whether or not it has the data behind it. London has no
// learnability measurement and no practical read, and must therefore render
// neither — an empty card or a scope with nothing in it would be worse than the
// feature's absence.
test('features built for the other player degrade to absent, not empty', () => {
  assert.equal(read.schema, 'chess-practical-read/v1');
  assert.equal(read.answers.length, 0,
    'London has no read of its own; a card with rows here would be someone else\'s data');
  assert.equal(bands.count, 0, 'London has no learnability measurement');
  assert.equal(Object.keys(bands.bands).length, 0);
  // and the shared UI must gate on those, not assume they are populated
  const ui = readFileSync(new URL('../ui/main.js', import.meta.url), 'utf8');
  assert.match(ui, /if \(!answers\.length\) \{ card\.hidden = true; return; \}/u,
    'the read card does not hide itself when there is nothing to say');
  assert.match(ui, /LEARNABILITY\.count/u,
    'the drill scopes do not gate on there being a measurement');
});
