import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getEnvironment } from "@/server/env";
import type { Database } from "@/types/database";

export async function createClient() {
  const env = getEnvironment();
  const jar = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: env.NEXT_PUBLIC_APP_URL.startsWith("https:"), path: "/" },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        try { items.forEach(({ name, value, options }) => jar.set(name, value, options)); }
        catch { /* Server Components cannot set cookies. Proxy performs refresh. */ }
      },
    },
  });
}
