import { expect, test } from "@playwright/test";

// Explicit opt-in for real GoTrue/PostgREST integration. CI's Supabase job enables it.
test.describe("local Supabase authentication", () => {
  test.skip(process.env.CODEEDGE_E2E_AUTH !== "1", "Requires local Supabase and npm run dev:seed; enable CODEEDGE_E2E_AUTH=1.");
  for (const person of [
    { email: "alice@codeedge.test", own: "Northfield Plumbing", other: "Westbrook Electrical", slug: "westbrook-electrical", otherId: "30000000-0000-4000-8000-000000000002" },
    { email: "bob@codeedge.test", own: "Westbrook Electrical", other: "Northfield Plumbing", slug: "northfield-plumbing", otherId: "30000000-0000-4000-8000-000000000001" },
  ]) {
    test(`${person.email} signs in and cannot open the other tenant`, async ({ page }) => {
      await page.goto("/sign-in");
      await page.getByLabel("Email address").fill(person.email);
      await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Your businesses" })).toBeVisible();
      await expect(page.getByRole("link", { name: new RegExp(person.own) })).toBeVisible();
      await expect(page.getByText(person.other, { exact: true })).toHaveCount(0);
      await page.getByRole("link", { name: new RegExp(person.own) }).click();
      await expect(page.getByRole("heading", { name: person.own, exact: true })).toBeVisible();
      const response = await page.request.get(`/api/businesses/${person.otherId}`);
      expect(response.status()).toBe(404);
      await page.goto(`/dashboard/${person.slug}`);
      await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
      await page.goto("/dashboard");
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
    });
  }
  test("revoked user signs in but receives no business access", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill("revoked@codeedge.test");
    await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No business access" })).toBeVisible();
  });
});
