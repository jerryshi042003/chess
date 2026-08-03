# UI reference

Every interactive element, its states, and its behaviour across desktop, mobile
browser, and installed PWA (standalone). IDs refer to `index.html`; behaviour
lives in `ui/main.js`.

## Global chrome

### Tab bar (`.tabs`)
Three buttons: **Summary** (`data-view="summary"`), **Drill**
(`data-view="drill"`), **Review** (`data-view="review"`).

- **States:** the active tab has `aria-pressed="true"` and the accent fill.
- **Interaction:** click/tap switches tab and sets the URL hash. Hashes are
  shareable and restored on load.
- **Legacy hashes:** `#moves`, `#brilliant`, `#blunders` → Review (best-moves
  face); `#counts` → Review (by-game face); `#learn`, `#patterns` → Drill
  (`#patterns` opens the worked-examples face); `#progress` → Summary.
- **Default:** with no hash, the app opens on **Summary**.
- **Faces:** Drill has two faces (puzzles / worked-examples coach with a
  "Back to puzzles" topbar); Review has two (best & worst / by game),
  switched with the `#coach-topbar` chips.
- **Shared source:** this app is generated from `wisdom/chess-coach/src` —
  edit there and run `scripts/chess/sync_coach_ui.mjs`; `ui/profile.js` is
  the per-player config.

## The coach (Review best-moves face + Drill worked examples)

Both faces share one coach layout: a heading, the board, step controls,
the move rail, and the notes. Summary and Drill are separate views (below).

### Position heading (`.position-heading`)
- `#position-meta` — the context line. In Moves:
  `1/34 · Brilliant !! · Jul 15, 2026 · lost as White vs Scheherazade_24`
  (index, classification badge, date, result, opponent). In Patterns:
  `#1 · 3/5 · … · White vs …` (pattern rank, episode index).
- `#position-title` — the move (`6 Nxe5`) or pattern name.
- `#position-question` — the prompt for the position.
- **State:** `aria-live="polite"`; updates when the move or step changes.

### Board (`#board`, inside `.board-frame`)
A view-only Chessground board built by the shared `makeBoard` factory — every
board in the app (coach, drill, walker) is visually and behaviorally the same
component. The full board contract (chess.com parity, measured values) is
`wisdom/chess-coach/docs/ux-spec.md` §1.

- **Theme:** chess.com green (`#EBECD0`/`#739552`); yellow `#FFFF33` at 0.5
  for selection and last-move squares.
- **States:** shows the position for the current *frame* (see navigation). The
  last move is highlighted; a coloured arrow marks the key move (green for a
  strong move, red for a mistake, blue for the reply) — arrows are analysis
  language and appear only in analysis surfaces (and hint stage 2).
- **Coordinates:** chess.com convention — rank digits inside the top-left
  corner of the left column, file letters inside the bottom-right corner of
  the bottom row, colored like the opposite square, painted beneath the
  pieces.
- **Interaction:** none directly — it is a display. Stepping is done with the
  controls below. On the Drill board (`#drill-board`) pieces move.
- **Responsive:** always a perfect square; the drill/walker boards run
  full-bleed (edge to edge) on phones ≤500px, chess.com style.

### Step controls (`.board-controls`)
Three elements under the board: `‹` (`#step-prev`), a stage label
(`#stage-label`), `›` (`#step-next`).

- **What they do:** step **backward / forward through the current line**, one
  half-move (frame) at a time. `#stage-label` reads e.g. `The move · 5/14`
  (stage name · position in the line).
- **States:** `#step-prev` is `disabled` at the first frame; `#step-next` is
  `disabled` at the last. `#step-next` carries the accent fill (it is the primary
  forward action).
- **Interaction:** click/tap; or the **← / →** arrow keys anywhere on the coach.
- **Frames:** a line's frames are the start position, each half-move of the
  played sequence (setup → the key move → the reply → the aftermath), then the
  proof/better line. Loading a move lands you on the key-move frame, so the
  classification and insight show immediately; step back for the setup, forward
  for the consequence and the proof.
- **Responsive:** a horizontal row on portrait; a vertical stack beside the board
  in landscape.

### Move rail (`.item-nav`)
`◀` (`#item-prev`), a horizontally scrolling chip strip (`#item-rail`), `▶`
(`#item-next`).

- **What it is:** the set of things to study in this view. In **Moves**, one chip
  per move (`6 Nxe5`, `20… Nxd2`, …), colour-coded by classification (teal
  Brilliant, green Best/Excellent/Good, amber Inaccuracy, red Mistake/Blunder).
  In **Patterns**, one chip per pattern (`1. Loose pieces`, …).
- **States:** the current chip has `.active` (accent fill) and `aria-selected`,
  and is auto-scrolled into view.
- **Interaction:**
  - Tap a chip → load that move (Moves) or that pattern's first episode
    (Patterns).
  - `◀ / ▶` buttons, or **↑ / ↓** (or `[` / `]`) keys → previous / next item.
    In Patterns this steps through the episodes of the current pattern.
  - The strip scrolls horizontally by touch/trackpad; chips never wrap.
- **Why a rail, not a dropdown:** it shows the whole set and its classifications
  at once, and advancing is one action. See [architecture.md](architecture.md).

### Notes (`.lesson`)
The scrolling explanation panel. Contains, in order:

- `#class-chip` + `#move-label` — the classification badge (`Brilliant !!`,
  `Best`, `Blunder ??`) and the move. The chip is hidden on frames before the key
  move and in Patterns.
- `#step-caption` — a one-line caption for the current frame.
- `#insight` — a definition list, the six-field note (Moves) or the pattern note
  (Patterns). This is the heart of the content; its editorial rules are in
  [content.md](content.md).
- `#source-links` — `Lichess board ↗` (opens the position for analysis) and
  `Chess.com game ↗` (the real game). Both open in a new tab.
- `#scale-explainer` — a collapsible `<details>` (Moves only) explaining what the
  labels mean on chess.com and that they are a gamification layer, not a verdict.
  Contains the official criteria link.
- **Scroll behaviour:** on a phone this panel is the *only* thing that scrolls;
  the board and controls stay pinned. On desktop it sits in the right column.

## Summary view (`#progress-view`)
Read-only, deliberately compact. Four cards in per-profile order, each next
to what it relates to:

- **Openings** — top-3 opening families per color by NAME (builder
  `openings` block; families collapse at the first type-word so "Queens Pawn
  Opening Accelerated London System 4...c5" groups under "Queens Pawn
  Opening"), each with games and a real W–L–D record, plus a "+N more across
  M openings" scatter line.
- **Mistakes** — every pattern compared (ranked bars, tap one to open the
  Drill pre-filtered), a phase strip (share of mistakes in opening /
  middlegame / endgame), and one focus read-line.
- **Change** — this-week-vs-before rows (first 20-game window vs the
  latest): mistake games per category and found-chance rates, with direction
  arrows.
- **Rhythm** — the sitting card (win rate by game number within a sitting).

The masthead carries `.profile-switch`, one labeled `⇄ Jerry` button that
switches people. League is deliberately separate: a quiet
`Compare players →` link appears below the tabs on Summary only. No board, no
stepping; scrolls normally (not one-screen-locked).

## Drill view (`#drill-view`)
An interactive puzzle trainer with chess.com's exact board behavior
(`wisdom/chess-coach/docs/ux-spec.md` §2.2 is the full element-by-element
contract).

- **Filter chips** (`#drill-filters`) — priority order: the ★ recommended
  pattern first, `All` (default) second, the rest by puzzle count, `Punish
  the blunder` last.
- **Board first** (`#drill-board`) — full-bleed on phones. On load the
  opponent's last move *animates in* and leaves the yellow from/to highlight
  (no arrow). Tap a piece → legal-move dots (ring on captures) from the
  builder's `dests` map; click-click and drag both work; illegal squares
  refuse the piece.
- **Instruction card** (under the board): `#drill-question` — `White to move —
  <situation-true task>`; `#drill-context` — what they played, what you
  answered in the game and its cost; `#drill-meta` — index, opponent, move,
  and the SRS `Review — you missed this one` flag.
- **Wrong move** — chess.com's model: the move stays briefly with red from/to
  fills and a corner ✗ badge, `Retry` appears (auto snap-back after 1.4s).
- **Hint** — two stages: first press paints the piece's square teal, second
  (`Show move`) draws the orange arrow; you still play the move yourself.
  Seeing the move grades as a lapse; the nudge alone is free. Works on every
  step of the line, not just the first move.
- **Step-play** — after your correct move the reply animates and you play the
  next move of the line yourself; no auto-walk. Captions narrate each step.
- **Sources** — `My games · N` (every serious mistake) and `Fresh · N`
  (curated lichess CC0 tactics for the same weak patterns, rated to the
  player's band, `data/fresh.js` from `scripts/chess/build_fresh_puzzles.py`).
- **Next →** — reads `Skip →` before the puzzle is done.
- **Solve** — the better line auto-plays with captions and a green ✓ badge on
  the final square; the post-solve card gives the answer in words + game link.
- **Stats** — solved-today / all-time + `Keep missing:` weak-motif line.
- **Misses come back:** a lapsed puzzle re-enters the session queue and the
  SM-2 schedule brings it back ~10 minutes later.
- **Sound** — synthesized move/capture/wrong/solve feedback, chess.com-style.

## Selection surfaces (Moves and Patterns)

- **Moves class chips** (`#moves-filters`) — All / Brilliant !! / Best / … /
  Blunder ?? with counts; filters the rail by classification.
- **Patterns priority list** (`#pattern-priority`) — the six patterns ranked by
  cost with bars ("N costly moments · M of 124 games"); tapping one loads its
  examples. On phones it compacts to pill chips; in one-screen landscape both
  rows are hidden and the rail falls back to pattern chips (see styles).

## Keyboard model (coach views)

| Key | Action |
|-----|--------|
| `←` / `→` | step backward / forward through the line |
| `↑` / `↓` | previous / next move or line |
| `[` / `]` | previous / next move or line |

Keys are ignored when focus is in an input/select/textarea, and when a modifier
(⌘/Ctrl/Alt) is held, so browser shortcuts are unaffected.

## Cross-surface summary

- **Desktop:** two columns — board left (bounded, never full-width), heading +
  rail + notes right. Page scrolls normally. Arrow keys drive navigation.
- **Mobile browser & installed PWA (standalone):** one column, viewport-locked —
  board + controls + rail pinned, notes scroll internally, no page scroll. Safe-
  area insets are respected. Large tap targets (≥44px). Identical between browser
  and standalone except that standalone honours the display-mode media query and
  safe-area insets.
- **Landscape phone:** board left, controls stacked beside it, heading + rail +
  notes right, viewport-locked with the notes scrolling.
