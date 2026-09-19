"use client";
import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { deleteFaq, saveFaq, type FaqState } from "@/modules/faqs/actions";
import { saveSettings, type SettingsState } from "@/modules/settings/actions";
import type { BusinessFaq, BusinessSettings } from "@/types/database";

function Notice({ state }: { state: FaqState | SettingsState }) {
  return <>{state.error && <p role="alert" className="notice notice-error">{state.error}</p>}{state.success && <p role="status" className="notice">{state.success}</p>}</>;
}

function FaqForm({ businessId, faq }: { businessId: string; faq?: BusinessFaq }) {
  const [state, action, pending] = useActionState(saveFaq, {});
  const prefix = useId();
  return <form action={action} className="form-stack"><input type="hidden" name="businessId" value={businessId} />{faq && <input type="hidden" name="faqId" value={faq.id} />}
    <div className="field"><label htmlFor={prefix + "question"}>Question</label><input id={prefix + "question"} name="question" defaultValue={faq?.question ?? ""} required maxLength={300} /></div>
    <div className="field"><label htmlFor={prefix + "answer"}>Answer</label><textarea id={prefix + "answer"} name="answer" defaultValue={faq?.answer ?? ""} required maxLength={5000} rows={5} /></div>
    <div className="field"><label htmlFor={prefix + "order"}>Display order</label><input id={prefix + "order"} name="display_order" type="number" min="0" max="10000" step="1" defaultValue={faq?.display_order ?? 0} required /></div>
    <label className="check-field"><input type="checkbox" name="is_active" defaultChecked={faq?.is_active ?? true} />Active</label>
    <Notice state={state} /><Button disabled={pending}>{faq ? "Save FAQ" : "Create FAQ"}</Button>
  </form>;
}

function DeleteFaqForm({ businessId, faqId }: { businessId: string; faqId: string }) {
  const [state, action, pending] = useActionState(deleteFaq, {});
  return <form action={action} className="form-stack catalog-delete" onSubmit={(event) => { if (!window.confirm("Delete this FAQ?")) event.preventDefault(); }}>
    <input type="hidden" name="businessId" value={businessId} /><input type="hidden" name="faqId" value={faqId} />
    <Notice state={state} /><Button variant="secondary" disabled={pending}>Delete FAQ</Button>
  </form>;
}

export function FaqPanel({ businessId, canEdit, faqs }: { businessId: string; canEdit: boolean; faqs: BusinessFaq[] }) {
  return <section className="workspace-panel catalog-panel"><h2>Frequently asked questions</h2><p className="muted">Answers are stored as plain text. Inactive FAQs stay private and are not ready for customer-facing use.</p>
    {faqs.length === 0 && <p>No FAQs yet.</p>}
    {faqs.map((faq) => <article className="service-card" key={faq.id}><h3>{faq.question}</h3><p>{faq.is_active ? "Active" : "Inactive"} · Order {faq.display_order}</p><p className="plain-text">{faq.answer}</p>
      {canEdit && <><details><summary>Edit FAQ</summary><FaqForm key={faq.updated_at} businessId={businessId} faq={faq} /></details><DeleteFaqForm businessId={businessId} faqId={faq.id} /></>}
    </article>)}
    {canEdit && <details className="service-card"><summary>Add FAQ</summary><FaqForm businessId={businessId} /></details>}
  </section>;
}

export function SettingsPanel({ businessId, canEdit, settings }: { businessId: string; canEdit: boolean; settings: BusinessSettings | null }) {
  const [state, action, pending] = useActionState(saveSettings, {});
  const prefix = useId();
  return <section className="workspace-panel catalog-panel"><h2>Business settings</h2><p className="muted">These preferences prepare the workspace for lead notifications. Email delivery is not connected yet.</p>
    {canEdit ? <form action={action} className="form-stack"><input type="hidden" name="businessId" value={businessId} />
      <div className="field"><label htmlFor={prefix + "locale"}>Locale</label><input id={prefix + "locale"} name="locale" defaultValue={settings?.locale ?? "en-GB"} required maxLength={35} /></div>
      <div className="field"><label htmlFor={prefix + "email"}>Lead notification email (optional)</label><input id={prefix + "email"} name="lead_notification_email" type="email" defaultValue={settings?.lead_notification_email ?? ""} maxLength={254} /></div>
      <label className="check-field"><input type="checkbox" name="notify_new_leads" defaultChecked={settings?.notify_new_leads ?? true} />Notify about new leads when delivery is connected</label>
      <Notice state={state} /><Button disabled={pending}>Save settings</Button>
    </form> : <dl className="details"><dt>Locale</dt><dd>{settings?.locale ?? "en-GB"}</dd><dt>Lead email</dt><dd>{settings?.lead_notification_email || "Not provided"}</dd><dt>Lead alerts</dt><dd>{(settings?.notify_new_leads ?? true) ? "Enabled" : "Disabled"}</dd></dl>}
  </section>;
}
