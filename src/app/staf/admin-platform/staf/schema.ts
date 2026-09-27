import { z } from "zod";
import { staffRoles } from "@/domain/identity";
import { phoneNumberInput } from "@/server/phone-number-input";

/**
 * The Staf shapes, shared by the Server Actions and the forms. (Moved out of
 * `actions.ts` unchanged: a "use server" file may only export async
 * functions, so the schemas live here.)
 */
export const undangStafSchema = z.object({
  // Empty is let through: the identity module refuses a missing email (email_wajib) with its own message.
  email: z.string().trim().max(254),
  phoneNumber: phoneNumberInput,
  role: z.enum(staffRoles),
  reason: z.string().trim().max(500).optional(),
});

export const nonaktifkanStafSchema = z.object({
  accountId: z.string().min(1).max(64),
  reason: z.string().trim().max(500),
});

export type UndangStafInput = z.infer<typeof undangStafSchema>;
export type NonaktifkanStafInput = z.infer<typeof nonaktifkanStafSchema>;
