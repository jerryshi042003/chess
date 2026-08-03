# Architecture & rationale

## What the app is

A static, phone-first PWA that teaches one chess player their own London System
games. It has four views (tabs):

- **Summary** — a four-line read on how this player's London performs, a session
  ("sitting") win-rate card, and an over-time trend. The default view.
- **Moves** — the centrepiece. Every notable move from the player's games —
  sound sacrifices and turning-point mistakes — graded across chess.com's real
  classification scale, with a six-field explanation of each. This is the honest
  answer to "was that move actually good?"
- **Patterns** — six recurring mistake patterns, each with worked example
  positions from real games.
- **Drill** — an unlimited puzzle trainer built from the player's real mistakes.

## How it's built

- **No backend, no login, no runtime engine, no framework, no CDN.** Everything
  is precomputed data plus DOM rendering. This is a deliberate constraint: the
  app must load and run entirely offline from a service-worker cache, and must
  never require credentials on the phone.
- **Data is generated, not authored.** `scripts/chess/build_episode_report.py`
  and `build_highlight_report.py` consume the source account's PGNs and a
  Stockfish analysis file and emit `data/episodes.js` and `data/highlights.js`.
  The UI never edits these. See [data-model.md](data-model.md).
- **The board is vendored Chessground** (`@lichess-org/chessground`, pinned with
  a hash-checked license) in `viewOnly` mode. A unit test pins the exact release
  hashes.
- **`ui/main.js`** holds all behaviour; **`ui/classify.js`** is a pure, tested
  module that assigns honest classifications; **`ui/styles.css`** is the whole
  design system.

## The significant decisions, and why

### Classification over "Brilliant"

The app used to have a **Brilliant** tab that asserted certain moves were
brilliant without justifying it, and a separate **Blunders** tab. Both are gone,
folded into one **Moves** view that grades every notable move across the full
chess.com scale (Brilliant → Best → … → Blunder), ordered best-first.

Why: "Brilliant" is one rung on a scale, not a goal, and chess.com's real bar for
it is narrow (a sound sacrifice, from a non-winning position — see
[classification.md](classification.md)). Presenting the whole scale is honest
pedagogy: it lets the app show that a flashy move was actually just *Best*, or
that a "brilliant" was only good because the opponent had already erred. A
single-rung tab could not teach that. The audit that motivated this found that
three of the four moves previously labelled Brilliant do not meet the real bar.

### Notes composed from verified data, not authored prose

Each move's six-field note is built in `insightFor()` (`ui/main.js`) from the
generated data — the engine eval, the sacrificed material, the `reason` line the
Python builder produced from the actual game. The UI does **not** write new chess
analysis.

Why: authored chess prose is exactly the kind of content that reads well and is
wrong. Every claim in a note must be checkable against the engine and the game.
The cost is that notes read a little formulaic; the editorial contract in
[content.md](content.md) is what keeps them concrete and useful within that
constraint. If richer prose is ever wanted, it should come from the data builder
(where it can be verified), not the view.

### Sequential navigation, not dropdowns

Navigation is step-and-skip: `‹ / ›` step through a line move by move,
`◀ / ▶` (and a colour-coded rail) jump between moves/lines, with full keyboard
support. The old UI used `<select>` dropdowns.

Why: studying chess is inherently sequential — you walk a line forward and back,
then move to the next one. A dropdown is a random-access control for a
sequential task; it hides the set, needs two taps to advance, and gives no sense
of position. The rail shows the whole set at once, colour-coded by classification
so the scale is visible at a glance. See [ui.md](ui.md) for the full model.

### One-screen lock with an internal note scroll

On phones the board, step controls, and rail stay pinned to the viewport; only
the notes scroll, internally. The board is capped by available height so the
notes always keep a usable band.

Why: a chess trainer is unusable if you have to scroll the page to see the board
and act on it. The position and the controls must be simultaneously visible. The
notes can be long, so they get their own scroll rather than pushing the board off
screen. The exact enforcement and the board-sizing math are in
[visual.md](visual.md).

### Real games, not an opening tree (known limitation)

The app studies played games, not a canonical London book. "Lines" are game
excerpts. It deliberately does not model transpositions or a branching theory
tree.

Why: the app's value proposition is *your* moves, honestly graded — feedback you
cannot get from a generic opening book. A theory tree is a different product with
a different data source. This is a scope choice, not an oversight; adding a tree
would be new data, not an edit to the existing model.

## The build/deploy coupling

The app ships through the shared `wisdom-reader` Render build. The one thing to
internalise before adding a file: **the service-worker precache SHELL in `sw.js`
is the source of truth for what ships** — the deploy manifest derives from it, and
the offline cache depends on it. Adding a runtime file means adding it to the
SHELL (and bumping the cache version). [deploy.md](deploy.md) explains the whole
pipeline and how to diagnose a failure.
