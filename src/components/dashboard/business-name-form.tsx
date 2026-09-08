"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { renameBusiness, type BusinessFormState } from "@/modules/businesses/actions";

export function BusinessNameForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<BusinessFormState, FormData>(renameBusiness, {});
  return <form action={action} className="form-stack"><input name="businessId" type="hidden" value={id} />
    <div className="field"><label htmlFor="name">Business name</label><input id="name" name="name" defaultValue={name} minLength={2} maxLength={120} required /></div>
    {state.error && <p role="alert" className="notice notice-error">{state.error}</p>}
    {state.success && <p role="status" className="notice">{state.success}</p>}
    <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save business name"}</Button></div>
  </form>;
}
