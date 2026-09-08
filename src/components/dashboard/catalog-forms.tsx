"use client";
import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { saveProfile, saveService, deleteProfile, deleteService, type CatalogState } from "@/modules/catalog/actions";
import type { BusinessProfile, Service } from "@/types/database";
function Notice({ state }: { state: CatalogState }) {
  return <>{state.error && <p role="alert" className="notice notice-error">{state.error}</p>}{state.success && <p role="status" className="notice">{state.success}</p>}</>;
}
const profileFields = [
  ["trading_name", "Trading name", 120], ["phone", "Phone", 40], ["email", "Business email", 254],
  ["website", "Website (HTTPS)", 2048], ["address", "Business address", 500],
  ["description", "Business description", 3000], ["category", "Primary trade or category", 120],
  ["logo_alt", "Logo description (placeholder)", 120],
] as const;
export function ProfileForm({ businessId, profile }: { businessId: string; profile: BusinessProfile | null }) {
  const [state, action, pending] = useActionState(saveProfile, {});
  const prefix = useId();
  return <form action={action} className="form-stack"><input type="hidden" name="businessId" value={businessId} />
    {profileFields.map(([name, label, max]) => <div className="field" key={name}><label htmlFor={prefix + name}>{label}</label>
      {name === "address" || name === "description" ? <textarea id={prefix + name} name={name} defaultValue={profile?.[name] ?? ""} maxLength={max} rows={4} />
        : <input id={prefix + name} name={name} defaultValue={profile?.[name] ?? ""} maxLength={max} type={name === "email" ? "email" : name === "website" ? "url" : name === "phone" ? "tel" : "text"} />}</div>)}
    <p className="muted">Logo uploads are not available yet. This description is saved as plain text.</p>
    <Notice state={state} /><Button disabled={pending}>Save profile</Button>
  </form>;
}
export function ServiceForm({ businessId, service }: { businessId: string; service?: Service }) {
  const [state, action, pending] = useActionState(saveService, {});
  const prefix = useId();
  return <form action={action} className="form-stack"><input type="hidden" name="businessId" value={businessId} />{service && <input type="hidden" name="serviceId" value={service.id} />}
    <div className="field"><label htmlFor={prefix + "name"}>Service name</label><input id={prefix + "name"} name="name" defaultValue={service?.name ?? ""} required minLength={2} maxLength={120} /></div>
    <div className="field"><label htmlFor={prefix + "description"}>Description</label><textarea id={prefix + "description"} name="description" defaultValue={service?.description ?? ""} rows={3} maxLength={3000} /></div>
    <div className="field"><label htmlFor={prefix + "price"}>Starting price (£, optional)</label><input id={prefix + "price"} name="starting_price_pence" type="number" min="0" max="1000000" step="0.01" defaultValue={service?.starting_price_pence == null ? "" : (service.starting_price_pence / 100).toFixed(2)} /></div>
    <div className="field"><label htmlFor={prefix + "order"}>Display order</label><input id={prefix + "order"} name="display_order" type="number" min="0" max="10000" step="1" defaultValue={service?.display_order ?? 0} required /></div>
    <label className="check-field"><input type="checkbox" name="active" defaultChecked={service?.active ?? true} />Active</label>
    <label className="check-field"><input type="checkbox" name="quote_required" defaultChecked={service?.quote_required ?? true} />Quote required</label>
    <Notice state={state} /><Button disabled={pending}>{service ? "Save service" : "Create service"}</Button>
  </form>;
}
export function DeleteCatalogForm({ businessId, serviceId }: { businessId: string; serviceId?: string }) {
  const [state, action, pending] = useActionState(serviceId ? deleteService : deleteProfile, {});
  return <form action={action} className="form-stack catalog-delete" onSubmit={(event) => { if (!window.confirm(serviceId ? "Delete this service?" : "Clear optional profile details? Business name, memberships and services will remain.")) event.preventDefault(); }}>
    <input type="hidden" name="businessId" value={businessId} />{serviceId && <input type="hidden" name="serviceId" value={serviceId} />}
    <Notice state={state} /><Button variant="secondary" disabled={pending}>{serviceId ? "Delete service" : "Clear profile details"}</Button>
  </form>;
}
