import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Explicit opt-in for real GoTrue/PostgREST integration. CI's Supabase job enables it.
test.describe("local Supabase authentication", () => {
  test.skip(process.env.CODEEDGE_E2E_AUTH !== "1", "Requires local Supabase and npm run dev:seed; enable CODEEDGE_E2E_AUTH=1.");

  function localAuthConfig() {
    const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid");
    if (api.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(api.hostname) || api.port !== "54321") {
      throw new Error("Authentication integration requires the local disposable Supabase API.");
    }
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!key) throw new Error("The local Supabase public key is required.");
    return { api, key };
  }

  test("email login is enabled while public signup is rejected", async ({ request }) => {
    const { api, key } = localAuthConfig();
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

  test("real Supabase TOTP enrollment returns provider-generated QR and secret", async () => {
    const { api, key } = localAuthConfig();
    const client = createClient(api.href, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await client.auth.signInWithPassword({
      email: "bob@codeedge.test",
      password: "Codeedge-local-only-123!",
    });
    expect(login.error).toBeNull();

    const enrollment = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Codeedge native CI",
    });
    expect(enrollment.error).toBeNull();
    expect(enrollment.data?.id).toMatch(/[0-9a-f-]{36}/);
    expect(enrollment.data?.totp.qr_code).toContain("data:image/svg+xml");
    expect(enrollment.data?.totp.secret.length).toBeGreaterThanOrEqual(8);

    if (enrollment.data?.id) {
      const cleanup = await client.auth.mfa.unenroll({ factorId: enrollment.data.id });
      expect(cleanup.error).toBeNull();
    }
    await client.auth.signOut();
  });

  test("owner can open Security & MFA setup for own tenant", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill("alice@codeedge.test");
    await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your businesses" })).toBeVisible();
    await page.goto("/dashboard/northfield-plumbing/security");
    await expect(page.getByRole("heading", { name: "Security & MFA" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "MFA not enabled" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Set up authenticator app" })).toBeVisible();
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
