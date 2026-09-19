import { expect, test } from "@playwright/test";

test.describe("local Supabase lead CRM", () => {
  test.skip(process.env.CODEEDGE_E2E_AUTH !== "1", "Requires disposable local Supabase with fictional seeded accounts.");
  test("owner persists a lead, note and quote request while another tenant cannot access it", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill("alice@codeedge.test");
    await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("link", { name: /Northfield Plumbing/ }).click();
    await page.getByRole("link", { name: "Open leads" }).click();
    await page.getByLabel("Contact name").fill("Fictional CRM Customer");
    await page.getByLabel("Phone").fill("020 7000 0000");
    await page.getByLabel("Enquiry summary").fill("Needs a fictional service estimate.");
    await page.getByRole("button", { name: "Create lead" }).click();
    await page.getByRole("link", { name: "Fictional CRM Customer" }).click();
    await page.getByLabel("New internal note").fill("Call back tomorrow.");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.locator("p.plain-text").filter({ hasText: /^Call back tomorrow\.$/ })).toBeVisible();
    await page.getByLabel("Quote request details").first().fill("Prepare an itemised estimate.");
    await page.getByRole("button", { name: "Add quote request" }).click();
    await expect(page.locator("p.plain-text").filter({ hasText: /^Prepare an itemised estimate\.$/ })).toBeVisible();
    const leadUrl = page.url();
    await page.goto("/dashboard"); await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByLabel("Email address").fill("bob@codeedge.test");
    await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("link", { name: /Westbrook Electrical/ }).click();
    await page.getByRole("link", { name: "Open leads" }).click();
    await expect(page.getByText("Fictional CRM Customer", { exact: true })).toHaveCount(0);
    await page.goto(leadUrl);
    await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
  });
});
