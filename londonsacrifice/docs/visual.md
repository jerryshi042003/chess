# Visual & layout system

All values are in `ui/styles.css`. The design language is warm paper (`--canvas`
`#fffdf7`), near-black ink, one orange accent (`--accent` `#ff5a1f`), a hairline
rule colour, and a full dark-mode palette via `@media (prefers-color-scheme:
dark)`. Colours are CSS variables so dark mode is a variable swap.

## Breakpoints

| Query | Purpose |
|-------|---------|
| base (no query) | portrait phone: `.experience` is a flex column |
| `max-width: 699px` | **portrait one-screen lock** for the coach views |
| `max-width: 480px` | masthead stacks (title + tabs full width) |
| `min-width: 760px and min-height: 520px` | **desktop/tablet two-column** |
| `orientation: landscape and max-height: 500px and min-width: 700px` | **landscape one-screen lock** |
| `prefers-color-scheme: dark` | dark palette + dark classification tones |
| `prefers-reduced-motion: reduce` | disables animation |

The two "lock" queries and the desktop query are mutually exclusive by
dimension, so a viewport matches exactly one layout regime.

## The one-screen constraint — how it is enforced

On coach views (`Moves`, `Patterns`) the page must not scroll: the board, step
controls, and rail stay visible while only the notes scroll. Enforcement, in the
portrait (`max-width: 699px`) and landscape locks:

```css
html[data-view="moves"] body,
html[data-view="patterns"] body { height: 100dvh; overflow: hidden; }
```

The body is locked to the viewport and page scroll is disabled. Inside it a flex
chain fills exactly that height:

- `.shell` → `display:flex; flex-direction:column; height:100%`
- `.coach` → `flex:1; min-height:0; display:flex; flex-direction:column`
- `.experience` → `flex:1; min-height:0; overflow:hidden`
- heading, `.board-column`, `.item-nav` → `flex:0 0 auto` (pinned)
- `.lesson` → `flex:1; min-height:46px; overflow-y:auto` (the only scroller)

`min-height:0` on the flex parents is load-bearing: without it, flex items refuse
to shrink below their content and the column overflows. `overflow:hidden` on
`.experience` guarantees a tall board clips rather than overlapping the notes.

Non-coach views (Summary, Drill) are **not** locked — they scroll normally,
because they have no board-plus-controls that must stay together.

## Board sizing math

The board is always a perfect square, enforced on the board element itself, not
the frame:

```css
.cg-wrap { width: 100%; height: auto; aspect-ratio: 1; }
```

`aspect-ratio` on the board (rather than the padded frame) avoids a real bug: a
percentage `height:100%` inside a padded, aspect-ratio parent resolves against the
padding box inconsistently across engines and produces a non-square board. Owning
the ratio on the board sidesteps it.

The frame's *width* is what changes per regime, and it is deliberately capped so
the notes always have room:

- **Portrait phone:** `width: min(100%, calc(100dvh - 470px)); min-width: 200px`.
  The board is capped by *available height*: reserve ~470px for masthead +
  heading + controls + rail + a usable notes band + safe areas, and give the rest
  to the board. On a tall phone it is width-bound (~366px on a 390px screen); on a
  short phone it is height-bound.
- **The iPhone SE case (375×667):** `calc(100dvh - 470px)` ≈ 197px, so the
  `min-width: 200px` floor applies and the board is 200px. This is small on
  purpose. On a 667px-tall screen you cannot fit masthead + heading + a large
  board + controls + rail + readable notes; the product decision is that
  *everything visible* beats a big board, so the board yields. The notes below it
  scroll internally. On taller phones the board is comfortably larger.
- **Desktop:** two columns, `board-frame width: min(100%, 62vh)` inside a
  `minmax(0, 520px)` column — bounded so the board never balloons to full page
  width (a real regression that this cap fixes). The page may scroll normally.
- **Landscape phone:** `width: min(100%, calc(100dvh - 116px))` — sized to the
  (short) viewport height, board left, controls stacked beside it.

## Coordinates (chess.com convention)

The old matte gutter is gone: coordinates now live *inside* the corner
squares, exactly like chess.com — rank digits in the top-left corner of the
left column, file letters in the bottom-right corner of the bottom row,
colored like the opposite square, painted beneath the pieces (`.sq-coords`
overlay, z-index 1; chessground pieces are z-index 2). Chessground's own
coordinate rendering is disabled; `makeBoard` injects a 16-span overlay and
`setCoordsOrientation` relabels it when the board flips. Placement, tones,
and containment are asserted per square by the visual test (see
[testing.md](testing.md)); the full board contract is
`wisdom/chess-coach/docs/ux-spec.md` §1.

## Safe areas

The body padding uses `env(safe-area-inset-*)` via
`max(<baseline>, var(--safe-*))`, so on a notched phone in standalone the content
clears the notch and home indicator. The `viewport-fit=cover` meta and the
`--safe-*` variables in `:root` wire this up. The one-screen `100dvh` lock uses
dynamic viewport height so it accounts for mobile browser chrome.

## Classification colour / badge system

Each classification has a tone class (`.tone-*`) used on three surfaces: the note
chip (`#class-chip`), the rail chips, and the explainer rungs.

| Class | Badge | Tone | Meaning (short) |
|-------|-------|------|-----------------|
| Brilliant | `!!` | teal | sound sacrifice, best, not already winning |
| Great | `!` | blue | the one critical move (not necessarily a sacrifice) |
| Best | — | green | the engine's top move |
| Excellent | — | green | keeps essentially all the advantage |
| Good | — | green | fine, but the engine had clearly better |
| Inaccuracy | `?!` | amber | a small slip |
| Mistake | `?` | red | a real error |
| Blunder | `??` | red | throws away material or the game |

Light-mode tones are pale fills with dark ink; dark mode overrides them with
muted dark fills and light ink (same hue family). The full definitions are
`CLASS_INFO` in `ui/classify.js`; the meanings are the honest chess.com criteria
in [classification.md](classification.md).
