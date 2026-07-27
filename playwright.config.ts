import { defineConfig, devices } from "@playwright/test";

const requestedPort = Number(process.env.AIRPORT_AUTO_E2E_PORT ?? 4178);
const testPort =
  Number.isInteger(requestedPort) &&
  requestedPort >= 1024 &&
  requestedPort <= 65_535
    ? requestedPort
    : 4178;
const testBaseUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: testBaseUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${testPort}`,
    url: testBaseUrl,
    // Never trust an arbitrary process already bound to the test port. Reusing
    // it can make the suite exercise an unrelated local app while every test
    // waits for Airport Auto's control surface to appear.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
