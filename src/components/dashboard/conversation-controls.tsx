"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { resumeAiConversation, sendConversationReply, takeOverConversation } from "@/modules/chat/actions";

type Assignee = { user_id: string; role: "owner" | "staff" };
export function ConversationControls({ businessId, conversationId, mode, assignedTo, userId, role, assignees }: {
  businessId: string; conversationId: string; mode: "ai" | "human"; assignedTo: string | null; userId: string; role: "owner" | "staff"; assignees: Assignee[];
}) {
  const [takeState, takeAction, taking] = useActionState(takeOverConversation, {});
  const [resumeState, resumeAction, resuming] = useActionState(resumeAiConversation, {});
  const [replyState, replyAction, replying] = useActionState(sendConversationReply, {});
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const replyForm = useRef<HTMLFormElement>(null);
  useEffect(() => { if (replyState.success) { setRequestId(crypto.randomUUID()); replyForm.current?.reset(); } }, [replyState.success]);
  const canControl = role === "owner" || assignedTo === userId;
  return <section className="workspace-panel form-stack" aria-label="Conversation controls">
    <h2>Human handoff</h2>
    {mode === "ai" ? <>
      <p>Automated replies are active.</p>
      <form action={takeAction} className="form-stack">
        <input type="hidden" name="businessId" value={businessId} /><input type="hidden" name="conversationId" value={conversationId} />
        {role === "owner" && assignees.length > 1 ? <label className="field">Assign conversation<select name="assigneeId" defaultValue={userId}>{assignees.map((member) => <option key={member.user_id} value={member.user_id}>{member.user_id === userId ? "Me" : `${member.role} · ${member.user_id.slice(0, 8)}`}</option>)}</select></label> : <input type="hidden" name="assigneeId" value={userId} />}
        <button className="button" disabled={taking}>Take over conversation</button>
      </form>
      {takeState.error && <p role="alert">{takeState.error}</p>}{takeState.success && <p role="status">{takeState.success}</p>}
    </> : <>
      <p><strong>Human handling is active.</strong> Automated replies are paused.</p>
      <p className="muted">Assigned to {assignedTo === userId ? "you" : assignedTo ? assignedTo.slice(0, 8) : "a team member"}.</p>
      {canControl && <form action={resumeAction}><input type="hidden" name="businessId" value={businessId} /><input type="hidden" name="conversationId" value={conversationId} /><button className="button" disabled={resuming}>Return conversation to AI</button></form>}
      {resumeState.error && <p role="alert">{resumeState.error}</p>}{resumeState.success && <p role="status">{resumeState.success}</p>}
      {canControl && <form ref={replyForm} action={replyAction} className="form-stack">
        <input type="hidden" name="businessId" value={businessId} /><input type="hidden" name="conversationId" value={conversationId} /><input type="hidden" name="requestId" value={requestId} />
        <label className="field">Manual reply<textarea name="body" required maxLength={2000} /></label>
        <button className="button" disabled={replying}>Send manual reply</button>
      </form>}
      {replyState.error && <p role="alert">{replyState.error}</p>}{replyState.success && <p role="status">{replyState.success}</p>}
    </>}
  </section>;
}
