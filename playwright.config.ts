import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }], ["json", { outputFile: "test-results/results.json" }]],
  use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL || undefined, baseURL: "http://127.0.0.1:5198", trace: "on-first-retry", screenshot: "only-on-failure" },
  webServer: {
    command: `${process.env.PLAYWRIGHT_SKIP_BUILD === "1" ? "" : "npm run build && "}npm run preview -- --host 127.0.0.1 --port 5198 --strictPort`,
    url: "http://127.0.0.1:5198/login",
    reuseExistingServer: false,
    timeout: 300_000,
    env: { VITE_SUPABASE_URL: "http://localhost:9", VITE_SUPABASE_PUBLISHABLE_KEY: "fake-public-test-key" },
  },
});
