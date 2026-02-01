import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 30000,
    actionTimeout: 15000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Skip local servers when testing against a remote deployment
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: [
          {
            command: 'pnpm --filter @apcd/api dev',
            port: 4000,
            reuseExistingServer: !process.env.CI,
          },
          {
            command: 'pnpm --filter @apcd/web dev',
            port: 3000,
            reuseExistingServer: !process.env.CI,
          },
        ],
      }),
});
