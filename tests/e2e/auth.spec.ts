import { expect, test } from "@playwright/test";
import { localTotpCode } from "../helpers/totp-fixture";

// Explicit opt-in for real GoTrue/PostgREST integration. CI's Supabase job enables it.
test.describe("local Supabase authentication", () => {
  test.skip(process.env.CODEEDGE_E2E_AUTH !== "1", "Requires local Supabase and npm run dev:seed; enable CODEEDGE_E2E_AUTH=1.");
  test("email login is enabled while public signup is rejected", async ({ request }) => {
    const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid");
    if (api.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(api.hostname) || api.port !== "54321") {
      throw new Error("Authentication integration requires the local disposable Supabase API.");
    }
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!key) throw new Error("The local Supabase public key is required.");
    const headers = { apikey: key };
    const settings = await request.get(new URL("/auth/v1/settings", api).href, { headers });
    expect(settings.status()).toBe(200);
    expect(await settings.json()).toMatchObject({
      external: { email: true, anonymous_users: false },
      disable_signup: true,
      mailer_autoconfirm: false,
    });
    const signup = await request.post(new URL("/auth/v1/signup", api).href, {
      headers,
      data: { email: "uninvited@codeedge.test", password: "Codeedge-local-only-123!" },
    });
    expect(signup.status()).toBe(422);
    expect(await signup.json()).toMatchObject({ error_code: "signup_disabled" });
  });
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
  test("owner completes real Supabase TOTP enrollment and later AAL1 challenge", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill("bob@codeedge.test");
    await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your businesses" })).toBeVisible();

    await page.goto("/dashboard/westbrook-electrical/security");
    await expect(page.getByRole("heading", { name: "Security & MFA" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "MFA not enabled" })).toBeVisible();
    await page.getByRole("button", { name: "Set up authenticator app" }).click();
    await expect(page.getByAltText("Authenticator QR code")).toBeVisible();
    const secret = (await page.locator("code").textContent())?.trim();
    expect(secret).toBeTruthy();
    await page.getByLabel("Authenticator code").fill(localTotpCode(secret!));
    await page.getByRole("button", { name: "Enable MFA" }).click();
    await expect(page.getByRole("heading", { name: "MFA enabled" })).toBeVisible();

    await page.goto("/dashboard/westbrook-electrical");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    await page.getByLabel("Email address").fill("bob@codeedge.test");
    await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your businesses" })).toBeVisible();

    await page.goto("/dashboard/westbrook-electrical/security");
    await expect(page.getByRole("heading", { name: "MFA challenge required" })).toBeVisible();
    await page.getByLabel("Authenticator code").fill(localTotpCode(secret!, Date.now() + 30_000));
    await page.getByRole("button", { name: "Verify MFA" }).click();
    await expect(page.getByRole("heading", { name: "MFA enabled" })).toBeVisible();

    await page.goto("/dashboard/westbrook-electrical");
    await page.getByLabel("Lead notification email (optional)").fill("mfa-owner@westbrook.test");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Business settings saved\.$/ })).toBeVisible();
  });

  test("staff cannot open owner MFA configuration", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill("staff@codeedge.test");
    await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your businesses" })).toBeVisible();
    await page.goto("/dashboard/northfield-plumbing/security");
    await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
  });

  test("revoked user signs in but receives no business access", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill("revoked@codeedge.test");
    await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No business access" })).toBeVisible();
  });
});
