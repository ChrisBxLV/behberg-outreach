import { defineConfig } from "@playwright/test";

/**
 * Full happy-path E2E (enroll → send → pixel → webhook) needs a running app, DB, and provider mocks.
 * Keep the runner installed; enable `E2E_BASE_URL` when you are ready to wire a real flow.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
  },
});
