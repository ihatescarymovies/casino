import { test, expect } from "@playwright/test";

test.describe("Promotions page", () => {
  test("loads promotions listing", async ({ page }) => {
    await page.goto("/promotions");
    await expect(page).toHaveTitle(/Promotions/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("Winners page", () => {
  test("loads winners listing", async ({ page }) => {
    await page.goto("/winners");
    await expect(page).toHaveTitle(/Winners/);
  });
});
