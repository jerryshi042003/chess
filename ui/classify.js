/* GENERATED from wisdom/chess-coach/src/classify.js — edit there and run scripts/chess/sync_coach_ui.mjs */
// Honest chess.com-style move classification from Stockfish eval data.
//
// Grounded in chess.com's own published criteria
// (https://support.chess.com/en/articles/8572705). The load-bearing facts:
//   - Brilliant (!!) requires a REAL piece sacrifice, that is also best/near-best,
//     AND you must NOT already be completely winning, AND not be lost after it.
//   - Great (!) is about criticality (the only move), not sacrifice.
//   - Best/Excellent/Good/Inaccuracy/Mistake/Blunder come from how much the move
//     gave up vs. the engine's best (an Expected-Points model; we approximate it
//     with centipawn loss).
//   - The label is a gamification layer on top of an engine eval, deliberately
//     more generous for lower-rated players — not a measure of objective best play.
//
// Quiet positional moves (the London's Bf4/e3/c3/Nbd2/h3) sacrifice nothing, so
// they can never be Brilliant no matter how theoretically important. This model
// makes that honest: it only awards Brilliant to a sound, non-winning sacrifice.

export const SCALE_ORDER = [
  'brilliant', 'great', 'best', 'excellent', 'good',
  'inaccuracy', 'mistake', 'blunder',
];

export const CLASS_INFO = {
  brilliant: {
    label: 'Brilliant', symbol: '!!', tone: 'brilliant',
    gloss: 'A sound piece sacrifice that is also the best (or near-best) move — and only when you were not already winning. This is the one rung the London almost never reaches.',
    rarity: 'Rare and hard to find — a genuine tactical resource, not routine.',
  },
  great: {
    label: 'Great', symbol: '!', tone: 'great',
    gloss: 'The single move that held or won the game — critical, though not necessarily a sacrifice.',
    rarity: 'Uncommon — it shows up at real turning points.',
  },
  best: {
    label: 'Best', symbol: '', tone: 'best',
    gloss: "The engine's top move. Strong and correct, but ordinary enough that chess.com gives it no special badge.",
    rarity: 'Routine for a strong move — good chess, not a highlight.',
  },
  excellent: {
    label: 'Excellent', symbol: '', tone: 'good',
    gloss: 'Nearly the best move — it keeps essentially all of your advantage.',
    rarity: 'Common in a well-played game.',
  },
  good: {
    label: 'Good', symbol: '', tone: 'good',
    gloss: 'A reasonable move that keeps the game on track, but the engine had a clearly better one.',
    rarity: 'Everyday move — fine, not special.',
  },
  inaccuracy: {
    label: 'Inaccuracy', symbol: '?!', tone: 'warn',
    gloss: 'A small slip — it hands back some of your edge without losing the game.',
    rarity: 'Very common; the cheapest kind of error to fix.',
  },
  mistake: {
    label: 'Mistake', symbol: '?', tone: 'bad',
    gloss: 'A real error that changes the assessment — the opponent gets a meaningful chance.',
    rarity: 'Common, and the most useful class to drill.',
  },
  blunder: {
    label: 'Blunder', symbol: '??', tone: 'bad',
    gloss: 'A move that throws away decisive material or the game outright.',
    rarity: 'The costly ones — usually one or two decide a game.',
  },
};

// Centipawn thresholds. These are deliberately stricter than the data builder's
// old defaults (nearBestCp 80, alreadyWinningCp 700), which let quiet-but-winning
// positions mint "Brilliant". Chess.com's real bar is tighter, so ours is too.
export const THRESHOLDS = {
  nearBestCp: 30, // Brilliant/Best must essentially be the engine's move
  alreadyWinningCp: 300, // >= +3.0 counts as "already completely winning"
  playableFloorCp: -150, // must not be losing after the move
  minSacrificeCp: 100, // a real sacrifice gives up at least ~a minor's worth
};

// Classify a positive-side candidate (a move the player found), from its eval
// data: { cpLoss, scoreBefore, scoreAfter, offer? }. Scores are centipawns from
// the moving player's perspective (positive = the player is ahead).
export function classifyCandidate(item, t = THRESHOLDS) {
  const material = item.offer?.material ?? 0;
  const isSacrifice = material >= t.minSacrificeCp;
  const nearBest = item.cpLoss <= t.nearBestCp;
  const notAlreadyWinning = item.scoreBefore < t.alreadyWinningCp;
  const playableAfter = item.scoreAfter >= t.playableFloorCp;

  if (isSacrifice && nearBest && notAlreadyWinning && playableAfter) return 'brilliant';

  // Not Brilliant — grade by how close to best it was.
  if (item.cpLoss <= 10) return 'best';
  if (item.cpLoss <= 40) return 'excellent';
  if (item.cpLoss <= 90) return 'good';
  if (item.cpLoss <= 150) return 'inaccuracy';
  return 'mistake';
}

// Classify a turning-point mistake, from { lossCp, kind }.
export function classifyMistake(item) {
  const loss = item.lossCp ?? 0;
  if (/mate/i.test(item.kind || '')) return 'blunder';
  if (loss >= 200) return 'blunder';
  if (loss >= 90) return 'mistake';
  return 'inaccuracy';
}

// Why this candidate did NOT reach a higher class — the honest audit line.
export function downgradeReason(item, klass, t = THRESHOLDS) {
  if (klass === 'brilliant') return '';
  const material = item.offer?.material ?? 0;
  if (material < t.minSacrificeCp) {
    return 'No material is given up, so chess.com would never mark it Brilliant — the !! badge is only for sound sacrifices.';
  }
  if (item.scoreBefore >= t.alreadyWinningCp) {
    return `You were already winning (about +${(item.scoreBefore / 100).toFixed(1)}) before this move, and chess.com does not award Brilliant when you were already completely winning — so the sacrifice is just the cleanest path, graded Best.`;
  }
  if (item.cpLoss > t.nearBestCp) {
    return `The engine had a clearly better move (this one gives up about ${(item.cpLoss / 100).toFixed(2)} pawns of eval), and Brilliant must be best or near-best — so it grades ${CLASS_INFO[klass].label}.`;
  }
  return `It grades ${CLASS_INFO[klass].label} under chess.com's criteria.`;
}
