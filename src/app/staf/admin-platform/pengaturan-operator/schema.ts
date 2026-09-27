import { z } from "zod";
import type { OperatorSettingsField } from "@/domain/operator-settings";
import { phoneNumberInput } from "@/server/phone-number-input";

/**
 * The Pengaturan Operator shape, shared by the Server Action and the form:
 * only shapes and lengths here; the operator-settings module trims, checks
 * and normalises. (Moved out of `actions.ts` unchanged: a "use server" file
 * may only export async functions, so the schema lives here.)
 */
const valueSchemas = {
  legalName: z.string().max(200),
  address: z.string().max(500),
  phone: z.string().max(32),
  email: z.string().max(254),
  csWhatsApp: phoneNumberInput,
  csReplyHours: z.string().max(200),
} satisfies Record<OperatorSettingsField, z.ZodType<string>>;

export const pengaturanOperatorSchema = z.object({ ...valueSchemas, reason: z.string().max(500) });

export type PengaturanOperatorInput = z.infer<typeof pengaturanOperatorSchema>;
