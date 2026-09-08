import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { requireNativeBrowser } from "./guards.ts";

if (process.env.GITHUB_ACTIONS !== "true" || !process.env.GITHUB_ENV) throw new Error("This script is only for the disposable GitHub runner.");
const cli = fileURLToPath(new URL("../../node_modules/supabase/dist/supabase.js", import.meta.url));
// Capture status in memory: never save the service-role key or full status to disk.
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "--output", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}));
const values = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
};
for (const value of Object.values(values)) {
  if (typeof value !== "string" || /[\r\n]/.test(value)) throw new Error("Missing or invalid local Supabase configuration.");
}
requireNativeBrowser({ ...process.env, ...values });
for (const field of ["ANON_KEY", "SERVICE_ROLE_KEY", "JWT_SECRET", "SECRET_KEY", "PUBLISHABLE_KEY"]) {
  const value = status[field];
  if (typeof value === "string" && value && !/[\r\n]/.test(value)) console.log(`::add-mask::${value}`);
}
appendFileSync(process.env.GITHUB_ENV, Object.entries(values).map(([name, value]) => `${name}=${value}\n`).join(""));
console.log("Configured the web application for the disposable runner's local API.");
