# Content & editorial rules

This app has almost no free-standing copy; nearly all user-facing text is
*generated per move* from data. This document is what someone adding a new
opening line or move must read to make notes that match the existing standard.

## Where the text comes from

| Text | Source |
|------|--------|
| Move title, meta line | `headingCopy()` in `ui/main.js`, from the item's fields |
| Frame caption (`#step-caption`) | the `caption` field of each generated step |
| The six-field note (`#insight`) | `insightFor()` in `ui/main.js` |
| Classification badge + gloss | `CLASS_INFO` in `ui/classify.js` |
| Scale explainer | `renderScaleExplainer()` in `ui/main.js` |
| Summary / sitting / drill copy | the generated `data/*.js` + fixed labels |

The per-move *facts* — the engine eval, the sacrificed piece, the concrete line
(`reason`) — come from the Python data builders (see
[data-model.md](data-model.md)). The UI *frames* those facts; it does not invent
chess.

## The six things every move note must answer

The Moves view exists because a bare label ("Brilliant") tells the reader
nothing. Every move note answers six questions, rendered as labelled rows in
`#insight`. When you add or regenerate content, each must be concrete and
checkable — never vague praise.

1. **What the label means** — a plain-language gloss of the classification on
   chess.com, plus, when the move is *not* the top rung, the honest reason it
   was downgraded ("You were already winning (about +4.6) … so the sacrifice is
   just the cleanest path, graded Best"). Source: `CLASS_INFO[...].gloss` +
   `downgradeReason()`.
2. **Where you stood** — material and/or evaluation, stated as *up or down*, with
   the before/after eval and the material given up. The reader must never have to
   reconstruct whether they were winning. "You were clearly better (+1.8) before
   it and clearly better (+1.8) after — you give up the knight (~2 pawns)…"
3. **The goal here** — what the side was trying to achieve in this position (the
   motif + the position's question).
4. **What you got** — the concrete payoff: the exact line, the material won, the
   file opened, the eval shift. Never "strong" or "flexible" — a specific,
   verifiable outcome. This is the generated `reason`.
5. **How rare it is** — calibration: is this a genuine find or routine? Brilliant
   is "rare and hard to find"; Best is "good chess, not a highlight". Source:
   `CLASS_INFO[...].rarity`.
6. **Real find, or a gift?** — the distinction the reader most wants: was the
   move objectively strong, or did it only look good because the opponent erred?
   A near-best sacrifice is "genuinely strong … not gifted by [opponent]"; a
   mistake is "on you, not the opponent's brilliance — [best move] holds". For a
   move in a game that was still lost, the note says so.

If you add a line and cannot fill all six concretely from verified data, the fix
is to improve the *data* (the eval, the `reason`), not to write something vague
in the view.

## Editorial voice

- **Plain, second person, honest.** "You were winning." "This one is on you."
  Never congratulatory, never hedged into meaninglessness.
- **Concrete over descriptive.** Name the square, the file, the pawn, the eval.
  A note that could apply to any position is a failed note.
- **Never oversell a label.** The whole point of this app is that most moves are
  *not* brilliant. If a move does not meet the bar, say what it actually is and
  why — see [classification.md](classification.md).
- **Evals are read in words, not just numbers.** `evalPhrase()` maps centipawns
  to "about level", "a little better", "clearly better", "winning". Mate scores
  are never printed as a pawn count — a missed mate reads "let a forced mate slip
  away", not "cost 992.6 pawns".

## Fixed copy that must stay honest

- The **scale explainer** states that Brilliant requires a real sacrifice from a
  non-winning position, that quiet London moves can never earn it, and that the
  badge is "a gamification layer on an engine evaluation … not a verdict on your
  play." Do not soften this into marketing.
- The **provenance footer** states the labels are the app's transparent Stockfish
  reading of chess.com's public criteria, "not recovered premium badges," and
  links the official criteria. This is a truth-in-labelling requirement, not
  decoration.
