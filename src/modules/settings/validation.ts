import { z } from "zod";

const optionalEmail = z.string().trim().max(254).refine(
  (value) => value === "" || z.email().safeParse(value).success,
  "Enter a valid notification email or leave it blank.",
);

export const settingsSchema = z.object({
  locale: z.string().trim().min(2).max(35).regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, "Enter a valid locale such as en-GB."),
  lead_notification_email: optionalEmail,
  notify_new_leads: z.boolean(),
});
