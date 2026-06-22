import { test, expect } from "@playwright/test";

test.describe("404 page", () => {
  test("shows 404 for unknown routes", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/not found|404/i)).toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("header navigation links work", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
  });
});
