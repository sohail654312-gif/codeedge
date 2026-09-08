import { defineConfig, devices } from "@playwright/test";
import { requireNativeBrowser } from "./scripts/ci/guards";

requireNativeBrowser(process.env);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // Local development routes may need time for their first compilation.
  expect: { timeout: 15000 },
  forbidOnly: !!process.env.CI,
  reporter: process.env.CODEEDGE_REQUIRE_NATIVE_SUPABASE === "1"
    ? [["list"], ["./tests/helpers/native-integration-reporter.ts"]]
    : "list",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium" } }],
  webServer: {
    command: process.env.PLAYWRIGHT_USE_BUILD === "1" ? "node node_modules/next/dist/bin/next start" : "node node_modules/next/dist/bin/next dev",
    url: "http://localhost:3000/sign-in",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_local_test_placeholder_only",
    },
  },
});
