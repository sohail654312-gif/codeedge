import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { accounts, businesses, password } from "./local-fixtures.mjs";

const executable = fileURLToPath(new URL("../node_modules/supabase/dist/supabase.js", import.meta.url));
const status = JSON.parse(execFileSync(process.execPath, [executable, "status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const url = new URL(status.API_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.protocol !== "http:") throw new Error("Refusing to seed a non-local Supabase instance.");
if (!status.SERVICE_ROLE_KEY) throw new Error("Local Supabase service-role key unavailable. Run npm run db:start first.");
const admin = createClient(url.toString(), status.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const check = (result) => { if (result.error) throw new Error(result.error.message); return result.data; };
check(await admin.from("businesses").upsert(businesses.map((business) => ({ ...business, status: "active" }))));
const existing = check(await admin.auth.admin.listUsers({ perPage: 1000 })).users;
for (const account of accounts) {
  let user = existing.find((user) => user.email === account.email);
  if (!user) user = check(await admin.auth.admin.createUser({ email: account.email, password, email_confirm: true })).user;
  else check(await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true }));
  check(await admin.from("business_memberships").upsert({ business_id: businesses[account.business].id, user_id: user.id, role: account.role, status: account.status }));
}
console.log("Created/reset four fictional LOCAL accounts and two businesses. Login details are in README.md. No keys were written or printed.");
