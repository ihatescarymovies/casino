import { test, expect } from "@playwright/test";

test.describe("Auth-protected routes", () => {
  test("redirects unauthenticated users from /dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    // Should redirect (302) to login or home
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test("redirects unauthenticated users from /cashier", async ({ page }) => {
    await page.goto("/cashier");
    await expect(page).not.toHaveURL(/\/cashier/);
  });
});
