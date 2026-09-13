"use client";
import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { saveArea, deleteArea, saveHours, type CoverageState } from "@/modules/service-coverage/actions";
import type { ServiceArea, OpeningHours } from "@/types/database";

function Notice({ state }: { state: CoverageState }) {
  return <>{state.error && <p role="alert" className="notice notice-error">{state.error}</p>}{state.success && <p role="status" className="notice">{state.success}</p>}</>;
}
export function AreaForm({ businessId, area }: { businessId: string; area?: ServiceArea }) {
  const [state, action, pending] = useActionState(saveArea, {});
  const prefix = useId();
  return <form action={action} className="form-stack">
    <input type="hidden" name="businessId" value={businessId} />
    {area && <input type="hidden" name="areaId" value={area.id} />}
    <div className="field"><label htmlFor={prefix + "name"}>Area, town or city</label><input id={prefix + "name"} name="name" required minLength={2} maxLength={120} defaultValue={area?.name ?? ""} /></div>
    <div className="field"><label htmlFor={prefix + "postcode"}>UK postcode or outward code (optional)</label><input id={prefix + "postcode"} name="postcode" maxLength={8} placeholder="SW1A or SW1A 1AA" defaultValue={area?.postcode ?? ""} /></div>
    <div className="field"><label htmlFor={prefix + "notes"}>Coverage notes</label><textarea id={prefix + "notes"} name="notes" rows={3} maxLength={1000} defaultValue={area?.notes ?? ""} /></div>
    <div className="field"><label htmlFor={prefix + "order"}>Display order</label><input id={prefix + "order"} name="display_order" type="number" required min="0" max="10000" step="1" defaultValue={area?.display_order ?? 0} /></div>
    <label className="check-field"><input type="checkbox" name="active" defaultChecked={area?.active ?? true} />Active</label>
    <Notice state={state} /><Button disabled={pending}>{area ? "Save service area" : "Create service area"}</Button>
  </form>;
}
export function DeleteAreaForm({ businessId, areaId }: { businessId: string; areaId: string }) {
  const [state, action, pending] = useActionState(deleteArea, {});
  return <form action={action} className="form-stack catalog-delete" onSubmit={(event) => { if (!window.confirm("Delete this service area?")) event.preventDefault(); }}>
    <input type="hidden" name="businessId" value={businessId} /><input type="hidden" name="areaId" value={areaId} />
    <Notice state={state} /><Button variant="secondary" disabled={pending}>Delete service area</Button>
  </form>;
}
export function HoursForm({ businessId, weekday, day, hours }: { businessId: string; weekday: number; day: string; hours: OpeningHours | undefined }) {
  const [state, action, pending] = useActionState(saveHours, {});
  const [closed, setClosed] = useState(hours?.is_closed ?? true);
  const prefix = useId();
  return <form action={action} className="form-stack" aria-label={`${day} opening hours`}>
    <input type="hidden" name="businessId" value={businessId} /><input type="hidden" name="weekday" value={weekday} />
    <label className="check-field"><input type="checkbox" name="is_closed" checked={closed} onChange={(event) => setClosed(event.target.checked)} />Closed</label>
    <div className="field"><label htmlFor={prefix + "opens"}>Opening time</label><input id={prefix + "opens"} name="opens_at" type="time" step="60" required={!closed} disabled={closed} defaultValue={hours?.opens_at?.slice(0, 5) ?? "09:00"} /></div>
    <div className="field"><label htmlFor={prefix + "closes"}>Closing time</label><input id={prefix + "closes"} name="closes_at" type="time" step="60" required={!closed} disabled={closed} defaultValue={hours?.closes_at?.slice(0, 5) ?? "17:00"} /></div>
    <Notice state={state} /><Button disabled={pending}>Save {day} hours</Button>
  </form>;
}
