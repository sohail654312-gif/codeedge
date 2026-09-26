import "server-only";

export type OperationalEvent =
  | "readiness.environment.failed"
  | "readiness.whatsapp_configuration.failed"
  | "readiness.supabase.failed"
  | "readiness.chat.failed"
  | "chat.request.failed"
  | "ai.provider.fallback"
  | "whatsapp.webhook.failed"
  | "whatsapp.delivery.failed"
  | "whatsapp.outbox_status.failed";

export function reportOperationalEvent(
  event: OperationalEvent,
  level: "warn" | "error" = "error",
) {
  const line = JSON.stringify({
    source: "codeedge",
    event,
    level,
    timestamp: new Date().toISOString(),
  });
  if (level === "warn") console.warn(line);
  else console.error(line);
}
