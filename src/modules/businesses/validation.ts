import { z } from "zod";
export const businessNameSchema = z.string().trim().min(2, "Use at least 2 characters.").max(120, "Use 120 characters or fewer.");
export const businessIdSchema = z.string().uuid();
