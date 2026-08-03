import { defineConfig, devices } from '@playwright/test';

// Two engines on purpose:
//  - functional specs run on Chromium (fast, stable service-worker support)
//  - the board visual-regression spec runs on WebKit for real iOS/Safari
//    fidelity, which is the environment this PWA actually ships to.
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
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
      use: { ...devices['iPhone 14'] }, // WebKit engine + iOS mobile emulation
    },
  ],
  webServer: {
    command: 'python3 -m http.server 8799',
    cwd: '..',
    url: 'http://127.0.0.1:8799/',
    reuseExistingServer: false,
    timeout: 10000,
  },
});
