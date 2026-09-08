import { expect, test } from "@playwright/test";

test("sign-in is accessible on desktop and mobile", async ({ page }, testInfo) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("sign-in-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("sign-in-mobile.png"), fullPage: true });
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
});

test("anonymous dashboard access redirects and protected API fails closed", async ({ page, request }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
  const response = await request.get("/api/businesses/30000000-0000-4000-8000-000000000001");
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: "Sign in to continue." });
  expect(response.headers()["cache-control"]).toContain("no-store");
});
