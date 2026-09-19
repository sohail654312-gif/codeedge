import { describe, expect, it } from "vitest";
import { leadNoteSchema, leadSchema, quoteRequestSchema } from "@/modules/leads/validation";

const valid = { contact_name: "Alex Example", phone: "020 7946 0000", email: "", source: "manual", service_id: "", enquiry_summary: "Needs an estimate.", status: "new" };

describe("lead validation", () => {
  it("accepts a phone-based lead and maps an empty service to null", () => {
    expect(leadSchema.parse(valid)).toMatchObject({ contact_name: "Alex Example", service_id: null, status: "new" });
  });
  it("accepts an email-based lead and every supported source/status", () => {
    for (const source of ["manual", "website", "whatsapp", "phone", "voice_ai"]) {
      for (const status of ["new", "contacted", "qualified", "won", "lost"]) {
        expect(leadSchema.safeParse({ ...valid, phone: "", email: "alex@example.test", source, status }).success).toBe(true);
      }
    }
  });
  it.each([
    ["contact_name", ""], ["contact_name", "x".repeat(121)], ["phone", "x".repeat(41)],
    ["email", "invalid"], ["email", "x".repeat(255)], ["source", "email"],
    ["service_id", "not-a-uuid"], ["enquiry_summary", " "], ["enquiry_summary", "x".repeat(3001)], ["status", "deleted"],
  ])("rejects invalid %s", (key, value) => {
    expect(leadSchema.safeParse({ ...valid, [key]: value }).success).toBe(false);
  });
  it("requires a phone or email", () => {
    expect(leadSchema.safeParse({ ...valid, phone: "", email: "" }).success).toBe(false);
  });
  it.each(["", " ", "x".repeat(5001)])("rejects invalid note body", (body) => {
    expect(leadNoteSchema.safeParse({ body }).success).toBe(false);
  });
  it("trims a valid internal note", () => {
    expect(leadNoteSchema.parse({ body: " Follow up tomorrow. " })).toEqual({ body: "Follow up tomorrow." });
  });
  it.each(["requested", "reviewing", "quoted", "declined"])("accepts quote status %s", (status) => {
    expect(quoteRequestSchema.safeParse({ details: "Customer asked for pricing.", status }).success).toBe(true);
  });
  it.each([["", "requested"], ["x".repeat(5001), "requested"], ["Details", "paid"]])("rejects invalid quote values", (details, status) => {
    expect(quoteRequestSchema.safeParse({ details, status }).success).toBe(false);
  });
});
