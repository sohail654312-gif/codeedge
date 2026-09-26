import { describe, expect, it } from "vitest";
import { faqSchema } from "@/modules/faqs/validation";
import type { BusinessFaqFields } from "@/types/database";

const valid = { question: " Where do you work? ", answer: " Locally. ", is_active: true, display_order: "0" };
describe("FAQ validation", () => {
  it("trims required text and produces schema-aligned editable fields", () => {
    const result: BusinessFaqFields = faqSchema.parse(valid);
    expect(result).toEqual({ question: "Where do you work?", answer: "Locally.", is_active: true, display_order: 0 });
  });
  it("accepts length/order boundaries and inactive status", () => {
    expect(faqSchema.parse({ question: "q".repeat(300), answer: "a".repeat(4000), is_active: false, display_order: "10000" })).toMatchObject({ is_active: false, display_order: 10000 });
  });
  it("does not carry forged ownership or immutable fields into writes", () => {
    expect(faqSchema.parse({ ...valid, business_id: "forged", id: "forged", created_at: "forged", updated_at: "forged" })).toEqual(faqSchema.parse(valid));
  });
  it.each([
    { question: "" }, { question: " \t\n " }, { question: null }, { question: undefined }, { question: "q".repeat(301) },
    { answer: "" }, { answer: " \t\n " }, { answer: null }, { answer: undefined }, { answer: "a".repeat(4001) },
    { is_active: "false" }, { is_active: 1 }, { is_active: null }, { is_active: undefined },
    { display_order: "-1" }, { display_order: "1.5" }, { display_order: "10001" }, { display_order: "" }, { display_order: "1e2" },
  ])("rejects invalid FAQ input %j", (change) => {
    expect(faqSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});
