"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  inviteOrReactivateStaff,
  operatorRevokeStaff,
  provisionBusinessOwner,
  type OperatorActionState,
} from "@/modules/operator/actions";

function Notice({ state }: { state: OperatorActionState }) {
  return <>
    {state.error && <p role="alert" className="notice notice-error">{state.error}</p>}
    {state.success && <p role="status" className="notice">{state.success}</p>}
  </>;
}

export function ProvisionBusinessForm() {
  const [state, action, pending] = useActionState(provisionBusinessOwner, {});
  return <form action={action} className="form-stack">
    <div className="field"><label htmlFor="operator-business-name">Business name</label><input id="operator-business-name" name="name" required maxLength={120} /></div>
    <div className="field"><label htmlFor="operator-business-slug">Business slug</label><input id="operator-business-slug" name="slug" required maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></div>
    <div className="field"><label htmlFor="operator-owner-email">Owner email</label><input id="operator-owner-email" name="email" type="email" required maxLength={254} /></div>
    <Notice state={state} />
    <Button disabled={pending}>{pending ? "Provisioning…" : "Provision business owner"}</Button>
  </form>;
}

export function InviteStaffForm({ businessId }: { businessId: string }) {
  const [state, action, pending] = useActionState(inviteOrReactivateStaff, {});
  return <form action={action} className="form-stack">
    <input type="hidden" name="businessId" value={businessId} />
    <div className="field"><label htmlFor={`staff-email-${businessId}`}>Staff email</label><input id={`staff-email-${businessId}`} name="email" type="email" required maxLength={254} /></div>
    <Notice state={state} />
    <Button disabled={pending}>{pending ? "Preparing…" : "Invite or reactivate staff"}</Button>
  </form>;
}

export function OperatorRevokeStaffForm({
  businessId,
  userId,
}: {
  businessId: string;
  userId: string;
}) {
  const [state, action, pending] = useActionState(operatorRevokeStaff, {});
  return <form action={action} className="form-stack catalog-delete" onSubmit={(event) => {
    if (!window.confirm("Revoke this staff member's business access?")) event.preventDefault();
  }}>
    <input type="hidden" name="businessId" value={businessId} />
    <input type="hidden" name="userId" value={userId} />
    <Notice state={state} />
    <Button variant="secondary" disabled={pending}>{pending ? "Revoking…" : "Revoke staff access"}</Button>
  </form>;
}
