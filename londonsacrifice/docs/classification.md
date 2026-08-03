# Move classification: the real rules

This is the reference that stops someone from "helpfully" re-adding inflated
labels. The model lives in `ui/classify.js`; this explains the criteria it
encodes, the sources, and why the London almost never produces a Brilliant.

## chess.com's scale (best → worst)

Brilliant (`!!`) · Great (`!`) · Best · Excellent · Good · Book · Inaccuracy
(`?!`) · Mistake (`?`) · Miss · Blunder (`??`).

- **Best → Blunder** are quantitative, from an **Expected Points Model**: win
  probability computed from the player's rating *and* the engine eval (1.0 = always
  winning, 0.5 = even). A move is graded by expected points lost vs. the best
  move. This app approximates it with centipawn loss.
- **Brilliant, Great, Miss, Book** are special labels layered on top, awarded by
  rule, not by threshold. This app models Brilliant/Best/…/Blunder; it does not
  claim Book or Miss.

## Brilliant (`!!`) — the exact bar

From chess.com's own support doc, a Brilliant requires **all** of:

1. **A real piece sacrifice.** This is the load-bearing rule — no sacrifice, no
   Brilliant. (In the opening/middlegame it may be one of several good moves; in
   the endgame it must be the only good one.)
2. **Not a bad position after it** — the sacrifice must be sound, not desperation.
3. **You must not already be completely winning** — chess.com's wording is that
   you should not be winning even if you hadn't found the move.
4. **Best or near-best.**
5. **Rating-sensitive** — chess.com is deliberately *more generous* about what
   counts as a sacrifice for lower-rated players. The same move can be Brilliant
   for one player and merely Best for another.

**Great (`!`)** is about *criticality*, not sacrifice: the single move that turns
losing into equal or equal into winning, or the only good move. If your best move
is a sound sacrifice → Brilliant; if it is the only move that holds, with no
sacrifice → Great.

## Why quiet London moves can never be Brilliant

A Brilliant requires giving up material in a competitive position. The London's
characteristic moves — `Bf4`, `e3`, `c3`, `Nbd2`, `h3`, `Be2/Bd3` — are quiet
developing moves that sacrifice nothing. Under the real criteria they can be
**Best**, **Excellent**, or **Book**, and occasionally **Great** (if one happens
to be the single critical move), but they **cannot** be **Brilliant**. A London
player going many games without a Brilliant is the classifier working correctly,
not weak play — Brilliant is a tactical-sacrifice award and the London is a
positional system.

The honest exception: a London can transpose into a sharp middlegame where a real
sacrifice appears (a piece sac, a Greek-gift `Bxh7+`), and *that* move can be
Brilliant. The claim is precise — the quiet setup moves cannot be, not that a
London game can never contain one.

## What this app actually enforces

`ui/classify.js` grades from Stockfish eval data with thresholds **deliberately
stricter than the data builder's defaults**, because chess.com's real bar is
tighter than a naive "engine liked it":

```
nearBestCp:        30    // Brilliant/Best must essentially be the engine's move
alreadyWinningCp: 300    // >= +3.0 counts as "already completely winning"
playableFloorCp: -150    // must not be losing after the move
minSacrificeCp:   100    // a real sacrifice gives up at least ~a minor's worth
```

`classifyCandidate(item)` awards **Brilliant** only if the move offers ≥ a minor
piece of material, is within 30cp of best, the eval before it was under +3.0, and
it is not losing after. Otherwise it grades by centipawn loss (Best ≤ 10, Excellent
≤ 40, Good ≤ 90, …). `classifyMistake(item)` grades the turning-point errors
(Blunder / Mistake / Inaccuracy), treating an allowed/missed mate as a Blunder.

`downgradeReason()` produces the honest one-line audit shown in the note when a
sacrifice does *not* reach Brilliant ("You were already winning (about +4.6) …
graded Best").

### ⚠️ The builder is more lenient than the UI

`scripts/chess/build_highlight_report.py` still emits `nearBestCp: 80` and
`alreadyWinningCp: 700` — loose enough to mint inflated "Brilliants". The UI
**reclassifies** every move through `classify.js`, so the loose builder labels
never reach the user. If you regenerate the data (e.g. against a different
account), either tighten the builder to match these thresholds *or* keep the UI
reclassification. Do not let the builder's raw labels drive what the user sees.

### Sacrifice detection: offers must be near-clean captures

`sacrifice_offer()` recognises two kinds of offer: a **direct** offer (the moved
piece itself can be captured) and a **discovered** offer (the move leaves one of
the mover's *other* pieces en prise). A discovered offer only counts when the
piece is genuinely, nearly cleanly winnable — its static-exchange gain must be
within ~a pawn of its own value (`gain ≥ PIECE_VALUE − 120`). Without that guard
a quiet pawn push that leaves a higher-value piece merely *loosely* winnable is
misread as a sacrifice: `9…b5` (attacking the queen) was minting a fake "rook
offer" from the a8 rook's ~170cp exchange gain on a 500-value rook, which the
classifier then read as Brilliant. The guard drops the artifact while keeping
real full-value offers. Regression: `scripts/chess/test_highlight_builder.py`.

## The audit that this encodes

Applied to the four sacrifice candidates in the current data, only one is a real
Brilliant:

| Move | Eval before | cpLoss | Verdict | Why |
|------|-------------|--------|---------|-----|
| `6 Nxe5` | +1.8 | 3 | **Brilliant** | real knight sac, near-best, not already winning |
| `20… Nxd2` | +4.6 | 0 | **Best** | already completely winning → fails rule 3 |
| `34 Bxf6` | +5.9 | 0 | **Best** | already completely winning → fails rule 3 |
| `14… Nxd5` | +1.3 | 48 | **Good** | not near-best (eval dropped) → fails rule 4 |

This table is locked by a unit test (`tests/move-gallery.test.js`). If a data
rebuild changes these verdicts, re-reason them against the rules above — do not
just update the test to match new output.

## Sources

- **Primary:** chess.com support — *How are moves classified?*
  `https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc`
- chess.com blog — *Science of Chess: what makes a move seem "Brilliant"* (notes
  the older depth-based algorithm vs. the current sacrifice-based one).
- chess.com article — *How to play a brilliant move* (phase-dependent nuance).
- Community threads document that the label is widely seen as inflated/inconsistent
  — which is why the app frames it as flavour, not a verdict.

Two honest caveats to keep: the exact internal test for "is this a *real*
sacrifice" is undocumented and known to misfire, and the criteria have changed
over time (depth-based → sacrifice-based). The app presents the sacrifice rule as
the operative definition and does not pretend the thresholds are official.
