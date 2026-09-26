"use client";
import { useRef, useState, type FormEvent } from "react";

type Message = { sender: "visitor" | "assistant" | "member"; content: string; created_at: string };
export function ChatWidget({ widgetId }: { widgetId: string }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [contactSaved, setContactSaved] = useState(false);
  const [humanHandoff, setHumanHandoff] = useState(false);
  const [content, setContent] = useState("");
  const pending = useRef<{ content: string; requestId: string } | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  async function request(body: object) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/chat/${widgetId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error("Chat could not accept this request. Check your details or try again in a moment.");
      const result = await response.json() as { messages: Message[]; contactSaved: boolean; humanHandoff: boolean };
      setMessages(result.messages); setContactSaved(result.contactSaved); setHumanHandoff(result.humanHandoff); setReady(true);
      return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Chat unavailable."); return false; }
    finally { setBusy(false); }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!content.trim() || busy) return;
    if (pending.current?.content !== content) pending.current = { content, requestId: crypto.randomUUID() };
    if (await request({ action: "send", ...pending.current })) { setContent(""); pending.current = null; }
  }
  async function contact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await request({ action: "contact", ...Object.fromEntries(new FormData(event.currentTarget)) });
  }
  const senderLabel = (sender: Message["sender"]) => sender === "visitor" ? "You" : sender === "member" ? "Business team" : "Assistant";
  return <div className="chat-widget">
    <button ref={launcher} type="button" className="button" aria-expanded={open} aria-controls="business-chat" onClick={() => { setOpen(!open); if (!open && !ready) void request({ action: "start" }); }}>Chat with this business</button>
    {open && <section id="business-chat" className="workspace-panel chat-window" aria-label="Business chat" onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); launcher.current?.focus(); } }}>
      <div className="workspace-header"><h2>Business chat</h2><button type="button" onClick={() => { setOpen(false); launcher.current?.focus(); }} aria-label="Close chat">Close</button></div>
      <p className="muted">Ask a question, or leave an enquiry. Chat sessions last up to 24 hours; the business can review your messages. Avoid sensitive information.</p>
      {humanHandoff ? <p role="status">A business team member is handling this conversation. Automated replies are paused.</p> : <p className="muted">Replies are currently provided by the automated assistant.</p>}
      <div className="chat-messages" role="log" aria-label="Chat messages" aria-live="polite">{messages.map((message, index) => <p key={index} className={`chat-message chat-${message.sender}`}><strong>{senderLabel(message.sender)}</strong><span className="plain-text">{message.content}</span></p>)}</div>
      {busy && <p role="status">Working…</p>}{error && <p role="alert">{error}</p>}
      {!ready && !busy && <button type="button" onClick={() => void request({ action: "start" })}>Retry opening chat</button>}
      <form onSubmit={send} className="form-stack"><label className="field">Your message<textarea value={content} onChange={(event) => setContent(event.target.value)} required maxLength={2000} disabled={!ready || busy} /></label><button className="button" disabled={!ready || busy || !content.trim()}>Send message</button></form>
      {contactSaved ? <p role="status">Your enquiry has been saved for this business.</p> : <details><summary>Leave an enquiry (optional)</summary><form onSubmit={contact} className="form-stack">
        <label className="field">Your name<input name="contact_name" required maxLength={120} autoComplete="name" /></label>
        <label className="field">Phone<input name="phone" maxLength={40} autoComplete="tel" /></label>
        <label className="field">Email<input name="email" type="email" maxLength={254} autoComplete="email" /></label>
        <p className="muted">Add either a phone number or email so the business can respond.</p>
        <label className="field">Requested service<input name="requested_service" maxLength={200} /></label>
        <label className="field">Enquiry summary<textarea name="enquiry_summary" required maxLength={2700} /></label>
        <button className="button" disabled={!ready || busy}>Save enquiry</button>
      </form></details>}
    </section>}
  </div>;
}
