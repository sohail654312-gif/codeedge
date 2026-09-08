import { describe, expect, it } from "vitest";
import { parseEnvironment } from "@/server/env";
const valid = { NEXT_PUBLIC_APP_URL: "http://localhost:3000", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test_placeholder_only" };
describe("environment boundary", () => {
  it("accepts local public configuration", () => { expect(parseEnvironment(valid)).toEqual(valid); });
  it("fails closed when configuration is missing", () => { expect(() => parseEnvironment({})).toThrow(/NEXT_PUBLIC_SUPABASE/); });
  it("rejects secret keys without printing them", () => {
    const secret = "sb_secret_this_must_never_appear_in_an_error";
    try { parseEnvironment({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret }); throw new Error("Unexpected success"); }
    catch (error) { expect(String(error)).toContain("Invalid or missing"); expect(String(error)).not.toContain(secret); }
  });
  it("rejects legacy service-role keys", () => {
    const key = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    expect(() => parseEnvironment({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toThrow();
  });
  it("accepts a legacy anon key for local Supabase", () => {
    const key = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
    expect(parseEnvironment({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key }).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(key);
  });
  it.each(["http://remote.example", "https://user:password@example.com", "javascript:alert(1)"])("rejects unsafe URL %s", (url) => {
    expect(() => parseEnvironment({ ...valid, NEXT_PUBLIC_SUPABASE_URL: url })).toThrow();
  });
});
