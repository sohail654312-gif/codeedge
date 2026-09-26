import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string, business: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(business) }).click();
}
test.describe("local Supabase service areas and opening hours", () => {
  test.skip(process.env.CODEEDGE_E2E_AUTH !== "1", "Requires disposable local Supabase with fictional seeded accounts.");
  test("owner persists service-area edits while deletion requires MFA at AAL1", async ({ page }) => {
    test.setTimeout(60000); // Multiple sign-in journeys plus CRUD, not relaxed assertions.
    await signIn(page, "alice@codeedge.test", "Northfield Plumbing");
    const create = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Add service area$/ }) });
    await create.locator("summary").click();
    await create.getByLabel("Area, town or city").fill("Fictional Westminster coverage");
    await create.getByLabel("UK postcode or outward code (optional)", { exact: true }).fill("sw1a1aa");
    await create.getByRole("button", { name: "Create service area", exact: true }).click();
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Fictional Westminster coverage", exact: true }) });
    await expect(card.getByText("Active · SW1A 1AA", { exact: true })).toBeVisible();
    await card.locator("summary").click();
    await card.getByLabel("Coverage notes").fill("Appointments within this area only.");
    await card.getByLabel("Active", { exact: true }).uncheck();
    await card.getByRole("button", { name: "Save service area", exact: true }).click();
    await expect(card.getByText("Inactive · SW1A 1AA", { exact: true })).toBeVisible();
    await page.reload();
    await expect(card.locator("p").filter({ hasText: /^Appointments within this area only\.$/ })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await signIn(page, "bob@codeedge.test", "Westbrook Electrical");
    await expect(page.getByRole("heading", { name: "Service areas", exact: true })).toBeVisible();
    await expect(card).toHaveCount(0);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await signIn(page, "alice@codeedge.test", "Northfield Plumbing");
    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "Delete service area", exact: true }).click();
    await expect(card.getByRole("alert")).toHaveText("Verify MFA before changing privileged owner settings.");
    await expect(card).toBeVisible();
    await page.reload();
    await expect(card).toBeVisible();
  });
  test("owner saves opening hours and a closed day without times", async ({ page }) => {
    await signIn(page, "alice@codeedge.test", "Northfield Plumbing");
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
      await expect(page.getByRole("heading", { name: day, exact: true })).toBeVisible();
    }
    const monday = page.locator("article").filter({ has: page.getByRole("heading", { name: "Monday", exact: true }) });
    await monday.locator("summary").click();
    await monday.getByLabel("Closed", { exact: true }).uncheck();
    await monday.getByLabel("Opening time", { exact: true }).fill("08:30");
    await monday.getByLabel("Closing time", { exact: true }).fill("17:45");
    await monday.getByRole("button", { name: "Save Monday hours", exact: true }).click();
    await expect(monday.getByText("08:30–17:45", { exact: true })).toBeVisible();
    await page.reload();
    await expect(monday.getByText("08:30–17:45", { exact: true })).toBeVisible();
    await monday.locator("summary").click();
    await monday.getByLabel("Closed", { exact: true }).check();
    await expect(monday.getByLabel("Opening time", { exact: true })).toBeDisabled();
    await monday.getByRole("button", { name: "Save Monday hours", exact: true }).click();
    await expect(monday.locator("p").filter({ hasText: /^Closed$/ })).toBeVisible();
    await page.reload();
    await expect(monday.locator("p").filter({ hasText: /^Closed$/ })).toBeVisible();
  });
});
