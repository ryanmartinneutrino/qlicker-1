import { defineConfig, devices } from '@playwright/test';

const repoRoot = '/home/runner/work/qlicker-1/qlicker-1';
const stateFile = process.env.QCLICKER_E2E_STATE_FILE || '/tmp/qlicker-e2e-state.json';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: `cd ${repoRoot}/server && QCLICKER_E2E_STATE_FILE=${stateFile} ROOT_URL=http://127.0.0.1:3000 HOST=127.0.0.1 PORT=3001 node scripts/e2e-server.js`,
      url: 'http://127.0.0.1:3001/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `cd ${repoRoot}/client && QCLICKER_E2E_STATE_FILE=${stateFile} VITE_API_URL=http://127.0.0.1:3001 VITE_WS_URL=ws://127.0.0.1:3001 npm run dev -- --host 127.0.0.1 --port 3000`,
      url: 'http://127.0.0.1:3000/login',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
