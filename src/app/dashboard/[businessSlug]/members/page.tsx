import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusinessPage } from "@/server/auth/session";
import { MembershipAdmin, type MembershipRow } from "@/components/dashboard/membership-admin";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const { client, context } = await requireBusinessPage(businessSlug);
  if (context.role !== "owner") notFound();

  const [memberships, audit] = await Promise.all([
    client.rpc("list_business_memberships", { target_business: context.business.id }),
    client
      .from("admin_audit_events")
      .select("id,action,target_type,target_id,result,created_at")
      .eq("business_id", context.business.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (memberships.error || audit.error) throw new Error("Unable to load membership administration.");

  return <main id="main" className="workspace">
    <Link className="back-link" href={`/dashboard/${context.business.slug}`}>Back to workspace</Link>
    <h1>Team access</h1>
    <MembershipAdmin
      businessId={context.business.id}
      memberships={(memberships.data ?? []) as MembershipRow[]}
    />
    <section className="workspace-panel catalog-panel">
      <h2>Recent administrative activity</h2>
      {!audit.data.length && <p>No administrative changes recorded yet.</p>}
      {audit.data.map((event) => <p key={event.id} className="service-card">
        {event.action} · {event.result} · {new Date(event.created_at).toLocaleString("en-GB", { timeZone: context.business.timezone })}
      </p>)}
    </section>
  </main>;
}
