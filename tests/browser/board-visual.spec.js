// Board visual-regression tests (WebKit / iOS fidelity).
//
// WHY THIS EXISTS: a previous "fix" shipped with a visibly broken board — the
// file letters (a–h) rendered on top of the last rank and were clipped by the
// frame's rounded border, while the old tests only asserted element visibility
// and bounding boxes, so they passed anyway. Visibility is NOT proof.
//
// These assertions encode what a human checks against the chess.com reference
// (wisdom/chess-coach/docs/ux-spec.md §1): the 8x8 grid is square, coordinates
// sit INSIDE the corner squares with alternating tones (painted beneath the
// pieces — chess.com convention), pieces are centered; and on a phone in
// standalone PWA mode the board + notes + controls fit with no page scroll.
//
// Run: npx playwright test board-visual   (project: visual-webkit)
// Screenshots are written to test-results/board-visual/ for human review.

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT_DIR = path.join('test-results', 'board-visual');
fs.mkdirSync(SHOT_DIR, { recursive: true });

// There is no real way to make a headless browser report display-mode:
// standalone, so we stub matchMedia to emulate an installed iOS PWA. We also
// force prefers-reduced-motion so Chessground places pieces instantly (no
// animation in flight) — geometry assertions must read final, settled layout.
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
  await page.goto('/chess/#review');
  await expect(page.locator('html')).toHaveAttribute('data-schema', /chess-episode-coach\/v\d+/u);
  // The app now opens on the Summary view; the learn board renders there.
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.locator('#board')).toHaveAttribute('data-fen', /\S+/u);
  await page.locator('#board cg-board').waitFor();
  await page.waitForTimeout(300); // let chessground settle piece transforms
}

// Everything the eye would check, computed from the live DOM. The wrap
// selector picks which board (learn '#board' or drill '#drill-board'); the
// frame is resolved from the wrap so the hidden other board never interferes.
async function readBoard(page, wrapSelector = '#board') {
  return page.evaluate((sel) => {
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    };
    const wrap = document.querySelector(`${sel}.cg-wrap`);
    const cgBoard = document.querySelector(`${sel} cg-board`);
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
    return {
      frame: rect(wrap.closest('.board-frame')),
      board: rect(cgBoard || wrap),
      coords: coordGroups,
      pieces,
      doc: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      view: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
      regions: ['.step-track', '#next-step', '.lesson'].map((regionSel) => {
        const el = document.querySelector(regionSel);
        return { sel: regionSel, r: el ? rect(el) : null };
      }),
    };
  }, wrapSelector);
}

const T = 1.0; // sub-pixel tolerance (px)

function assertBoardIsClean(g, { standalone, orientation }) {
  const { frame, board, coords, pieces } = g;

  // 1. The 8x8 grid is square.
  expect(Math.abs(board.w - board.h), `board must be square (${board.w}x${board.h})`).toBeLessThanOrEqual(T);

  // 2. The board sits fully inside its frame (nothing spills out).
  expect(board.left).toBeGreaterThanOrEqual(frame.left - T);
  expect(board.top).toBeGreaterThanOrEqual(frame.top - T);
  expect(board.right).toBeLessThanOrEqual(frame.right + T);
  expect(board.bottom).toBeLessThanOrEqual(frame.bottom + T);

  const { ranks, files } = coords;
  expect(ranks.length, 'rank coordinates present').toBe(8);
  expect(files.length, 'file coordinates present').toBe(8);

  // 3. chess.com convention: labels in board order inside the corner squares,
  //    tones alternating with the squares, painted beneath the pieces.
  expect(['87654321', '12345678']).toContain(ranks.map((l) => l.t).join(''));
  expect(['abcdefgh', 'hgfedcba']).toContain(files.map((l) => l.t).join(''));
  expect(ranks.map((l) => l.tone)).toEqual(['light', 'dark', 'light', 'dark', 'light', 'dark', 'light', 'dark']);
  expect(files.map((l) => l.tone)).toEqual(['dark', 'light', 'dark', 'light', 'dark', 'light', 'dark', 'light']);
  expect(coords.z, 'coords painted beneath the pieces').toBeLessThan(2);

  const cell = board.w / 8;

  // 4. Rank labels sit inside the left column, one per row, never clipped.
  ranks.forEach((l, i) => {
    expect(l.r.left, `rank ${l.t} inside the left column`).toBeGreaterThanOrEqual(board.left - T);
    expect(l.r.right, `rank ${l.t} inside the left column`).toBeLessThanOrEqual(board.left + cell + T);
    expect(l.r.top, `rank ${l.t} in its own row`).toBeGreaterThanOrEqual(board.top + i * cell - T);
    expect(l.r.bottom, `rank ${l.t} in its own row`).toBeLessThanOrEqual(board.top + (i + 1) * cell + T);
    expect(l.r.w, `rank ${l.t} not rendered`).toBeGreaterThan(2);
  });

  // 5. File labels sit inside the bottom row, one per column, never clipped.
  files.forEach((l, i) => {
    expect(l.r.top, `file ${l.t} inside the bottom row`).toBeGreaterThanOrEqual(board.bottom - cell - T);
    expect(l.r.bottom, `file ${l.t} inside the bottom row`).toBeLessThanOrEqual(board.bottom + T);
    expect(l.r.left, `file ${l.t} in its own column`).toBeGreaterThanOrEqual(board.left + i * cell - T);
    expect(l.r.right, `file ${l.t} in its own column`).toBeLessThanOrEqual(board.left + (i + 1) * cell + T);
    expect(l.r.w, `file ${l.t} not rendered`).toBeGreaterThan(2);
  });

  // 6. Pieces are square, correctly scaled to one cell, and centered in a square.
  for (const p of pieces) {
    expect(Math.abs(p.w - cell), 'piece width ~= one cell').toBeLessThanOrEqual(cell * 0.06 + T);
    expect(Math.abs(p.h - cell), 'piece height ~= one cell').toBeLessThanOrEqual(cell * 0.06 + T);
    const fx = (p.left + p.w / 2 - board.left) / cell; // fractional column of piece center
    const fy = (p.top + p.h / 2 - board.top) / cell;
    expect(Math.abs((fx - Math.floor(fx)) - 0.5), 'piece not centered horizontally in its square').toBeLessThanOrEqual(0.1);
    expect(Math.abs((fy - Math.floor(fy)) - 0.5), 'piece not centered vertically in its square').toBeLessThanOrEqual(0.1);
  }

  // 8. No horizontal page scroll, ever.
  expect(g.doc.scrollWidth, 'page scrolls horizontally').toBeLessThanOrEqual(g.view.innerWidth + T);

  // 9. On a standard-height iPhone in installed PWA portrait, the WHOLE board is
  //    visible above the fold — you never have to scroll to see the position.
  //    (The move list, primary action, and lesson text follow below; how much of
  //    that is above the fold varies with episode text length, and shorter
  //    phones like the iPhone SE legitimately scroll — so only the board itself
  //    is gated here. The board-is-never-clipped guarantee above applies to
  //    every device regardless.)
  if (standalone && orientation === 'portrait' && g.view.innerHeight >= 800) {
    expect(g.frame.top, 'board must start on screen').toBeGreaterThanOrEqual(-T);
    expect(g.frame.bottom, 'the whole board must be visible above the fold').toBeLessThanOrEqual(g.view.innerHeight + T);
  }
}

for (const device of DEVICES) {
  for (const mode of MODES) {
    for (const orientation of ['portrait', 'landscape']) {
      const width = orientation === 'portrait' ? device.width : device.height;
      const height = orientation === 'portrait' ? device.height : device.width;
      const tag = `${device.name}-${mode.name}-${orientation}`;

      test(`board renders cleanly: ${tag}`, async ({ page }) => {
        await open(page, { width, height, standalone: mode.standalone });

        // Exercise all three app modes' boards where they render one.
        await page.screenshot({ path: path.join(SHOT_DIR, `${tag}-learn.png`) });

        const g = await readBoard(page);
        assertBoardIsClean(g, { standalone: mode.standalone, orientation });

        // Also assert on another item (different piece layout / orientation) —
        // ArrowDown drives item navigation now (the rail is gone).
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(250);
        const g2 = await readBoard(page);
        assertBoardIsClean(g2, { standalone: mode.standalone, orientation });
        await page.screenshot({ path: path.join(SHOT_DIR, `${tag}-fork.png`) });
      });
    }
  }
}

for (const device of DEVICES) {
  test(`summary and drill render cleanly: ${device.name}`, async ({ page }) => {
    await page.addInitScript(initScript(false));
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.goto('/chess/');
    await expect(page.locator('html')).toHaveAttribute('data-schema', /chess-episode-coach\/v\d+/u);

    // Summary is the default view: sections present, no horizontal scroll.
    await expect(page.locator('#progress-view')).toBeVisible();
    await expect(page.locator('.session-row')).toHaveCount(7);
    let doc = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(doc.scrollWidth, 'summary scrolls horizontally').toBeLessThanOrEqual(doc.innerWidth + T);
    await page.screenshot({ path: path.join(SHOT_DIR, `${device.name}-summary.png`), fullPage: true });

    // The drill board must meet the same cleanliness bar as the learn board.
    // The Summary is full of "Drill …" buttons now (every mistake label is a
    // query), so target the tab itself, not the accessible name.
    await page.locator('.tabs [data-view="drill"]').click();
    await page.locator('#drill-board cg-board').waitFor();
    await page.waitForTimeout(300);
    const g = await readBoard(page, '#drill-board');
    assertBoardIsClean(g, { standalone: false, orientation: 'portrait' });
    doc = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(doc.scrollWidth, 'drill scrolls horizontally').toBeLessThanOrEqual(doc.innerWidth + T);
    await page.screenshot({ path: path.join(SHOT_DIR, `${device.name}-drill.png`), fullPage: true });
  });
}

test('desktop layout does not regress (two columns, square board, clean coords)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/chess/');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.locator('#board')).toHaveAttribute('data-fen', /\S+/u);
  await page.locator('#board cg-board').waitFor();
  await page.waitForTimeout(300);

  const g = await readBoard(page);
  assertBoardIsClean(g, { standalone: false, orientation: 'landscape' });

  // Two-column: the lesson/notes sit to the right of the board, board is large.
  const lesson = g.regions.find((r) => r.sel === '.lesson').r;
  expect(g.board.w, 'desktop board should be large').toBeGreaterThan(400);
  expect(lesson.left, 'lesson must sit to the right of the board').toBeGreaterThan(g.frame.right - 1);
  await page.screenshot({ path: path.join(SHOT_DIR, 'desktop-1280.png') });
});

test('installed iPhone 13 Pro keeps every coach bottom reachable', async ({ page }) => {
  await page.addInitScript(initScript(true));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chess/#drill');
  await expect(page.locator('html')).toHaveAttribute('data-standalone', '1');

  const reachable = async (label) => {
    const geometry = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const visible = [...document.querySelectorAll('button, a, select, summary')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        });
      return {
        bodyOverflow: getComputedStyle(body).overflowY,
        docBottom: Math.max(html.scrollHeight, body.scrollHeight),
        lastControlBottom: Math.max(...visible.map((element) => element.getBoundingClientRect().bottom), 0),
        viewport: innerHeight,
      };
    });
    expect(geometry.bodyOverflow, `${label}: body must not be locked`).not.toBe('hidden');
    expect(geometry.lastControlBottom, `${label}: final control must be inside the scrollable document`)
      .toBeLessThanOrEqual(geometry.docBottom + 1);
    expect(geometry.docBottom, `${label}: document must cover the viewport`).toBeGreaterThanOrEqual(geometry.viewport);
  };

  await page.getByRole('button', { name: 'Drill', exact: true }).click();
  await page.locator('#drill-board cg-board').waitFor();
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await reachable('drill');

  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.locator('#board')).toHaveAttribute('data-fen', /\S+/u);
  await reachable('review');

  await page.getByRole('button', { name: 'Summary', exact: true }).click();
  await reachable('summary');
});


// The animated opponent move must LAND on the true squares in both board
// orientations (a wrong highlight misteaches every puzzle).
test('the opponent move animates onto the true squares in both orientations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chess/#drill');
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
