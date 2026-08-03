# Testing standard

The rule this trainer is built on: **visibility is not proof.** A board bug once
shipped green because the tests only asserted that elements were visible and had
bounding boxes. The board was visibly broken anyway. So the standard here is to
verify what a human actually sees, and to *look at screenshots*, not just assert
on the DOM.

## The suite

`npm test` runs three stages (`package.json`):

1. **`test:data`** — a Python replay (`scripts/chess/test_londonsacrifice_coach.py`)
   that independently reconstructs every displayed line, fork, pin, and mate
   against the source PGNs. Guards that the generated data matches reality.
2. **`test:unit`** — `node --test tests/*.test.js`. Data invariants (schema,
   counts, the offline shell list and cache version) **and the classification
   audit** — that only `6 Nxe5` is Brilliant and the already-winning / not-best
   sacrifices are demoted (see [classification.md](classification.md)).
3. **`test:browser`** — Playwright, two projects (`playwright.config.js`):
   - **`functional-chromium`** (`tests/browser/move-gallery.spec.js`): tabs, the
     `#brilliant`/`#blunders` → Moves aliases, honest labels, exact source links,
     no horizontal overflow at 320/390/844, the drill, offline reload from the
     `v17` cache, and axe accessibility on Moves + Summary.
   - **`visual-webkit`** (`tests/browser/board-visual.spec.js`): the board /
     one-screen / navigation / classification checks, on **WebKit** for iOS
     fidelity.

## The visual matrix (WebKit)

`board-visual.spec.js` runs the coach across the full device matrix:

- **Devices:** iPhone 14 (390×844) and iPhone SE (375×667).
- **Orientation:** portrait and landscape.
- **Display mode:** browser and `display-mode: standalone` (installed PWA), the
  latter emulated by stubbing `matchMedia`. `prefers-reduced-motion` is forced so
  Chessground settles instantly and geometry is read from a final layout.

For every cell it asserts what the eye checks: the board is **square**;
coordinates are all present, seated in the gutter, never clipped by the frame,
never overlapping a piece; pieces are centred; there is no horizontal page scroll;
and on a phone the board + controls + rail stay on screen while only the notes
scroll (no page scroll). It also checks the classification is honest (the leading
move is Brilliant, a Blunder chip exists, an already-winning sacrifice is shown as
Best), that keyboard and rail navigation both work, and that desktop is a bounded
two-column layout — not a full-width board.

## How to run it

```sh
cd wisdom/londonsacrifice
npm install
npx playwright install chromium webkit   # first time
npm test                                  # full suite
npx playwright test board-visual --project=visual-webkit   # just the visual matrix
```

The Playwright `webServer` block starts a static server on `:8799` automatically.

## How to read the output

- Playwright's `line` reporter prints `N passed` / lists failures with the
  asserting line and the message (messages are written to say *what* broke, e.g.
  `file a must sit below the board`, `board must be square (331x366)`).
- Screenshots are written to `test-results/board-visual/` (git-ignored), one per
  matrix cell plus `desktop.png`.

## The rule: inspect the screenshots

Green assertions are necessary, not sufficient. Before calling a UI change done,
**open the screenshots** in `test-results/board-visual/` and look — at full
resolution, zooming into the board edges and coordinates — for overlap, clipping,
halos, or misalignment that the assertions might not encode. If you only ran
assertions, you are not done. A good regression test is one you can *prove* would
have caught the bug: run it against the broken version and watch it fail.

## When you change the app

- Any change to layout, the board, or Chessground config must pass the WebKit
  matrix, with screenshots reviewed.
- Bump `sw.js`'s `const CACHE` when a shell file changes; a unit test enforces the
  version string and that the `SHELL` list is complete and points at real files.
- Adding a runtime file means adding it to `sw.js`'s `SHELL` — which is also what
  publishes it to production (see [deploy.md](deploy.md)).
