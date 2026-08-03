# London · Chess Lessons

Phone-first visual coaching for London, built from every public rated 3+0 game
in the source account:

- **Summary** — the default four-line answer: London System as White, Sicilian
  versus `1.e4` and `…d5` versus `1.d4` as Black, wins most often on time,
  losses most often include a loose piece, and one direct practice action.
- **Brilliant** — every independently verified sound sacrifice candidate, with
  the date, opponent, result, real offered piece, exact setup, plain-language
  idea, engine qualification, source game, and Lichess position.
- **Blunders** — one largest useful turning point per affected game, capped at
  30 instead of an overwhelming mistake dump.
- **Patterns** — six ranked recurring patterns and 18 full
  setup-to-punishment examples.

Chess.com's Published Data API does not include premium Game Review badges.
The Brilliant page is therefore explicit: these are Stockfish candidates based
on Chess.com's public criteria, not recovered private labels.

The default Summary is deliberately not a dashboard: four plain rows, one
button, and one sitting card. The three teaching views remain one prompt, one
board, one next action, the current move, and source links. The blunder title
never reveals the better move before the comparison.

## The sitting card

`When in a sitting London wins` replaced the earlier collapsed dated-line
dashboard (removed because reading four overlapping trend lines was work
without a decision attached). The card answers one question with one action:
how does the win rate move across a playing session, and when is the good
moment to stop?

- A **sitting** is a run of games with under an hour between them, computed
  from the PGN `EndDate`/`EndTime` headers by the data builder and emitted as
  the `sittings` block in `data/episodes.js` (schema
  `chess-sitting-summary/v1`). Nothing in the card is hand-maintained.
- One row per position in the sitting: games 1–6, then a pooled `Game 7+`
  tail so thin late-session samples are never shown as separate noisy bars.
- Bars at or above 60% render in full accent, the final row renders in ink
  when it falls under 40%, and the one-sentence read under the bars names the
  best stretch and the stopping point from the same data.

The hero's one training choice is based on the strongest loss-linked concrete
pattern across all games: serious loose-piece mistakes appeared in 54 of 63
losses and remain present in 14 of the latest 20 games.

The card is not the small practice curriculum. All 124 games are analyzed.
Practice contains 18 unique positions from 12 source games. Five source games
intentionally recur under two or three problem types, but the same position is
never duplicated just to fill another category.

## Runtime

This is a static ES-module app over precomputed, source-exact data. It uses the
official `@lichess-org/chessground@10.1.1` board in `viewOnly` mode, vendored
locally with its license and pinned hashes. There is no runtime engine,
framework, backend, login, analytics script, or CDN. A route-scoped service
worker atomically caches the complete PWA shell for offline use.
Navigation requests stay on the currently cached HTML during a worker upgrade,
so shared query/hash URLs cannot mix a new document with previous-version
assets before the atomic shell swap finishes.

## Build the data

```sh
uv run --with python-chess python scripts/chess/build_episode_report.py \
  --pgn data/chess/chesscom/londonsacrifice/games.pgn \
  --analysis data/chess/chesscom/londonsacrifice/analysis-180.json \
  --manifest data/chess/chesscom/londonsacrifice/manifest.json \
  --username londonsacrifice --display-name London --time-control 180 \
  --summary-profile london \
  --output data/chess/chesscom/londonsacrifice/episode-coach.json \
  --ui-output wisdom/londonsacrifice/data/episodes.js

uv run --with python-chess python scripts/chess/build_highlight_report.py \
  --pgn data/chess/chesscom/londonsacrifice/games.pgn \
  --analysis data/chess/chesscom/londonsacrifice/analysis-180.json \
  --username londonsacrifice --display-name London --time-control 180 \
  --verify-nodes 200000 \
  --output data/chess/chesscom/londonsacrifice/highlights.json \
  --ui-output wisdom/londonsacrifice/data/highlights.js
```

## Test and run

```sh
cd wisdom/londonsacrifice
npm install
npx playwright install chromium
npm test
```

Serve `wisdom/` and open
`http://127.0.0.1:8799/londonsacrifice/`. The app uses only local runtime
assets and reloads offline from its route-scoped cache.

The browser suite checks the default Summary and its practice handoff, then
walks every state of all 52 selected lessons at 390×844 and
844×390, checking overlap, clipping, horizontal overflow, board geometry,
44-pixel controls, and first-view access to the main action. It also checks the
sitting card's exact rows, tones, and read line at 320px and landscape, plus
320px/desktop lesson geometry, light/dark accessibility with axe-core, exact
source links, no remote runtime or unrelated-player leakage, hash navigation,
and offline reload. Python independently replays every displayed branch,
reconstructs every displayed fork, pin, and mate opportunity against the PGNs,
and regroups the sittings from the PGN end times.

## Production proof

The minimal UI shipped through
[PR #128](https://github.com/jerryshi042003/shishi88/pull/128), and the atomic
service-worker upgrade shipped through
[PR #129](https://github.com/jerryshi042003/shishi88/pull/129). On 2026-07-17,
all 12 live runtime-file hashes matched the reviewed build. A fresh Render
session confirmed the v6 cache, portrait and landscape layouts, query/hash
lesson links, offline reload, and zero browser warnings or errors.

The Brilliant-context and compact Progress pass shipped through
[PR #132](https://github.com/jerryshi042003/shishi88/pull/132) at main merge
`fc8d417`. Render served the exact 12 reviewed runtime files with the v8 cache.
A fresh production session verified all four Brilliant context records, the
four comparison rows and three major mistake families, clean 390×844 portrait
and 844×390 landscape layouts, hash navigation, a successful offline Progress
reload, no horizontal overflow, and no browser warnings or errors.

The learning dashboard shipped through
[PR #135](https://github.com/jerryshi042003/shishi88/pull/135) at main merge
`c643904`. Render served all 12 reviewed runtime files byte-for-byte with the
`londonsacrifice-v10` cache. A fresh production session verified both learning
modes and exact values at 390×844, the pin-to-practice handoff, the two-column
844×390 layout, offline Progress reload, zero clipping or horizontal overflow,
and a clean browser console.

The usefulness audit shipped through
[PR #139](https://github.com/jerryshi042003/shishi88/pull/139) at main merge
`16a162a8`. Render served all 12 reviewed runtime files byte-for-byte with the
`londonsacrifice-v12` cache. A fresh production session verified the v10 → v12
upgrade on the existing Progress route, all four Brilliant context records,
both learning modes, dated pattern handoff, 390×844 portrait, 844×390
landscape, offline reload, zero horizontal overflow, and a clean console.

The dated-timeline correction shipped through
[PR #142](https://github.com/jerryshi042003/shishi88/pull/142) at main merge
`50081027`. Render served all 12 reviewed runtime files byte-for-byte with the
`londonsacrifice-v13` cache. A live session first loaded its existing v12
Progress shell, then upgraded in place to v13 without losing the route. Fresh
390×844 checks verified the July 7–17 calendar axis, all 36 dated points, both
learning modes, sparse pin labeling, and the pin-to-practice handoff.

The useful Summary shipped through
[PR #146](https://github.com/jerryshi042003/shishi88/pull/146) at main merge
`864c0966`, deployed by Render as `dep-d9dd6urbc2fs73fbkmp0`. All 12 live
runtime files matched the reviewed build byte-for-byte with the
`londonsacrifice-v14` cache. The production browser upgraded a cached v13
Brilliant route in place without losing it; a fresh visit then opened Summary
by default. At 390×844 and 844×390, the four answer rows and loose-piece
practice action fit without horizontal overflow. The action opened the correct
three real positions, the dated history remained available behind its collapsed
disclosure, and the console stayed clean. Source, staged-public-tree, and live
runtime privacy scans were clear.

Related: [[projects/chess-opening-trainer|chess coach product history]] and
[[projects/chess-game-analysis|chess game analysis workflow]].
