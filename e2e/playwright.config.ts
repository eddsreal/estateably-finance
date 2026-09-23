import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile('../.env');
} catch {}

export default defineConfig({
  testDir: './specs',
  workers: 1,
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
