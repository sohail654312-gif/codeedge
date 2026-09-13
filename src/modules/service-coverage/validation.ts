import { z } from "zod";

// Outward code or full UK postcode. Syntax only, not address verification.
export const postcodeSchema = z.string().trim().toUpperCase()
  .transform((value) => value.replace(/\s+/g, ""))
  .refine((value) => value === "" || /^(?:GIR0AA|[A-PR-UWYZ][A-HK-Y]?[0-9][0-9A-HJKPSTUW]?(?:[0-9][ABD-HJLNP-UW-Z]{2})?)$/.test(value), "Use a UK postcode or outward code, such as SW1A or SW1A 1AA.")
  .transform((value) => {
    if (/\d[ABD-HJLNP-UW-Z]{2}$/.test(value)) return value.slice(0, -3) + " " + value.slice(-3);
    return value;
  });

export const areaSchema = z.object({
  name: z.string().trim().min(2).max(120),
  postcode: postcodeSchema,
  notes: z.string().trim().max(1000),
  active: z.boolean(),
  display_order: z.string().regex(/^[0-9]{1,5}$/).transform(Number).pipe(z.number().int().max(10000)),
});
export const weekdaySchema = z.string().regex(/^[1-7]$/).transform(Number);
const time = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/, "Use a time in HH:MM format.");
export const hoursSchema = z.discriminatedUnion("is_closed", [
  z.object({ is_closed: z.literal(true), opens_at: z.unknown().transform(() => null), closes_at: z.unknown().transform(() => null) }),
  z.object({ is_closed: z.literal(false), opens_at: time, closes_at: time })
    .refine((value) => value.opens_at < value.closes_at, "Closing time must be later than opening time on the same day."),
]);
export const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
