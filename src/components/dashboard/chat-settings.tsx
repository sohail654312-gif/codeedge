"use client";
import { useActionState } from "react";
import { saveWidget } from "@/modules/chat/actions";
export function ChatSettings({ businessId, enabled }: { businessId: string; enabled: boolean }) {
  const [state, action, pending] = useActionState(saveWidget, {});
  return <form action={action} className="form-stack"><input type="hidden" name="businessId" value={businessId} /><label><input type="checkbox" name="enabled" defaultChecked={enabled} /> Enable public website chat</label><button className="button" disabled={pending}>Save chat availability</button>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</form>;
}
