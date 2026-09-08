import { z } from "zod";
const text = (max: number) => z.string().trim().max(max);
const website = text(2048).refine((value) => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !/\s/.test(value); }
  catch { return false; }
}, "Use an HTTPS website address without credentials.");
export const profileSchema = z.object({
  trading_name: text(120), phone: text(40).regex(/^[+0-9().\s-]*$/, "Use a phone number."),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]), website,
  address: text(500), description: text(3000), category: text(120), logo_alt: text(120),
});
export const serviceSchema = z.object({
  name: text(120).min(2), description: text(3000), active: z.boolean(), quote_required: z.boolean(),
  starting_price_pence: z.string().regex(/^(?:|[0-9]{1,7}(?:\.[0-9]{1,2})?)$/, "Use a non-negative GBP amount with at most two decimal places.")
    .transform((value) => value === "" ? null : Math.round(Number(value) * 100))
    .refine((value) => value === null || value <= 100000000, "Maximum starting price is £1,000,000."),
  display_order: z.string().regex(/^[0-9]{1,5}$/).transform(Number).pipe(z.number().int().max(10000)),
});
export const selectorSchema = z.string().uuid();
