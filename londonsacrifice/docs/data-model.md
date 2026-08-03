# Data model

All content is precomputed into three ES-module files that export frozen objects.
**They are generated, never hand-edited** — the "how to add a line" answer is
"regenerate", not "edit the file".

```
data/episodes.js    export const EPISODE_REPORT   (schema chess-episode-coach/v2)
data/highlights.js  export const HIGHLIGHT_REPORT  (schema chess-highlight-report/v1)
data/puzzles.js     export const PUZZLE_SET        (the drill set)
```

## `HIGHLIGHT_REPORT` — the Moves corpus

Two arrays, both drawn from the player's real games:

- **`brilliantCandidates`** — sound sacrifice candidates. Per item:
  `id, game, gameId, date, opponent, side, result, moveNo, played, playedUci,`
  `cpLoss, scoreBefore, scoreAfter, offer{piece,square,material,kind}, motif,`
  `question, reason, cue, criteria, actual, line, bestDefense`.
  - `scoreBefore/scoreAfter` are centipawns **from the moving player's side**
    (positive = the player is ahead). `cpLoss` is loss vs the engine's best.
  - `offer.material` is the sacrificed value in centipawns (a knight ≈ 220).
  - `reason` is the concrete payoff line; `motif` is the tactic name.
- **`turningPointBlunders`** — one turning-point error per affected game. Per item:
  `id, game, gameId, date, opponent, side, result, moveNo, played, playedUci,`
  `best, lossCp, themes, kind, reason, actual, line`.
  - `lossCp` is the eval swing; `kind` names it (e.g. "allowed mate"); `best` is
    the move that held.

The UI builds `MOVES_CORPUS` (`ui/main.js`) by tagging each candidate
`group:'sac'` and each blunder `group:'miss'`, attaching a `klass` from
`ui/classify.js`, and sorting best-first. **Classification is computed in the UI,
not read from the data** — see [classification.md](classification.md).

### The `actual` / `line` shape (shared by every studied item)

- `actual.initialFen` — the starting position.
- `actual.anchorStep` — index of the key move within `actual.steps`.
- `actual.steps[]` — each half-move: `{ply, moveNo, actor, color, san, uci,`
  `fenBefore, fenAfter, caption, role}`.
- `line` (candidates) or `better` (blunders/episodes) — the proof / better line,
  same `{initialFen, steps[]}` shape.

`buildFrames()` in `ui/main.js` turns this into the linear frame list the stepper
walks: start → each `actual` step → the proof line.

## `EPISODE_REPORT` — Summary, Patterns, and metadata

Top-level keys include `summary`, `sittings`, `dashboard` (Summary view),
`patterns` + `episodes` (Patterns view), `games`, `record`, and counts
(`gamesReviewed`, `movesReviewed`, `seriousEpisodes`).

- **`patterns[]`** — `{id, name, question, study, rank, exampleIds, costPawns,`
  `appeared, costly, roiScore, ...}`. The rail in Patterns lists these; a
  pattern's `exampleIds` point into `episodes`.
- **`episodes[]`** — worked examples: `{id, date, opponent, side, moveNo, played,`
  `best, cost, phase, tags, details, lessons, question, actual, better, ...}`.
  `lessons[patternId]` gives the per-pattern framing.

## How to add or edit a line correctly

You do **not** edit `data/*.js`. You change the source and regenerate:

1. The source of truth is the account's PGNs + a Stockfish analysis file under
   `data/chess/chesscom/<username>/`. Adding games or re-analysing changes what
   the builders emit.
2. Regenerate with the Python builders (documented in the app README):
   - `scripts/chess/build_episode_report.py` → `data/episodes.js` — exact
     invocation (the username/time-control flags are NOT defaults):

     ```sh
     uv run --with python-chess python scripts/chess/build_episode_report.py \
       --pgn data/chess/chesscom/londonsacrifice/games.pgn \
       --analysis data/chess/chesscom/londonsacrifice/analysis-180.json \
       --manifest data/chess/chesscom/londonsacrifice/manifest.json \
       --username londonsacrifice --display-name London --time-control 180 \
       --summary-profile london \
       --output data/chess/chesscom/londonsacrifice/episode-coach.json \
       --ui-output wisdom/londonsacrifice/data/episodes.js \
       --puzzles-output wisdom/londonsacrifice/data/puzzles.js \
       --reviews-output wisdom/londonsacrifice/data/reviews.js
     ```
   - `scripts/chess/build_highlight_report.py` → `data/highlights.js`
   They need `uv run --with python-chess` and the analysis JSON.
3. If a build adds a **new runtime file**, add it to `sw.js`'s precache `SHELL`
   and bump `const CACHE` — that is what publishes it and upgrades the PWA (see
   [deploy.md](deploy.md)).
4. Run the tests (`npm test`). The unit test checks schema, counts, the SW shell,
   and the classification audit; if a rebuild changes the audit verdicts,
   re-reason them against [classification.md](classification.md) rather than
   blindly updating the expected values.

## To change how a note reads

The note text is composed in `insightFor()` from the data fields above (`reason`,
`offer`, `scoreBefore/After`, `motif`, `best`) plus `CLASS_INFO`. To change
*wording*, edit those functions. To change the *facts* a note can state, improve
the data builder so the fields carry them — never write unverifiable chess into
the view. The editorial contract is [content.md](content.md).
