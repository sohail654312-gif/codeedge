import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const expectedBase = process.env.CODEEDGE_RELEASE_BASE_SHA;
const sourceSha = process.env.GITHUB_SHA;
if (process.env.GITHUB_ACTIONS !== "true" || process.env.CODEEDGE_REQUIRE_NATIVE_SUPABASE !== "1") {
  throw new Error("Release rehearsal is restricted to required native CI.");
}
if (!expectedBase || !/^[0-9a-f]{40}$/.test(expectedBase) || !sourceSha || !/^[0-9a-f]{40}$/.test(sourceSha)) {
  throw new Error("Release rehearsal requires exact Git SHAs.");
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const head = git("rev-parse", "HEAD");
if (head !== sourceSha) throw new Error("The built release candidate does not match GITHUB_SHA.");

execFileSync("git", ["merge-base", "--is-ancestor", expectedBase, head], { stdio: "ignore" });
const migrationDelta = git("diff", "--name-status", `${expectedBase}...${head}`, "--", "supabase/migrations");
if (migrationDelta) {
  throw new Error("Attempt 2 changed database migrations; the documented schema-compatible rollback boundary is invalid.");
}

const trackedChanges = git("status", "--porcelain", "--untracked-files=no");
if (trackedChanges) throw new Error("Tracked files changed during release verification.");
if (!existsSync(".next/BUILD_ID") || !readFileSync(".next/BUILD_ID", "utf8").trim()) {
  throw new Error("Production build evidence is missing.");
}

const migrations = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort();
if (migrations.length === 0 || new Set(migrations).size !== migrations.length ||
    migrations.some((name) => !/^[0-9]{14}_.+\.sql$/.test(name))) {
  throw new Error("Migration inventory is malformed.");
}
for (const required of [
  "docs/operations/pilot-runbook.md",
  "docs/operations/release-rollback.md",
  "docs/pilot-readiness-attempt-2.md",
]) {
  if (!existsSync(required)) throw new Error(`Required release evidence is missing: ${required}`);
}

console.log(
  `Release rehearsal passed for ${head}: production build exists, Attempt 2 has no schema delta, ` +
  `and application rollback to ${expectedBase} remains schema-compatible.`,
);
