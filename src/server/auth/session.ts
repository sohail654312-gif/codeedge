import "server-only";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/server/db/client";
import { AccessError, requireTenant, verifiedUser } from "@/server/authorization/tenant";

export async function requireSession() {
  const client = await createClient();
  try { return { client, user: await verifiedUser(client) }; }
  catch (error) { if (error instanceof AccessError) redirect("/sign-in"); throw error; }
}

export async function requireBusinessPage(slug: string) {
  const client = await createClient();
  try { return { client, context: await requireTenant(client, { slug }) }; }
  catch (error) {
    if (error instanceof AccessError) { if (error.status === 401) redirect("/sign-in"); notFound(); }
    throw error;
  }
}
