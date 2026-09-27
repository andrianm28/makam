import { z } from "zod";
import type { OperatorSettingsField } from "@/domain/operator-settings";
import { EMAIL_MAX } from "@/server/code-inputs";
import { PHONE_NUMBER_MAX, phoneNumberInput } from "@/server/phone-number-input";

/**
 * The Pengaturan Operator shape, shared by the Server Action and the form:
 * only shapes and lengths here; the operator-settings module trims, checks
 * and normalises. (Moved out of `actions.ts` unchanged: a "use server" file
 * may only export async functions, so the schema lives here.)
 */

/**
 * How long each value may be typed, in one number per field: the schema refuses
 * past it and the form's `maxLength` stops there, so a field's length is never
 * written twice. The two contact numbers share the one phone number length
 * every form uses.
 */
export const pengaturanOperatorLimits = {
  legalName: 200,
  address: 500,
  phone: PHONE_NUMBER_MAX,
  email: EMAIL_MAX,
  csWhatsApp: PHONE_NUMBER_MAX,
  csReplyHours: 200,
  reason: 500,
} as const satisfies Record<OperatorSettingsField | "reason", number>;

const valueSchemas = {
  legalName: z.string().max(pengaturanOperatorLimits.legalName),
  address: z.string().max(pengaturanOperatorLimits.address),
  phone: z.string().max(pengaturanOperatorLimits.phone),
  email: z.string().max(pengaturanOperatorLimits.email),
  csWhatsApp: phoneNumberInput,
  csReplyHours: z.string().max(pengaturanOperatorLimits.csReplyHours),
} satisfies Record<OperatorSettingsField, z.ZodType<string>>;

export const pengaturanOperatorSchema = z.object({
  ...valueSchemas,
  reason: z.string().max(pengaturanOperatorLimits.reason),
});

export type PengaturanOperatorInput = z.infer<typeof pengaturanOperatorSchema>;
