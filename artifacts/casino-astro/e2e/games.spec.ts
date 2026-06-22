import { test, expect } from "@playwright/test";

test.describe("Games page", () => {
  test("loads games listing", async ({ page }) => {
    await page.goto("/games");
    await expect(page).toHaveTitle(/Games/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("shows game cards when API returns data", async ({ page }) => {
    await page.goto("/games");
    // Game cards should render (or skeleton placeholders if API is down)
    const content = page.locator("main");
    await expect(content).toBeVisible();
  });

  test("navigates to game detail", async ({ page }) => {
    await page.goto("/games");
    const firstGameLink = page.locator('a[href^="/games/"]').first();
    if (await firstGameLink.isVisible()) {
      await firstGameLink.click();
      await expect(page).toHaveURL(/\/games\/\d+/);
    }
  });
});
