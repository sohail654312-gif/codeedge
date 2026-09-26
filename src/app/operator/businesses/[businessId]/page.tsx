import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/server/db/client";
import { AccessError } from "@/server/authorization/tenant";
import { requirePrivilegedOperator } from "@/server/authorization/operator";
import { operatorBusinessIdSchema } from "@/modules/operator/validation";
import { InviteStaffForm, OperatorRevokeStaffForm } from "@/components/operator/operator-forms";

export default async function OperatorBusinessPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const parsed = operatorBusinessIdSchema.safeParse((await params).businessId);
  if (!parsed.success) notFound();
  const businessId = parsed.data;
  const client = await createClient();

  try {
    await requirePrivilegedOperator(client);
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.status === 401) redirect("/sign-in");
      if (error.status === 403) redirect("/operator/security");
      notFound();
    }
    throw error;
  }

  const [businesses, memberships, audit] = await Promise.all([
    client.rpc("operator_list_businesses"),
    client.rpc("operator_list_memberships", { target_business: businessId }),
    client
      .from("admin_audit_events")
      .select("id,action,target_type,target_id,result,created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (businesses.error || memberships.error || audit.error) {
    throw new Error("Unable to load operator business administration.");
  }
  const business = (businesses.data ?? []).find((item) => item.id === businessId);
  if (!business) notFound();

  return <main id="main" className="workspace">
    <Link className="back-link" href="/operator">Operator console</Link>
    <h1>{business.name}</h1>
    <p className="muted">{business.slug} · {business.status}</p>

    <section className="workspace-panel">
      <h2>Invite or reactivate staff</h2>
      <p className="muted">The target is explicitly scoped to this tenant. Existing owners cannot be changed through this action.</p>
      <InviteStaffForm businessId={business.id} />
    </section>

    <section className="workspace-panel catalog-panel">
      <h2>Memberships</h2>
      {(memberships.data ?? []).map((membership) => <article className="service-card" key={membership.user_id}>
        <h3>{membership.email || membership.user_id}</h3>
        <p>{membership.role} · {membership.status}</p>
        {membership.role === "staff" && membership.status === "active"
          ? <OperatorRevokeStaffForm businessId={business.id} userId={membership.user_id} />
          : null}
      </article>)}
    </section>

    <section className="workspace-panel catalog-panel">
      <h2>Administrative audit trail</h2>
      {!audit.data.length && <p>No administrative changes recorded.</p>}
      {audit.data.map((event) => <p className="service-card" key={event.id}>
        {event.action} · {event.result} · {new Date(event.created_at).toLocaleString("en-GB")}
      </p>)}
    </section>
  </main>;
}
