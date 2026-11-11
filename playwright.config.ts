import { defineConfig, devices } from "@playwright/test";

const PORT = 4399;

/*
 * Smoke tests over the demo: the real server and readers, generated data.
 * They run against a production build, which starts faster and is steadier
 * than the dev server.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && node scripts/demo.mjs --build",
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/api/snapshot`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
});
