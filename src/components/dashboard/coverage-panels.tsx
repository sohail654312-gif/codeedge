import { AreaForm, DeleteAreaForm, HoursForm } from "./coverage-forms";
import { weekdays } from "@/modules/service-coverage/validation";
import type { OpeningHours, ServiceArea } from "@/types/database";

export function CoveragePanels({ businessId, timezone, canEdit, areas, hours }: {
  businessId: string; timezone: string; canEdit: boolean; areas: ServiceArea[]; hours: OpeningHours[];
}) {
  return <>
    <section className="workspace-panel catalog-panel"><h2>Service areas</h2>
      <p className="muted">List the towns and postcode districts you cover. Postcodes describe coverage; they are not verified addresses.</p>
      {areas.length === 0 && <p>No service areas yet.</p>}
      {areas.map((area) => <article className="service-card" key={area.id}>
        <h3>{area.name}</h3><p>{area.active ? "Active" : "Inactive"}{area.postcode ? ` · ${area.postcode}` : ""}</p>
        <p className="plain-text">{area.notes}</p>
        {canEdit && <><details><summary>Edit service area</summary><AreaForm key={area.updated_at} businessId={businessId} area={area} /></details><DeleteAreaForm businessId={businessId} areaId={area.id} /></>}
      </article>)}
      {canEdit && <details className="service-card"><summary>Add service area</summary><AreaForm businessId={businessId} /></details>}
    </section>
    <section className="workspace-panel catalog-panel"><h2>Opening hours</h2>
      <p className="muted">Times use {timezone}. Save each day separately. One opening period per day; overnight hours are not supported.</p>
      {weekdays.map((day, index) => {
        const entry = hours.find((value) => value.weekday === index + 1);
        return <article className="service-card" key={day}><h3>{day}</h3>
          <p>{!entry ? "Not configured" : entry.is_closed ? "Closed" : `${entry.opens_at?.slice(0, 5)}–${entry.closes_at?.slice(0, 5)}`}</p>
          {canEdit && <details><summary>Edit {day} hours</summary><HoursForm key={entry?.updated_at ?? "new"} businessId={businessId} weekday={index + 1} day={day} hours={entry} /></details>}
        </article>;
      })}
    </section>
  </>;
}
