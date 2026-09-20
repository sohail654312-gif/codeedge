import { describe, expect, it } from "vitest";
import { settingsSchema } from "@/modules/settings/validation";

describe("business settings validation", () => {
  it("accepts minimal safe settings", () => {
    expect(settingsSchema.parse({ locale: "en-GB", lead_notification_email: "", notify_new_leads: true })).toEqual({ locale: "en-GB", lead_notification_email: "", notify_new_leads: true });
  });
  it("normalizes surrounding whitespace", () => {
    expect(settingsSchema.parse({ locale: " fr-FR ", lead_notification_email: " owner@example.test ", notify_new_leads: false })).toMatchObject({ locale: "fr-FR", lead_notification_email: "owner@example.test" });
  });
  it.each(["", "x", "en GB", "en_GB", "<script>", "a".repeat(36)])("rejects unsafe locale %s", (locale) => {
    expect(settingsSchema.safeParse({ locale, lead_notification_email: "", notify_new_leads: true }).success).toBe(false);
  });
  it.each(["owner", "owner@", "@example.test", "two words@example.test", `${"a".repeat(245)}@example.test`])("rejects invalid notification email %s", (lead_notification_email) => {
    expect(settingsSchema.safeParse({ locale: "en-GB", lead_notification_email, notify_new_leads: true }).success).toBe(false);
  });
  it("requires a boolean notification flag", () => {
    expect(settingsSchema.safeParse({ locale: "en-GB", lead_notification_email: "", notify_new_leads: "true" }).success).toBe(false);
  });
});
