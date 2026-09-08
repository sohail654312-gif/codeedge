import { z } from "zod";
export const emailSchema = z.string().trim().email().max(254);
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(256) });
export const passwordSchema = z.string().min(12, "Use at least 12 characters.").max(256);
