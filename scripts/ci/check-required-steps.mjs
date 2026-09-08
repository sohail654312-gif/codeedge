import { appendFileSync } from "node:fs";
import { assertRequiredSteps, requireNativeBrowser } from "./guards.ts";

const stage = process.argv[2];
if (stage !== "application" && stage !== "native") throw new Error("Expected application or native verification stage.");
if (process.env.GITHUB_ACTIONS !== "true" || !process.env.GITHUB_OUTPUT) throw new Error("Step verification requires GitHub Actions.");
if (stage === "native") {
  if (process.env.CODEEDGE_REQUIRE_NATIVE_SUPABASE !== "1") throw new Error("Native verification cannot be disabled.");
  requireNativeBrowser(process.env);
}
assertRequiredSteps(JSON.parse(process.env.CODEEDGE_STEP_RESULTS ?? "null"), stage);
appendFileSync(process.env.GITHUB_OUTPUT, "verified=true\n");
console.log(`All required ${stage} steps executed successfully.`);
