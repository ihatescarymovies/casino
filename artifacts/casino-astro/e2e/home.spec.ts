import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("loads and shows hero content", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Charter & Oak/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "High-Roller",
    );
    await expect(page.getByText("Play Now")).toBeVisible();
  });

  test("has skip link for accessibility", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.getByText("Skip to main content");
    await expect(skipLink).toBeAttached();
  });

  test("navigates to games page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /play now/i }).click();
    await expect(page).toHaveURL(/\/games/);
  });

  test("has OG meta tags", async ({ page }) => {
    await page.goto("/");
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /Charter & Oak/);
    const ogDesc = page.locator('meta[property="og:description"]');
    await expect(ogDesc).toHaveCount(1);
  });
});
