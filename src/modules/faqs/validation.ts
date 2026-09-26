import { z } from "zod";

// Editable fields only. Tenant ownership must come from verified membership,
// not this payload. Text is stored as plain text, never trusted HTML.
export const faqSchema = z.object({
  question: z.string().trim().min(1, "Question is required.").max(300),
  answer: z.string().trim().min(1, "Answer is required.").max(4000),
  is_active: z.boolean(),
  display_order: z.string().regex(/^[0-9]{1,5}$/).transform(Number).pipe(z.number().int().max(10000)),
});
