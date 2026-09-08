import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getEnvironment } from "@/server/env";
import type { Database } from "@/types/database";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`, "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const makeResponse = () => NextResponse.next({ request: { headers } });
  let response = makeResponse();
  // Public sign-in can render before configuration; protected handlers still fail closed.
  if (request.cookies.getAll().some(({ name }) => name.startsWith("sb-"))) {
    const env = getEnvironment();
    const client = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      cookieOptions: { httpOnly: true, sameSite: "lax", secure: env.NEXT_PUBLIC_APP_URL.startsWith("https:"), path: "/" },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          headers.set("cookie", request.cookies.toString());
          response = makeResponse();
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await client.auth.getClaims();
  }
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
