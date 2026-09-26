import { z } from "zod";

export const operatorEmailSchema = z.string().trim().toLowerCase().email().max(254);
export const operatorBusinessIdSchema = z.string().uuid();
export const operatorUserIdSchema = z.string().uuid();
export const operatorBusinessNameSchema = z.string().trim().min(2).max(120);
export const operatorBusinessSlugSchema = z.string().trim().toLowerCase()
  .min(2).max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens.");
