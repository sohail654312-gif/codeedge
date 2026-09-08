import { NextResponse } from "next/server";
import { createClient } from "@/server/db/client";
import { AccessError, requireTenant } from "@/server/authorization/tenant";
import { businessIdSchema } from "@/modules/businesses/validation";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  const parsed = businessIdSchema.safeParse((await params).businessId);
  if (!parsed.success) return NextResponse.json({ error: "Business unavailable." }, { status: 404, headers });
  try {
    const context = await requireTenant(await createClient(), { id: parsed.data });
    return NextResponse.json({ business: context.business, role: context.role }, { headers });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    return NextResponse.json({ error: "Business access is temporarily unavailable." }, { status: 503, headers });
  }
}
