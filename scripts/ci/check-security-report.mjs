import { readFile } from "node:fs/promises";
import { assertNativeSecurityReport, requireNativeDatabase } from "./guards.ts";

if (process.env.CODEEDGE_REQUIRE_NATIVE_SUPABASE !== "1") throw new Error("This verification requires native Supabase mode.");
requireNativeDatabase(process.env);
assertNativeSecurityReport(JSON.parse(await readFile("test-results/native-security.json", "utf8")));
console.log("All native SQL security cases passed; no missing or skipped cases.");
