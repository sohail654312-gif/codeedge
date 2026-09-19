import { expect, test } from "@playwright/test";
test("chat widget supports messages, retry, contact capture, persistence and mobile controls (mock transport)", async ({ page }) => {
  const messages: { sender: string; content: string; created_at: string }[] = [];
  let contactSaved = false; let fail = true;
  await page.route("**/api/chat/*", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "send" && fail) { fail = false; await route.fulfill({ status: 400, json: { error: "Try again" } }); return; }
    if (body.action === "send") messages.push({ sender: "visitor", content: body.content, created_at: new Date().toISOString() }, { sender: "assistant", content: "Confirmed fictional business answer.", created_at: new Date().toISOString() });
    if (body.action === "contact") contactSaved = true;
    await route.fulfill({ json: { messages, contactSaved } });
  });
  await page.goto("/chat/51000000-0000-4000-8000-000000000001");
  await page.getByRole("button", { name: "Chat with this business" }).click();
  await page.getByLabel("Your message").fill("Opening hours?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("region", { name: "Business chat", exact: true }).getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("Confirmed fictional business answer.");
  await page.reload(); await page.getByRole("button", { name: "Chat with this business" }).click();
  await expect(page.getByRole("log")).toContainText("Opening hours?");
  await page.getByText("Leave an enquiry (optional)", { exact: true }).click();
  await page.getByLabel("Your name").fill("Fictional Visitor"); await page.getByLabel("Phone", { exact: true }).fill("123");
  await page.getByLabel("Enquiry summary").fill("Please call"); await page.getByRole("button", { name: "Save enquiry" }).click();
  await expect(page.getByText("Your enquiry has been saved for this business.", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Close chat", exact: true }).click();
  await expect(page.getByRole("button", { name: "Chat with this business" })).toHaveAttribute("aria-expanded", "false");
});
