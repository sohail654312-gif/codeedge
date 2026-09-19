import { describe, expect, it } from "vitest";
import { assertNativeSecurityReport, assertPassingCases, assertRequiredSteps, requiredSteps, requireNativeBrowser, requireNativeDatabase } from "../../scripts/ci/guards";

const native = {
  CODEEDGE_REQUIRE_NATIVE_SUPABASE: "1",
  CODEEDGE_TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  CODEEDGE_E2E_AUTH: "1",
  PLAYWRIGHT_USE_BUILD: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fictional_unit_test_only",
};

describe.each(["application", "native"] as const)("%s required CI step execution", (stage) => {
  const completed = () => Object.fromEntries(requiredSteps[stage].map((id) => [id, { outcome: "success", conclusion: "success" }]));
  it("accepts all required steps having executed successfully", () => {
    expect(() => assertRequiredSteps(completed(), stage)).not.toThrow();
  });
  it.each(["failure", "skipped", "cancelled", ""])("blocks any required step with outcome %s even if the conclusion is success", (outcome) => {
    for (const id of requiredSteps[stage]) {
      expect(() => assertRequiredSteps({ ...completed(), [id]: { outcome, conclusion: "success" } }, stage)).toThrow(id);
    }
  });
  it("rejects an omitted required step", () => {
    for (const id of requiredSteps[stage]) {
      const steps = completed();
      delete steps[id];
      expect(() => assertRequiredSteps(steps, stage)).toThrow(id);
    }
  });
  it("rejects missing or malformed execution evidence", () => {
    for (const value of [null, {}, [], "success"]) {
      expect(() => assertRequiredSteps(value, stage)).toThrow();
    }
  });
});

describe("native CI cannot silently downgrade verification", () => {
  it("preserves credential-free PGlite for the local test command", () => {
    expect(requireNativeDatabase({})).toBeUndefined();
    expect(() => requireNativeBrowser({})).not.toThrow();
  });
  it("refuses PGlite fallback when native verification is required", () => {
    expect(() => requireNativeDatabase({ CODEEDGE_REQUIRE_NATIVE_SUPABASE: "1" })).toThrow("refusing the PGlite fallback");
  });
  it("accepts the runner's disposable stack", () => {
    expect(requireNativeDatabase(native)).toBe(native.CODEEDGE_TEST_DATABASE_URL);
    expect(() => requireNativeBrowser(native)).not.toThrow();
  });
  it.each([
    "postgresql://postgres:fictional@example.test:54322/postgres",
    "https://127.0.0.1:54322/postgres",
    "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
    "postgresql://postgres:postgres@127.0.0.1:54322/customer_data",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=example.test",
  ])("rejects an inappropriate native database target: %s", (url) => {
    expect(() => requireNativeDatabase({ ...native, CODEEDGE_TEST_DATABASE_URL: url })).toThrow();
  });
  it.each([
    { CODEEDGE_E2E_AUTH: undefined },
    { CODEEDGE_E2E_AUTH: "0" },
    { PLAYWRIGHT_USE_BUILD: undefined },
    { NEXT_PUBLIC_SUPABASE_URL: "https://example.test" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test_placeholder_only" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "key\nINJECTED_ENV=1" },
  ])("rejects disabled auth or unsafe browser configuration: %j", (override) => {
    expect(() => requireNativeBrowser({ ...native, ...override })).toThrow();
  });
});

describe("required integration evidence", () => {
  const report = (status = "passed", count = 31) => ({
    success: true,
    testResults: [
      ["tenant-isolation.test.ts", count], ["catalog-isolation.test.ts", 1], ["coverage-isolation.test.ts", 1],
      ["faq-isolation.test.ts", 1], ["settings-isolation.test.ts", 1], ["lead-isolation.test.ts", 1], ["chat-isolation.test.ts", 1],
    ].map(([name, cases]) => ({ name: `/runner/tests/security/${name}`, status: "passed", assertionResults: Array.from({ length: Number(cases) }, () => ({ status })) })),
  });
  it("accepts complete passing native SQL results", () => {
    expect(() => assertNativeSecurityReport(report())).not.toThrow();
  });
  it.each(["pending", "skipped", "todo", "failed"])("blocks %s SQL tests", (status) => {
    expect(() => assertNativeSecurityReport(report(status))).toThrow();
  });
  it("blocks missing, truncated and failed report files", () => {
    for (const value of [{}, report("passed", 0), report("passed", 30), { ...report(), success: false }]) {
      expect(() => assertNativeSecurityReport(value)).toThrow();
    }
  });
  it("requires the actual security suite, not an unrelated passing file", () => {
    const value = report();
    value.testResults[0]!.name = "/runner/tests/unit/other.test.ts";
    expect(() => assertNativeSecurityReport(value)).toThrow();
  });
  it.each(["skipped", "flaky", "unexpected", "failed"])("blocks %s browser results", (outcome) => {
    expect(() => assertPassingCases([{ file: "/runner/tests/e2e/auth.spec.ts", outcome }], { "tests/e2e/auth.spec.ts": 1 })).toThrow();
  });
  it("blocks a shell-only browser run", () => {
    expect(() => assertPassingCases([{ file: "/runner/tests/e2e/shell.spec.ts", outcome: "passed" }], { "tests/e2e/auth.spec.ts": 3 })).toThrow();
  });
  it("accepts complete browser coverage on Windows and Linux", () => {
    expect(() => assertPassingCases([
      { file: "C:\\repo\\tests\\e2e\\auth.spec.ts", outcome: "passed" },
      { file: "/runner/tests/e2e/shell.spec.ts", outcome: "passed" },
    ], { "tests/e2e/auth.spec.ts": 1, "tests/e2e/shell.spec.ts": 1 })).not.toThrow();
  });
});
