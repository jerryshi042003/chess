// Board + coach visual-regression tests (WebKit / iOS fidelity).
//
// These assertions encode what a human checks against the chess.com reference
// (docs/ux-spec.md §1): the 8x8 grid is square, coordinates sit INSIDE the
// corner squares with alternating tones (painted under the pieces, chess.com
// convention), pieces are centered — and on a phone the board, step controls,
// and move rail stay visible while only the notes scroll (no page scroll).
// Screenshots go to test-results/board-visual/.

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT_DIR = path.join('test-results', 'board-visual');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const initScript = (standalone) => `
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q) => ({
      matches: /prefers-reduced-motion/.test(q) ? true
        : /display-mode:\\s*standalone/.test(q) ? ${standalone} : false,
      media: q, onchange: null,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, dispatchEvent() { return true; },
    }),
  });
`;

const DEVICES = [
  { name: 'iphone14', width: 390, height: 844 },
  { name: 'iphonese', width: 375, height: 667 },
];
const MODES = [
  { name: 'browser', standalone: false },
  { name: 'standalone', standalone: true },
];

async function open(page, { width, height, standalone }) {
  await page.addInitScript(initScript(standalone));
  await page.setViewportSize({ width, height });
  await page.goto('/chess/londonsacrifice/#moves');
  await page.locator('#board cg-board').waitFor();
  await expect(page.locator('#position-meta')).not.toBeEmpty();
  await page.waitForTimeout(250);
}

async function readBoard(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    };
    const wrap = document.querySelector('#board.cg-wrap');
    const cgBoard = document.querySelector('#board cg-board');
    const overlay = wrap.querySelector('.sq-coords');
    const grab = (cls) => [...overlay.querySelectorAll(cls)].map((x) => ({
      t: x.textContent.trim(),
      r: rect(x),
      tone: x.classList.contains('on-light') ? 'light' : 'dark',
    }));
    const coordGroups = {
      z: overlay ? Number(getComputedStyle(overlay).zIndex) : null,
      ranks: overlay ? grab('.sqc-rank') : [],
      files: overlay ? grab('.sqc-file') : [],
    };
    const pieces = [...wrap.querySelectorAll('piece')].map((p) => rect(p));
    const lesson = document.querySelector('#lesson');
    return {
      frame: rect(wrap.closest('.board-frame')),
      board: rect(cgBoard || wrap),
      coords: coordGroups,
      pieces,
      doc: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      view: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
      regions: ['.board-frame', '.board-controls', '#lesson'].map((sel) => {
        const el = document.querySelector(sel);
        return { sel, r: el ? rect(el) : null };
      }),
      lessonScrollable: lesson.scrollHeight - lesson.clientHeight,
    };
  });
}

const T = 1.0;

function assertBoardIsClean(g) {
  const { frame, board, coords, pieces } = g;
  expect(Math.abs(board.w - board.h), `board must be square (${board.w}x${board.h})`).toBeLessThanOrEqual(T);
  expect(board.left).toBeGreaterThanOrEqual(frame.left - T);
  expect(board.top).toBeGreaterThanOrEqual(frame.top - T);
  expect(board.right).toBeLessThanOrEqual(frame.right + T);
  expect(board.bottom).toBeLessThanOrEqual(frame.bottom + T);

  const { ranks, files } = coords;
  expect(ranks.length, 'rank coordinates present').toBe(8);
  expect(files.length, 'file coordinates present').toBe(8);
  // chess.com convention: board order (either orientation), inside the corner
  // squares, tones alternating with the squares, painted beneath the pieces.
  expect(['87654321', '12345678']).toContain(ranks.map((l) => l.t).join(''));
  expect(['abcdefgh', 'hgfedcba']).toContain(files.map((l) => l.t).join(''));
  expect(ranks.map((l) => l.tone)).toEqual(['light', 'dark', 'light', 'dark', 'light', 'dark', 'light', 'dark']);
  expect(files.map((l) => l.tone)).toEqual(['dark', 'light', 'dark', 'light', 'dark', 'light', 'dark', 'light']);
  expect(coords.z, 'coords painted beneath the pieces').toBeLessThan(2);

  const cell = board.w / 8;
  ranks.forEach((l, i) => {
    expect(l.r.left, `rank ${l.t} inside the left column`).toBeGreaterThanOrEqual(board.left - T);
    expect(l.r.right, `rank ${l.t} inside the left column`).toBeLessThanOrEqual(board.left + cell + T);
    expect(l.r.top, `rank ${l.t} in its own row`).toBeGreaterThanOrEqual(board.top + i * cell - T);
    expect(l.r.bottom, `rank ${l.t} in its own row`).toBeLessThanOrEqual(board.top + (i + 1) * cell + T);
    expect(l.r.w, `rank ${l.t} not rendered`).toBeGreaterThan(2);
  });
  files.forEach((l, i) => {
    expect(l.r.top, `file ${l.t} inside the bottom row`).toBeGreaterThanOrEqual(board.bottom - cell - T);
    expect(l.r.bottom, `file ${l.t} inside the bottom row`).toBeLessThanOrEqual(board.bottom + T);
    expect(l.r.left, `file ${l.t} in its own column`).toBeGreaterThanOrEqual(board.left + i * cell - T);
    expect(l.r.right, `file ${l.t} in its own column`).toBeLessThanOrEqual(board.left + (i + 1) * cell + T);
    expect(l.r.w, `file ${l.t} not rendered`).toBeGreaterThan(2);
  });

  for (const p of pieces) {
    expect(Math.abs(p.w - cell), 'piece width ~= one cell').toBeLessThanOrEqual(cell * 0.06 + T);
    const fx = (p.left + p.w / 2 - board.left) / cell;
    const fy = (p.top + p.h / 2 - board.top) / cell;
    expect(Math.abs((fx - Math.floor(fx)) - 0.5), 'piece not centered horizontally').toBeLessThanOrEqual(0.1);
    expect(Math.abs((fy - Math.floor(fy)) - 0.5), 'piece not centered vertically').toBeLessThanOrEqual(0.1);
  }
  expect(g.doc.scrollWidth, 'page scrolls horizontally').toBeLessThanOrEqual(g.view.innerWidth + T);
}

for (const device of DEVICES) {
  for (const mode of MODES) {
    for (const orientation of ['portrait', 'landscape']) {
      const width = orientation === 'portrait' ? device.width : device.height;
      const height = orientation === 'portrait' ? device.height : device.width;
      const tag = `${device.name}-${mode.name}-${orientation}`;

      test(`board + coach render cleanly: ${tag}`, async ({ page }) => {
        await open(page, { width, height, standalone: mode.standalone });
        await page.screenshot({ path: path.join(SHOT_DIR, `${tag}.png`) });
        const g = await readBoard(page);
        assertBoardIsClean(g);

        // The board stays clean at every phone size. The current iOS contract
        // lets the document own a small vertical tail so Safari chrome cannot
        // trap the lesson or final action.
        const oneScreen = mode.standalone || orientation === 'landscape';
        if (oneScreen) {
          if (mode.standalone) {
            expect(
              g.doc.scrollHeight - g.view.innerHeight,
              `${tag}: any document tail stays short and reachable`
            ).toBeLessThanOrEqual(120);
          }
          for (const sel of ['.board-frame', '.board-controls']) {
            const region = g.regions.find((r) => r.sel === sel);
            expect(region.r, `${sel} exists`).toBeTruthy();
            expect(region.r.bottom, `${sel} must be visible without page scroll`).toBeLessThanOrEqual(g.view.innerHeight + 2);
          }
        }
      });
    }
  }
}

test('classification is shown honestly across the scale', async ({ page }) => {
  await open(page, { width: 390, height: 844, standalone: true });
  // The corpus is ordered best-first: the one genuine Brilliant leads.
  await expect(page.locator('#position-title')).toHaveText('6 Nxe5');
  await expect(page.locator('#position-meta')).toContainText('Brilliant !!');
  // One control drives the whole corpus; the meta line carries the position
  // and the class filters prove a real Blunder set is present.
  await expect(page.locator('#position-meta')).toContainText('1/');
  await expect(page.locator('#review-filter-select option[value="blunder"]')).toHaveCount(1);
  // The two already-winning sacrifices are honestly demoted to Best, not
  // Brilliant — the next item over (ArrowDown drives item navigation now).
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#position-title')).toHaveText('20… Nxd2');
  await expect(page.locator('#position-meta')).toContainText('Best');
  // The one-line lesson is present and human (no labels table anymore).
  await expect(page.locator('#move-note')).toBeVisible();
});

test('keyboard and rail navigation both work', async ({ page }) => {
  await open(page, { width: 390, height: 844, standalone: true });
  const stage = page.locator('#stage-label');
  const before = await stage.textContent();
  await page.keyboard.press('ArrowRight'); // step forward
  await expect(stage).not.toHaveText(before);
  await page.keyboard.press('ArrowDown'); // next move/line
  await expect(page.locator('#position-title')).toHaveText('20… Nxd2');
  await page.keyboard.press('ArrowUp'); // previous move
  await expect(page.locator('#position-title')).toHaveText('6 Nxe5');
});

test('desktop is a two-column layout with a bounded board, not full-width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/chess/londonsacrifice/#moves');
  await page.locator('#board cg-board').waitFor();
  await page.waitForTimeout(250);
  const g = await readBoard(page);
  assertBoardIsClean(g);
  expect(g.board.w, 'desktop board must be bounded, not full-width').toBeLessThanOrEqual(600);
  const lesson = await page.locator('#lesson').boundingBox();
  expect(lesson.x, 'notes sit to the right of the board').toBeGreaterThan(g.frame.right - 4);
  await page.screenshot({ path: path.join(SHOT_DIR, 'desktop.png') });
});


// The animated opponent move must LAND on the true squares in both board
// orientations (a wrong highlight misteaches every puzzle). The yellow
// last-move squares are chessground-managed elements positioned in cells.
test('the opponent move animates onto the true squares in both orientations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chess/londonsacrifice/#drill');
  await page.waitForSelector('#drill-board cg-board');

  const { PUZZLE_SET } = await import('../../data/puzzles.js');
  const squareOf = (px, py, cell, orientation) => {
    const col = Math.round(px / cell);
    const row = Math.round(py / cell);
    const file = orientation === 'white' ? col : 7 - col;
    const rank = orientation === 'white' ? 7 - row : row;
    return 'abcdefgh'[file] + String(rank + 1);
  };
  const checkHighlights = async (puzzle) => {
    await expect(page.locator('#drill-board')).toHaveAttribute('data-puzzle-id', puzzle.id);
    // A prior puzzle already has two highlighted squares. Wait through this
    // puzzle's 420 ms arrival plus its 210 ms exact-position true-up.
    await page.waitForTimeout(700);
    await expect(page.locator('#drill-board square.last-move')).toHaveCount(2, { timeout: 5000 });
    await page.waitForTimeout(260); // let the true-up set() finish animating
    const data = await page.evaluate(() => {
      const board = document.querySelector('#drill-board cg-board');
      const bounds = board.getBoundingClientRect();
      return {
        cell: bounds.width / 8,
        squares: [...board.querySelectorAll('square.last-move')].map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x - bounds.x, y: r.y - bounds.y };
        }),
      };
    });
    const got = data.squares.map((s) => squareOf(s.x, s.y, data.cell, puzzle.side)).sort();
    const want = [puzzle.prev.uci.slice(0, 2), puzzle.prev.uci.slice(2, 4)].sort();
    expect(got, `${puzzle.id}: last-move highlight sits on the played squares`).toEqual(want);
  };

  const puzzles = PUZZLE_SET.puzzles;
  expect(puzzles[0].prev).not.toBeNull();
  await checkHighlights(puzzles[0]);

  const blackIndex = puzzles.findIndex((puzzle) => puzzle.side !== puzzles[0].side && puzzle.prev);
  expect(blackIndex).toBeGreaterThan(0);
  const target = puzzles[blackIndex];
  for (let i = 0; i < puzzles.length; i += 1) {
    const current = await page.locator('#drill-board').getAttribute('data-puzzle-id');
    if (current === target.id) break;
    await page.locator('#drill-next').click();
    await page.waitForTimeout(20);
  }
  await expect(page.locator('#drill-board')).toHaveAttribute('data-puzzle-id', target.id);
  await checkHighlights(target);
});
