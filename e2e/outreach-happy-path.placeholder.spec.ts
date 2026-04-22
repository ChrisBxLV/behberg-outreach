import { test, expect } from "@playwright/test";

const e2eEnabled = Boolean(process.env.E2E_BASE_URL?.trim());
test.skip(!e2eEnabled, "Set E2E_BASE_URL to run E2E (optional; see playwright.config.ts).");

test("home loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});
