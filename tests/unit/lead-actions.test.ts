import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteLead, deleteLeadNote, deleteQuoteRequest, saveLead, saveLeadNote, saveQuoteRequest } from "@/modules/leads/actions";
import { createClient } from "@/server/db/client";

vi.mock("@/server/db/client", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));

const own = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const leadId = "30000000-0000-4000-8000-000000000001";
const recordId = "40000000-0000-4000-8000-000000000001";

type Mode = "owner" | "owner-aal1" | "staff" | "revoked" | "anonymous" | "other" | "hidden-lead" | "hidden-write";
function setup(mode: Mode = "owner") {
  const calls: { table: string; operation?: string; values?: unknown; filters: unknown[][] }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table, filters: [] } as typeof calls[number]; calls.push(call);
    const row = () => {
      if (table === "businesses") return mode === "other" ? null : { id: own, slug: "business-a", status: "active" };
      if (table === "business_memberships") return mode === "revoked" ? null : { role: mode === "staff" ? "staff" : "owner" };
      if (table === "leads" && !call.operation) return mode === "hidden-lead" ? null : { id: leadId };
      return mode === "hidden-write" ? null : { id: call.operation === "insert" && table === "leads" ? leadId : recordId };
    };
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn((...args: unknown[]) => { call.filters.push(args); return chain; }),
      insert: vi.fn((values: unknown) => { call.operation = "insert"; call.values = values; return chain; }),
      update: vi.fn((values: unknown) => { call.operation = "update"; call.values = values; return chain; }),
      delete: vi.fn(() => { call.operation = "delete"; return chain; }),
      single: vi.fn(async () => ({ data: row(), error: null })), maybeSingle: vi.fn(async () => ({ data: row(), error: null })),
    };
    return chain;
  });
  vi.mocked(createClient).mockResolvedValue({ from, auth: { getUser: async () => ({ data: { user: mode === "anonymous" ? null : { id: "user-a", email_confirmed_at: "2026-09-19" } }, error: null }), mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: mode === "owner-aal1" ? "aal1" : "aal2", nextLevel: "aal2", currentAuthenticationMethods: [] }, error: null }), listFactors: async () => ({ data: { all: [], phone: [], totp: [{ id: "81000000-0000-4000-8000-000000000001", status: "verified", factor_type: "totp" }] }, error: null }) } } } as unknown as Awaited<ReturnType<typeof createClient>>);
  return calls;
}

function leadForm(update = false) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ businessId: own, contact_name: "Alex Example", phone: "020 7000 0000", email: "", source: "manual", service_id: "", enquiry_summary: "Needs a quote.", status: "new" })) form.set(key, value);
  if (update) form.set("leadId", leadId);
  return form;
}
function childForm(kind: "note" | "quote", update = false) {
  const form = new FormData(); form.set("businessId", own); form.set("leadId", leadId);
  if (kind === "note") { form.set("body", "Call tomorrow."); if (update) form.set("noteId", recordId); }
  else { form.set("details", "Prepare estimate."); form.set("status", "requested"); if (update) form.set("quoteRequestId", recordId); }
  return form;
}

beforeEach(() => vi.clearAllMocks());

describe("lead actions enforce live tenant authorization", () => {
  const actions = [
    ["saveLead", saveLead, () => leadForm()], ["saveLeadNote", saveLeadNote, () => childForm("note")],
    ["saveQuoteRequest", saveQuoteRequest, () => childForm("quote")], ["deleteLead", deleteLead, () => leadForm(true)],
    ["deleteLeadNote", deleteLeadNote, () => childForm("note", true)], ["deleteQuoteRequest", deleteQuoteRequest, () => childForm("quote", true)],
  ] as const;
  for (const [name, action, makeForm] of actions) {
    it.each(["anonymous", "revoked", "other"] as const)(`${name} denies %s before CRM access`, async (mode) => {
      const calls = setup(mode); const form = makeForm(); if (mode === "other") form.set("businessId", other);
      expect(await action({}, form)).toHaveProperty("error");
      expect(calls.every((call) => ["businesses", "business_memberships"].includes(call.table))).toBe(true);
    });
    it(`${name} rejects malformed tenant selectors`, async () => {
      const calls = setup(); const form = makeForm(); form.set("businessId", "invalid");
      expect(await action({}, form)).toHaveProperty("error"); expect(calls).toEqual([]);
    });
  }

  it("requires AAL2 before cascade-deleting a lead", async () => {
    const calls = setup("owner-aal1");
    expect(await deleteLead({}, leadForm(true))).toMatchObject({ error: "Verify MFA before changing privileged owner settings." });
    expect(calls.every((call) => ["businesses", "business_memberships"].includes(call.table))).toBe(true);
  });
  it.each([[deleteLeadNote, () => childForm("note", true)], [deleteQuoteRequest, () => childForm("quote", true)]] as const)("keeps lower-risk owner cleanup available at AAL1", async (action, makeForm) => {
    const calls = setup("owner-aal1");
    expect(await action({}, makeForm())).toHaveProperty("success");
    expect(calls.some((call) => call.operation === "delete")).toBe(true);
  });

  it.each([[deleteLead, () => leadForm(true)], [deleteLeadNote, () => childForm("note", true)], [deleteQuoteRequest, () => childForm("quote", true)]] as const)("staff cannot run owner-only delete", async (action, makeForm) => {
    const calls = setup("staff"); expect(await action({}, makeForm())).toHaveProperty("error");
    expect(calls.every((call) => ["businesses", "business_memberships"].includes(call.table))).toBe(true);
  });
  it("creates a lead using authenticated tenant and creator", async () => {
    const calls = setup("staff"); const form = leadForm(); form.set("business_id", other); form.set("created_by", "attacker");
    expect(await saveLead({}, form)).toHaveProperty("success");
    expect(calls.find((call) => call.operation === "insert")?.values).toMatchObject({ business_id: own, created_by: "user-a", contact_name: "Alex Example" });
  });
  it("scopes lead updates to tenant and record", async () => {
    const calls = setup("hidden-write"); expect(await saveLead({}, leadForm(true))).toHaveProperty("error");
    expect(calls.find((call) => call.operation === "update")?.filters).toEqual([["business_id", own], ["id", leadId]]);
  });
  it.each([["note", saveLeadNote], ["quote", saveQuoteRequest]] as const)("creates %s only after a tenant-scoped lead lookup", async (kind, action) => {
    const calls = setup("staff"); expect(await action({}, childForm(kind))).toHaveProperty("success");
    expect(calls.find((call) => call.table === "leads")?.filters).toEqual([["business_id", own], ["id", leadId]]);
    expect(calls.find((call) => call.operation === "insert")?.values).toMatchObject({ business_id: own, lead_id: leadId, created_by: "user-a" });
  });
  it.each([["note", saveLeadNote], ["quote", saveQuoteRequest]] as const)("fails closed when %s parent lead is hidden", async (kind, action) => {
    const calls = setup("hidden-lead"); expect(await action({}, childForm(kind))).toHaveProperty("error");
    expect(calls.some((call) => call.operation)).toBe(false);
  });
  it.each([["note", saveLeadNote], ["quote", saveQuoteRequest]] as const)("scopes %s updates by tenant, lead and record", async (kind, action) => {
    const calls = setup("hidden-write"); expect(await action({}, childForm(kind, true))).toHaveProperty("error");
    const table = kind === "note" ? "lead_notes" : "quote_requests";
    expect(calls.find((call) => call.table === table)?.filters).toEqual([["business_id", own], ["lead_id", leadId], ["id", recordId]]);
  });
  it("rejects invalid lead values before a write", async () => {
    const calls = setup(); const form = leadForm(); form.set("phone", "");
    expect(await saveLead({}, form)).toHaveProperty("error"); expect(calls.some((call) => call.operation)).toBe(false);
  });
});
