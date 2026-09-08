import type { FullResult, Reporter, Suite } from "@playwright/test/reporter";
import { assertPassingCases } from "../../scripts/ci/guards";

export default class NativeIntegrationReporter implements Reporter {
  private suite?: Suite;

  onBegin(_config: unknown, suite: Suite) { this.suite = suite; }

  async onEnd(result: FullResult) {
    try {
      if (result.status !== "passed") throw new Error("Native browser integration did not pass.");
      assertPassingCases((this.suite?.allTests() ?? []).map((test) => ({
        file: test.location.file,
        // Expected failures must not count as successful security coverage.
        outcome: test.expectedStatus === "passed" && test.outcome() === "expected" ? "passed" : test.outcome(),
      })), { "tests/e2e/auth.spec.ts": 3, "tests/e2e/shell.spec.ts": 2 });
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Native browser verification failed.");
      return { status: "failed" as const };
    }
  }
}
