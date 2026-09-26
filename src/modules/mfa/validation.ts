import { z } from "zod";

export const mfaFactorIdSchema = z.string().uuid("Invalid MFA factor.");
export const mfaChallengeIdSchema = z.string().uuid("Invalid MFA challenge.");
export const totpCodeSchema = z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit authenticator code.");
