import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
