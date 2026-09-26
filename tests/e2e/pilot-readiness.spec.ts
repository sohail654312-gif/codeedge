import { expect, test } from "@playwright/test";

test.describe("pilot readiness journeys", () => {
  test.skip(process.env.CODEEDGE_E2E_AUTH !== "1", "Requires disposable local Supabase and seeded fictional accounts.");

  async function signIn(page: import("@playwright/test").Page, email: string) {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Your businesses|No business access/ })).toBeVisible();
  }

  test("readiness requires real local Supabase and the restricted chat database capability", async ({ request }) => {
    const live = await request.get("/api/health/live");
    expect(live.status()).toBe(200);
    expect(await live.json()).toEqual({ status: "alive" });

    const ready = await request.get("/api/health/ready");
    expect(ready.status()).toBe(200);
    expect(await ready.json()).toEqual({ status: "ready" });
  });

  test("owner can view team access but AAL1 cannot revoke staff", async ({ page }) => {
    await signIn(page, "alice@codeedge.test");
    await page.getByRole("link", { name: /Northfield Plumbing/ }).click();
    await page.getByRole("link", { name: /Team access/ }).click();
    await expect(page.getByRole("heading", { name: "Team access" })).toBeVisible();
    const staffHeading = page.getByRole("heading", { name: "staff@codeedge.test" });
    await expect(staffHeading).toBeVisible();
    const staffMembership = staffHeading.locator("..");

    page.once("dialog", (dialog) => dialog.accept());
    await staffMembership.getByRole("button", { name: "Revoke staff access" }).click();
    await expect(staffMembership.getByRole("alert")).toContainText("Verify MFA before changing privileged owner settings.");
  });

  test("staff cannot open owner membership administration", async ({ page }) => {
    await signIn(page, "staff@codeedge.test");
    await page.goto("/dashboard/northfield-plumbing/members");
    await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
  });

  test("ordinary customer owners are not platform operators", async ({ page }) => {
    await signIn(page, "alice@codeedge.test");
    await page.goto("/operator");
    await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
  });

  test("password recovery keeps account existence private and uses the approved redirect flow", async ({ page }) => {
    for (const email of ["alice@codeedge.test", "missing-user@codeedge.test"]) {
      await page.goto("/forgot-password");
      await page.getByLabel("Email address").fill(email);
      await page.getByRole("button", { name: "Send reset email" }).click();
      await expect(page.getByRole("status")).toHaveText(
        "If that address has an account, a password reset email will arrive shortly.",
      );
    }

    await page.goto("/auth/confirm?token_hash=not-a-valid-token&type=recovery&redirect_to=https%3A%2F%2Fevil.example");
    await expect(page).toHaveURL(/\/sign-in\?notice=link-expired$/);
  });
});
