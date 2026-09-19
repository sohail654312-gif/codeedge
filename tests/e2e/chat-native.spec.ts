import { expect, test } from "@playwright/test";
test.describe("native website chat", () => {
  test.skip(process.env.CODEEDGE_E2E_AUTH !== "1", "Requires disposable native Supabase.");
  test("owner enables public chat, visitor persists messages and CRM lead, other tenant is denied", async ({ page, browser }) => {
    test.setTimeout(90000);
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill("alice@codeedge.test"); await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("link", { name: /Northfield Plumbing/ }).click();
    await page.getByRole("link", { name: "Open conversations" }).click();
    await page.getByLabel("Enable public website chat").check(); await page.getByRole("button", { name: "Save chat availability" }).click();
    const href = await page.getByRole("link", { name: "Open public chatbot" }).getAttribute("href");
    expect(href).toBeTruthy();
    const visitorContext = await browser.newContext();
    try {
      const visitor = await visitorContext.newPage(); await visitor.goto(`http://localhost:3000${href}`);
      await visitor.getByRole("button", { name: "Chat with this business" }).click();
      await visitor.getByLabel("Your message").fill("Fictional browser chat enquiry"); await visitor.getByRole("button", { name: "Send message", exact: true }).click();
      await expect(visitor.getByRole("log")).toContainText("Assistant");
      const cookies = await visitorContext.cookies(`http://localhost:3000/api/chat/${href!.split("/").at(-1)}`);
      expect(cookies.some((cookie) => cookie.name.startsWith("ce_chat_") && cookie.httpOnly && cookie.sameSite === "Strict")).toBe(true);
      await visitor.reload(); await visitor.getByRole("button", { name: "Chat with this business" }).click();
      await expect(visitor.getByRole("log")).toContainText("Fictional browser chat enquiry");
      await visitor.getByText("Leave an enquiry (optional)", { exact: true }).click();
      await visitor.getByLabel("Your name").fill("Fictional Chat Customer"); await visitor.getByLabel("Phone", { exact: true }).fill("12345");
      await visitor.getByLabel("Enquiry summary").fill("Fictional website enquiry"); await visitor.getByRole("button", { name: "Save enquiry" }).click();
      await expect(visitor.getByText("Your enquiry has been saved for this business.", { exact: true })).toBeVisible();
    } finally { await visitorContext.close(); }
    await page.reload(); await page.getByRole("link", { name: /Website conversation ·/ }).first().click();
    await expect(page.getByText("Fictional browser chat enquiry", { exact: true })).toBeVisible();
    const chatUrl = page.url(); await page.getByRole("link", { name: "View associated lead" }).click();
    await expect(page.getByRole("heading", { name: "Fictional Chat Customer" })).toBeVisible();
    await page.goto("/dashboard"); await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByLabel("Email address").fill("bob@codeedge.test"); await page.getByLabel("Password", { exact: true }).fill("Codeedge-local-only-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your businesses" })).toBeVisible();
    await page.goto(chatUrl); await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
  });
});
