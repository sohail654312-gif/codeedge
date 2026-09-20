import { z } from "zod";

type Environment = Record<string, string | undefined>;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const requiredSteps = {
  application: ["install", "lint", "typecheck", "tests", "build", "browser_install", "browser"],
  native: ["install", "start", "migrate", "environment", "pgtap", "security", "security_report", "seed", "build", "browser_install", "browser"],
} as const;

export function assertRequiredSteps(value: unknown, stage: keyof typeof requiredSteps) {
  const steps = z.record(z.string(), z.unknown()).parse(value);
  const successfulStep = z.object({ outcome: z.literal("success") });
  for (const id of requiredSteps[stage]) {
    // outcome is the original result, before any continue-on-error conversion.
    if (!successfulStep.safeParse(steps[id]).success) {
      throw new Error(`Required ${stage} step did not execute successfully: ${id}`);
    }
  }
}

export function requireNativeDatabase(env: Environment) {
  const value = env.CODEEDGE_TEST_DATABASE_URL;
  if (env.CODEEDGE_REQUIRE_NATIVE_SUPABASE === "1" && !value) {
    throw new Error("Native Supabase is required; refusing the PGlite fallback.");
  }
  if (value) {
    const url = new URL(value);
    if (!loopbackHosts.has(url.hostname) || !["postgres:", "postgresql:"].includes(url.protocol)) {
      throw new Error("Security tests require a LOCAL disposable PostgreSQL database.");
    }
    // CI must target precisely the disposable stack configured in supabase/config.toml.
    if (env.CODEEDGE_REQUIRE_NATIVE_SUPABASE === "1" && (url.port !== "54322" || url.pathname !== "/postgres" || url.search)) {
      throw new Error("Native CI requires the runner database on port 54322 with no connection overrides.");
    }
  }
  return value;
}

export function requireNativeBrowser(env: Environment) {
  if (env.CODEEDGE_REQUIRE_NATIVE_SUPABASE !== "1") return;
  requireNativeDatabase(env);
  const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid");
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (env.CODEEDGE_E2E_AUTH !== "1" || env.PLAYWRIGHT_USE_BUILD !== "1") {
    throw new Error("Native CI requires enabled authentication tests against the production build.");
  }
  if (!loopbackHosts.has(url.hostname) || url.protocol !== "http:" || url.port !== "54321") {
    throw new Error("Native browser tests require the runner's loopback Supabase API.");
  }
  if (!key || key.includes("placeholder") || /[\r\n]/.test(key)) {
    throw new Error("Native browser tests require the actual local public key.");
  }
}

export type CompletedCase = { file: string; outcome: string };

export function assertPassingCases(cases: CompletedCase[], required: Record<string, number>) {
  if (cases.length === 0 || cases.some((item) => item.outcome !== "passed")) {
    throw new Error("Required integration cases must all pass; skipped, flaky, failed, or empty runs are blocked.");
  }
  for (const [file, minimum] of Object.entries(required)) {
    const count = cases.filter((item) => item.file.replaceAll("\\", "/").endsWith(`/${file}`)).length;
    if (count < minimum) throw new Error(`Required integration coverage is missing from ${file}.`);
  }
}

const securityReport = z.object({
  success: z.literal(true),
  testResults: z.array(z.object({
    name: z.string(),
    status: z.literal("passed"),
    assertionResults: z.array(z.object({ status: z.string() })),
  })),
});

export function assertNativeSecurityReport(value: unknown) {
  const report = securityReport.parse(value);
  assertPassingCases(report.testResults.flatMap((file) => file.assertionResults.map((test) => ({
    file: file.name, outcome: test.status,
  }))), {
    "tests/security/tenant-isolation.test.ts": 31,
    "tests/security/catalog-isolation.test.ts": 1,
    "tests/security/coverage-isolation.test.ts": 1,
    "tests/security/faq-isolation.test.ts": 1,
    "tests/security/settings-isolation.test.ts": 1,
    "tests/security/lead-isolation.test.ts": 1,
    "tests/security/chat-isolation.test.ts": 1,
    "tests/security/ai-isolation.test.ts": 1,
  });
}
