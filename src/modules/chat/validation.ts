import { z } from "zod";
import { leadSchema } from "@/modules/leads/validation";

export const widgetIdSchema = z.uuid();
export const chatRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict(),
  z.object({ action: z.literal("send"), requestId: z.uuid(), content: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action: z.literal("contact"), contact_name: z.string(), phone: z.string(), email: z.string(), requested_service: z.string().trim().max(200), enquiry_summary: z.string() }).strict(),
]);
export function validateContact(input: Extract<z.infer<typeof chatRequestSchema>, { action: "contact" }>) {
  return leadSchema.parse({ ...input, source: "website", service_id: "", status: "new",
    enquiry_summary: `${input.requested_service ? `Requested service: ${input.requested_service}\n` : ""}${input.enquiry_summary}` });
}
