import { describe, expect, it } from "vitest";
import { profileSchema, serviceSchema } from "@/modules/catalog/validation";
const profile = { trading_name: "", phone: "", email: "", website: "", address: "", description: "", category: "", logo_alt: "" };
const service = { name: "Boiler servicing", description: "Annual service", active: true, quote_required: true, starting_price_pence: "89.99", display_order: "2" };
describe("catalog validation", () => {
  it("stores exact GBP pence, including zero and no price", () => {
    expect(serviceSchema.parse(service).starting_price_pence).toBe(8999);
    expect(serviceSchema.parse({ ...service, starting_price_pence: "0" }).starting_price_pence).toBe(0);
    expect(serviceSchema.parse({ ...service, starting_price_pence: "" }).starting_price_pence).toBeNull();
  });
  it.each(["-1", "1.001", "Infinity", "1e2", "1000000.01"])("rejects invalid price %s", (price) => {
    expect(serviceSchema.safeParse({ ...service, starting_price_pence: price }).success).toBe(false);
  });
  it.each(["-1", "1.5", "10001", ""])("rejects invalid display order %s", (order) => {
    expect(serviceSchema.safeParse({ ...service, display_order: order }).success).toBe(false);
  });
  it.each(["javascript:alert(1)", "data:text/html,test", "http://example.com", "https://user:secret@example.com"])("rejects unsafe website %s", (website) => {
    expect(profileSchema.safeParse({ ...profile, website }).success).toBe(false);
  });
  it("accepts a complete profile and strips ownership fields", () => {
    const result = profileSchema.parse({ ...profile, website: "https://example.com", phone: "+44 (0)20 1234 5678", business_id: "forged" });
    expect(result.website).toBe("https://example.com"); expect(result).not.toHaveProperty("business_id");
  });
  it("rejects oversized profile and service descriptions", () => {
    expect(profileSchema.safeParse({ ...profile, description: "a".repeat(3001) }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...service, description: "a".repeat(3001) }).success).toBe(false);
  });
});
