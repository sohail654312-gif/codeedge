"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  revokeStaffMembership,
  type MembershipState,
} from "@/modules/memberships/actions";

export type MembershipRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: "owner" | "staff";
  status: "active" | "revoked";
  created_at: string;
};

function Notice({ state }: { state: MembershipState }) {
  return <>
    {state.error && <p role="alert" className="notice notice-error">{state.error}</p>}
    {state.success && <p role="status" className="notice">{state.success}</p>}
  </>;
}

function RevokeStaffForm({
  businessId,
  userId,
}: {
  businessId: string;
  userId: string;
}) {
  const [state, action, pending] = useActionState(revokeStaffMembership, {});
  return <form
    action={action}
    className="form-stack catalog-delete"
    onSubmit={(event) => {
      if (!window.confirm("Revoke this staff member's access?")) event.preventDefault();
    }}
  >
    <input type="hidden" name="businessId" value={businessId} />
    <input type="hidden" name="userId" value={userId} />
    <Notice state={state} />
    <Button variant="secondary" disabled={pending}>
      {pending ? "Revoking…" : "Revoke staff access"}
    </Button>
  </form>;
}

export function MembershipAdmin({
  businessId,
  memberships,
}: {
  businessId: string;
  memberships: MembershipRow[];
}) {
  return <section className="workspace-panel catalog-panel">
    <h2>Business memberships</h2>
    <p className="muted">
      Staff invitations and initial provisioning are handled by a Codeedge operator.
      Owners can revoke staff access here after MFA verification. Owner access cannot
      be removed from this screen.
    </p>
    {memberships.map((membership) => <article className="service-card" key={membership.user_id}>
      <h3>{membership.display_name || membership.email || "Business member"}</h3>
      <p>{membership.email || "Email unavailable"} · {membership.role} · {membership.status}</p>
      {membership.role === "staff" && membership.status === "active"
        ? <RevokeStaffForm businessId={businessId} userId={membership.user_id} />
        : null}
    </article>)}
  </section>;
}
