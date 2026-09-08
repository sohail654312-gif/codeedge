import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/server/db/client";
import { getEnvironment } from "@/server/env";

export async function GET(request: NextRequest) {
  const url = new URL(getEnvironment().NEXT_PUBLIC_APP_URL);
  const token = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (token && token.length <= 512 && (type === "invite" || type === "recovery")) {
    const client = await createClient();
    const { error } = await client.auth.verifyOtp({ token_hash: token, type });
    if (!error) return NextResponse.redirect(new URL("/set-password", url));
  }
  return NextResponse.redirect(new URL("/sign-in?notice=link-expired", url));
}
