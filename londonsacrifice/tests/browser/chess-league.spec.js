import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

function collectFailures(page) {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
  return failures;
}

async function noHorizontalOverflow(page) {
  const geometry = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth + 1);
}

test('League main page is a playful, honest lollipop comparison', async ({ page }) => {
  const failures = collectFailures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chess/chess-league/');

  await expect(page.locator('h1')).toHaveText('Blunder League');
  await expect(page.locator('.tabs > *')).toHaveText(['Summary', 'Drill', 'Review', 'Compare']);
  await expect(page.locator('.tabs [aria-current="page"]')).toHaveText('Compare');
  await expect(page.locator('.tabs [data-coach-view="summary"]')).toHaveAttribute('href', '/chess/#summary');
  await expect(page.locator('html')).toHaveAttribute('data-return-coach', 'chess-openings');
  await expect(page.locator('.coach-nav')).toHaveText('Jerry coach London coach');
  await expect(page.locator('.coach-nav a').first()).toHaveAttribute('href', '/chess/#summary');
  await expect(page.locator('.coach-nav a').nth(1)).toHaveAttribute('href', '/chess/londonsacrifice/#summary');
  await expect(page.locator('#league-verdict')).toContainText('current Blitz rate is');
  await expect(page.locator('#league-scope')).toHaveText('Same Chess.com pool · different clocks and windows');
  await expect(page.locator('.metric-heading')).toHaveText('Blunders / 100 decisions');
  await expect(page.locator('.metric-lockup > span')).toHaveText('Lower is better');
  await expect(page.locator('.pool h2')).toHaveText(['Blitz']);
  await expect(page.locator('.pool-head p')).toHaveText(['Same pool · different clocks']);
  await expect(page.locator('.player')).toHaveCount(2);
  await expect(page.locator('.crest')).toHaveText(['J', 'L']);
  await expect(page.locator('.identity strong')).toHaveText(['Jerry', 'London']);
  await expect(page.locator('.rate')).toHaveCount(2);
  await expect(page.locator('.track')).toHaveCount(2);
  await expect(page.locator('.marker')).toHaveCount(2);
  await expect(page.locator('.player[open]')).toHaveCount(0);
  await expect(page.locator('.moment:visible')).toHaveCount(0);
  await expect(page.locator('.deck, .method, .sample-note, .receipt, .bar')).toHaveCount(0);

  const positions = await page.locator('.marker').evaluateAll((markers) => markers.map((marker) => Math.round(parseFloat(marker.style.left))));
  expect(positions).toHaveLength(2);
  expect(positions.every((position) => position >= 0 && position <= 100)).toBe(true);
  await noHorizontalOverflow(page);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(failures).toEqual([]);
});

// The Summary's friends card is one link now — the comparison itself lives on
// the League page (Jerry: "just leave that one compare, it's not that
// important"), so this only checks the door still opens.
test('both regular Summary homes expose a connected League link', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chess/#summary');
  await expect(page.locator('.league-preview-row')).toHaveCount(0);
  await expect(page.locator('#league-preview-action')).toBeVisible();
  await expect(page.locator('#league-preview-action')).toHaveAttribute('href', '/chess/chess-league/?coach=chess-openings');
  await page.locator('#league-preview-action').click();
  await expect(page).toHaveURL(/\/chess-league\/\?coach=chess-openings$/u);
  await expect(page.locator('.tabs [data-coach-view="summary"]')).toHaveAttribute('href', '/chess/#summary');

  await page.goto('/chess/londonsacrifice/#summary');
  await expect(page.locator('#league-preview-action')).toHaveAttribute('href', '/chess/chess-league/?coach=londonsacrifice');
  await noHorizontalOverflow(page);
});

test('Compare round-trips through the same four destinations for each coach', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/chess/#summary');
  await page.locator('#compare-tab').click();
  await expect(page).toHaveURL(/\/chess-league\/\?coach=chess-openings$/u);
  await expect(page.locator('.tabs [aria-current="page"]')).toHaveText('Compare');
  await expect(page.locator('.tabs [data-coach-view="review"]')).toHaveAttribute('href', '/chess/#review');
  await page.locator('.tabs [data-coach-view="review"]').click();
  await expect(page).toHaveURL(/\/chess-openings\/#review$/u);
  await expect(page.locator('.tabs [data-view="review"]')).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/chess/londonsacrifice/#summary');
  await page.locator('#compare-tab').click();
  await expect(page).toHaveURL(/\/chess-league\/\?coach=londonsacrifice$/u);
  await expect(page.locator('html')).toHaveAttribute('data-return-coach', 'londonsacrifice');
  await expect(page.locator('.tabs [data-coach-view="drill"]')).toHaveAttribute('href', '/chess/londonsacrifice/#drill');
  await page.locator('.tabs [data-coach-view="drill"]').click();
  await expect(page).toHaveURL(/\/londonsacrifice\/#drill$/u);
  await expect(page.locator('.tabs [data-view="drill"]')).toHaveAttribute('aria-pressed', 'true');
  await noHorizontalOverflow(page);
});

test('one large board and a 1-of-3 selector replay verified arrows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chess/chess-league/#jerryshi042003');

  const player = page.locator('#jerryshi042003');
  await expect(player).toHaveAttribute('open', '');
  await expect(player.locator('.identity span')).toContainText('3+2');
  await expect(player.locator('.moment')).toHaveCount(3);
  await expect(player.locator('.moment:visible')).toHaveCount(1);
  await expect(player.locator('.board')).toHaveCount(3);
  await expect(player.locator('cg-board')).toHaveCount(1);
  await expect(player.locator('.sq-coords')).toHaveCount(1);
  await expect(player.locator('.moment-picker button')).toHaveCount(3);
  await expect(player.locator('.moment-picker button').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(player.locator('.severity-title')).toHaveCount(3);
  await expect(player.locator('.played')).toHaveCount(3);
  await expect(player.locator('.best')).toHaveCount(3);
  await expect(player.locator('.frequency')).toHaveCount(3);
  await expect(player.locator('svg.cg-shapes line')).toHaveCount(2);
  let strokes = await player.locator('svg.cg-shapes line').evaluateAll((lines) => lines.map((line) => line.getAttribute('stroke')));
  expect(strokes).toEqual(['#882020', '#15781B']);

  await player.locator('.moment-picker button').nth(1).click();
  await expect(player.locator('.moment:visible .severity-title')).not.toBeEmpty();
  await expect(player.locator('cg-board')).toHaveCount(2);
  const replay = player.locator('.moment:visible .replay-action');
  await replay.click();
  await expect(player.locator('.moment:visible svg.cg-shapes line')).toHaveCount(1);
  await expect(player.locator('.moment:visible svg.cg-shapes line')).toHaveCount(2, { timeout: 1500 });
  strokes = await player.locator('.moment:visible svg.cg-shapes line').evaluateAll((lines) => lines.map((line) => line.getAttribute('stroke')));
  expect(strokes).toEqual(['#882020', '#15781B']);
  await expect(player.locator('.game-action')).toHaveCount(3);
  await expect(player.locator('.profile-action')).toHaveAttribute('href', '/chess/');
  await noHorizontalOverflow(page);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('accordion and coach links keep the overall summary connected', async ({ page }) => {
  await page.goto('/chess/chess-league/#not-a-player');
  await expect(page.locator('.player[open]')).toHaveCount(0);
  await page.locator('#jerryshi042003 > summary').click();
  await expect(page.locator('#jerryshi042003')).toHaveAttribute('open', '');
  await expect(page.locator('#jerryshi042003 .profile-action')).toHaveAttribute('href', '/chess/');
  await expect(page.locator('#londonsacrifice .profile-action')).toHaveAttribute('href', '/chess/londonsacrifice/');

  await page.goto('/chess/londonsacrifice/');
  await expect(page.locator('.profile-switch')).toHaveText('⇄ Jerry');
  await expect(page.locator('.profile-switch')).toHaveAttribute('href', '/chess/#summary');
  await expect(page.locator('.profile-switch')).toHaveAttribute('aria-label', "Switch to Jerry's coach");
  await expect(page.locator('#compare-tab')).toHaveAttribute('href', '/chess/chess-league/?coach=londonsacrifice');
  await expect(page.locator('.league-link')).toHaveCount(0);
});

test('League and Summary preview fit every required viewport', async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/chess/chess-league/#jerryshi042003');
    await expect(page.locator('#jerryshi042003 .moment:visible .board')).toBeVisible();
    await expect(page.locator('#jerryshi042003 .moment:visible .severity-title')).toBeVisible();
    await expect(page.locator('#jerryshi042003 .moment:visible svg.cg-shapes line')).toHaveCount(2);
    await expect(page.locator('.tabs > *')).toHaveText(['Summary', 'Drill', 'Review', 'Compare']);
    await expect(page.locator('.tabs [aria-current="page"]')).toBeVisible();
    await noHorizontalOverflow(page);

    await page.goto('/chess/#summary');
    await expect(page.locator('.league-preview-card')).toBeVisible();
    await expect(page.locator('#league-preview-action')).toBeVisible();
    await noHorizontalOverflow(page);
  }
});

test('League and the Summary preview reload from the offline shells', async ({ page, context }) => {
  await page.goto('/chess/chess-league/#jerryshi042003');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)).catch(() => false)).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toHaveText('Blunder League');
  await expect(page.locator('#jerryshi042003 .moment')).toHaveCount(3);
  await expect(page.locator('#jerryshi042003 .moment:visible')).toHaveCount(1);
  await expect(page.locator('#jerryshi042003 cg-board')).toHaveCount(1);
  await expect(page.locator('#jerryshi042003 svg.cg-shapes line')).toHaveCount(2);
  await expect(page.locator('.tabs [aria-current="page"]')).toHaveText('Compare');
  await context.setOffline(false);

  await page.goto('/chess/#summary');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)).catch(() => false)).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#league-preview-action')).toBeVisible();
  await expect(page.locator('#summary-mistakes .sub-chip').first()).toBeVisible();
  await context.setOffline(false);
});
