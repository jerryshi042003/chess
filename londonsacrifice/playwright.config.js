import { defineConfig, devices } from '@playwright/test';

// Functional/offline/a11y specs run on Chromium (stable service-worker support);
// the board + coach visual-regression spec runs on WebKit for real iOS fidelity.
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180000,
  expect: { timeout: 10000 },
  reporter: [['line']],
  use: { baseURL: 'http://127.0.0.1:8799', headless: true, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'functional-chromium',
      testIgnore: /board-visual\.spec\.js/,
      use: { browserName: 'chromium' },
    },
    {
      name: 'visual-webkit',
      testMatch: /board-visual\.spec\.js/,
      use: { ...devices['iPhone 14'] },
    },
  ],
  webServer: {
    command: 'python3 -m http.server 8799',
    cwd: '..',
    url: 'http://127.0.0.1:8799/londonsacrifice/',
    reuseExistingServer: false,
    timeout: 10000,
  },
});
