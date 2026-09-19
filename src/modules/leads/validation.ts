import { z } from "zod";

export const leadStatuses = ["new", "contacted", "qualified", "won", "lost"] as const;
export const leadSources = ["manual", "website", "whatsapp", "phone", "voice_ai"] as const;
export const quoteStatuses = ["requested", "reviewing", "quoted", "declined"] as const;

const optionalEmail = z.string().trim().max(254).refine((value) => value === "" || z.email().safeParse(value).success, "Enter a valid email address.");
const optionalService = z.union([z.literal(""), z.uuid()]).transform((value) => value || null);

export const leadSchema = z.object({
  contact_name: z.string().trim().min(1, "Contact name is required.").max(120),
  phone: z.string().trim().max(40),
  email: optionalEmail,
  source: z.enum(leadSources),
  service_id: optionalService,
  enquiry_summary: z.string().trim().min(1, "Enquiry summary is required.").max(3000),
  status: z.enum(leadStatuses),
}).refine((value) => value.phone.length > 0 || value.email.length > 0, { message: "Add a phone number or email address." });

export const leadNoteSchema = z.object({ body: z.string().trim().min(1, "Note is required.").max(5000) });
export const quoteRequestSchema = z.object({
  details: z.string().trim().min(1, "Quote request details are required.").max(5000),
  status: z.enum(quoteStatuses),
});
