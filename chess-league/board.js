/* GENERATED from wisdom/chess-coach/src/board.template.js — edit there and run scripts/chess/sync_coach_ui.mjs */
import { Chessground } from '/chess/vendor/chessground.min.js';

// One board core for every coach and League receipt: Chessground, the same
// chess.com-style coordinates, the same animation, and the same arrow brushes.
export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const HINT_BRUSHES = {
  hint: { key: 'ht', color: '#ffaa00', opacity: 0.8, lineWidth: 8 }
};

export const THIN_BRUSHES = {
  green: { key: 'g', color: '#15781B', opacity: 0.9, lineWidth: 5 },
  red: { key: 'r', color: '#882020', opacity: 0.9, lineWidth: 5 },
  blue: { key: 'b', color: '#003088', opacity: 0.9, lineWidth: 5 },
  yellow: { key: 'y', color: '#e68f00', opacity: 0.9, lineWidth: 5 }
};

const SQ_FILL = (color) => `<rect width="100" height="100" fill="${color}" fill-opacity="0.5"/chess/>`;
export const SQ_TEAL = SQ_FILL('#1baca6');
export const SQ_RED = SQ_FILL('#ff7769');
const BADGE = (fill, glyph) =>
  `<g transform="translate(71 3)"><circle cx="13" cy="13" r="13" fill="${fill}"/chess/>${glyph}</g>`;
export const BADGE_WRONG = BADGE('#ff7769',
  '<path d="M8 8l10 10M18 8L8 18" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/chess/>');
export const BADGE_SOLVED = BADGE('#81b64c',
  '<path d="M7 13.5l4 4 8-8.5" stroke="#fff" stroke-width="3.4" stroke-linecap="round" fill="none"/chess/>');

function coordsOverlay(el) {
  const wrap = document.createElement('div');
  wrap.className = 'sq-coords';
  wrap.setAttribute('aria-hidden', 'true');
  const host = el.querySelector('cg-container') || el;
  for (let i = 0; i < 8; i += 1) {
    const rank = document.createElement('span');
    rank.className = `sqc sqc-rank ${i % 2 === 0 ? 'on-light' : 'on-dark'}`;
    rank.style.top = `${i * 12.5}%`;
    wrap.appendChild(rank);
    const file = document.createElement('span');
    file.className = `sqc sqc-file ${i % 2 === 0 ? 'on-dark' : 'on-light'}`;
    file.style.left = `${i * 12.5}%`;
    wrap.appendChild(file);
  }
  host.appendChild(wrap);
  return wrap;
}

export function setCoordsOrientation(el, orientation) {
  let overlay = el.querySelector('.sq-coords');
  if (overlay && overlay.clientWidth === 0 && el.clientWidth > 0) {
    overlay.remove();
    overlay = null;
  }
  if (!overlay) overlay = coordsOverlay(el);
  const white = orientation !== 'black';
  overlay.querySelectorAll('.sqc-rank').forEach((span, i) => {
    span.textContent = white ? String(8 - i) : String(i + 1);
  });
  overlay.querySelectorAll('.sqc-file').forEach((span, i) => {
    span.textContent = white ? 'abcdefgh'[i] : 'hgfedcba'[i];
  });
}

export function makeBoard(el, extra = {}) {
  const api = Chessground(el, {
    fen: 'start',
    orientation: 'white',
    coordinates: false,
    animation: { enabled: !REDUCED_MOTION, duration: 180 },
    highlight: { lastMove: true, check: true },
    drawable: { enabled: false, visible: true, brushes: THIN_BRUSHES },
    ...extra
  });
  const cgWrap = el.classList.contains('cg-wrap') ? el : el.querySelector('.cg-wrap') || el;
  coordsOverlay(cgWrap);
  setCoordsOrientation(cgWrap, extra.orientation || 'white');
  api.coordsEl = cgWrap;
  const keyAt = (event) => {
    const bounds = cgWrap.getBoundingClientRect();
    if (!bounds.width) return null;
    const file = Math.floor(((event.clientX - bounds.left) / bounds.width) * 8);
    const row = Math.floor(((event.clientY - bounds.top) / bounds.height) * 8);
    if (file < 0 || file > 7 || row < 0 || row > 7) return null;
    return api.state.orientation === 'white'
      ? 'abcdefgh'[file] + String(8 - row)
      : 'abcdefgh'[7 - file] + String(row + 1);
  };
  const unselect = () => {
    api.state.selected = undefined;
    api.state.premovable.dests = undefined;
    cgWrap.querySelectorAll('square.selected, square.move-dest').forEach((square) => {
      square.classList.remove('selected', 'move-dest', 'oc');
    });
  };
  let tapDown = null;
  cgWrap.addEventListener('pointerdown', (event) => {
    const state = api.state;
    const selected = state.selected;
    tapDown = { key: keyAt(event), selected };
    if (!selected || state.viewOnly) return;
    const key = tapDown.key;
    if (key === null || key === selected) return;
    if (state.movable.dests?.get(selected)?.includes(key)) return;
    if (state.pieces.get(key)?.color === state.movable.color) return;
    unselect();
  });
  cgWrap.addEventListener('pointerup', (event) => {
    const state = api.state;
    const down = tapDown;
    tapDown = null;
    if (!down || state.viewOnly) return;
    const key = keyAt(event);
    if (key && key === down.key && key === down.selected && state.selected === key) {
      unselect();
    }
  });
  return api;
}

export function uciSquares(uci) {
  return uci ? [uci.slice(0, 2), uci.slice(2, 4)] : undefined;
}
