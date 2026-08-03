# London Trainer — documentation

The London Trainer is a phone-first, installable PWA that teaches one player's
London System chess through their real games: how their moves would be graded on
chess.com's scale, and where the recurring mistakes are. It ships as a static
site with no backend, no login, and no runtime engine — everything is precomputed
data plus a view-only board.

This directory is the durable reference for the app. Read it in this order:

1. **[architecture.md](architecture.md)** — what the app is, how it's built, and
   *why* the significant decisions were made. Start here.
2. **[ui.md](ui.md)** — every UI element: what it is, its states, and how it
   behaves across desktop / mobile / installed PWA, including the full
   navigation model (step, skip, the classification rail, keyboard).
3. **[content.md](content.md)** — every piece of user-facing text, where it comes
   from, and the editorial rules. The six things every move note must answer.
4. **[visual.md](visual.md)** — the layout system, breakpoints, the one-screen
   constraint and exactly how it is enforced, board sizing math, safe areas, the
   iPhone SE case, and the classification colour / badge system.
5. **[classification.md](classification.md)** — chess.com's move-classification
   criteria, the sources, the rules this app applies, and why quiet London moves
   can never be Brilliant.
6. **[data-model.md](data-model.md)** — how games, moves, notes, lines, and
   classifications are structured, and how to add or edit one correctly.
7. **[testing.md](testing.md)** — the Playwright/WebKit test matrix, how to run
   it, how to read the output, and the rule that screenshots are inspected, not
   just asserted on.
8. **[deploy.md](deploy.md)** — how the app reaches production through the shared
   `wisdom-reader` Render service, and how to diagnose a failed deploy.

## Where things live

```
wisdom/londonsacrifice/
  index.html          markup + the tab/view skeleton
  ui/main.js          all behaviour (views, navigation, rendering)
  ui/classify.js      the honest move-classification model (pure, tested)
  ui/styles.css       the full design system and responsive layout
  sw.js               service worker + the precache SHELL (source of truth for
                      what ships — see deploy.md)
  data/episodes.js    generated: games, pattern episodes, summary, sittings
  data/highlights.js  generated: sacrifice candidates + turning-point mistakes
  data/puzzles.js     generated: the drill puzzle set
  vendor/             pinned Chessground board (view-only)
  tests/              unit (node) + browser (Playwright) specs
  docs/               this documentation
```

The `data/*.js` files are **generated** by Python builders in `scripts/chess/`
from the source account's PGNs and Stockfish analysis; they are not edited by
hand. See [data-model.md](data-model.md).

## Known limitations

- **The trainer studies real games, not a canonical opening tree.** "Lines" are
  excerpts from played games, so it does not present a branching book of London
  theory or transpositions. Adding an opening-tree view would be a new data
  source, not an edit to the existing one. This is a deliberate scope choice
  (the app's value is *your* moves, honestly graded), documented in
  [architecture.md](architecture.md).
- **Move notes are composed from verified engine data, not hand-authored prose.**
  This keeps every claim checkable and avoids inventing chess analysis, at the
  cost of the notes reading a little formulaic. The editorial contract in
  [content.md](content.md) is what keeps them useful.
- **Classification labels are the app's own transparent reading of chess.com's
  public criteria**, computed from Stockfish evals — not recovered premium Game
  Review badges, which the Published Data API does not expose. The app says so.
