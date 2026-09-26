import { expect, test } from "@playwright/test";

test.describe("local Supabase FAQs and business settings", () => {
  test.skip(process.env.CODEEDGE_E2E_AUTH !== "1", "Requires disposable local Supabase with fictional seeded accounts.");
  test("owner persists FAQ CRUD while privileged settings require MFA at AAL1", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill("alice@codeedge.test");
    await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("link", { name: /Northfield Plumbing/ }).click();
    const create = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Add FAQ$/ }) });
    await create.locator("summary").click();
    await create.getByLabel("Question").fill("Do you cover Fictional Hill?");
    await create.getByLabel("Answer").fill("Yes, by appointment.");
    await create.getByRole("button", { name: "Create FAQ" }).click();
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Do you cover Fictional Hill?", exact: true }) });
    await expect(card).toBeVisible();
    await page.getByLabel("Lead notification email (optional)").fill("alerts@northfield.test");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /^Verify MFA before changing privileged owner settings\.$/ })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Lead notification email (optional)")).not.toHaveValue("alerts@northfield.test");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByLabel("Email address").fill("bob@codeedge.test");
    await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("link", { name: /Westbrook Electrical/ }).click();
    await expect(card).toHaveCount(0);
  });
});
