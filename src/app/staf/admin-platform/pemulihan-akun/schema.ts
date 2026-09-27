import { z } from "zod";
import { KTP_CHECK_MAX_BYTES } from "@/domain/identity";
import { emailInput } from "@/server/code-inputs";

/**
 * The Pemulihan Akun shape, shared by the Server Action and the form. (Moved
 * out of `actions.ts` unchanged except the KTP size message, which only words
 * the form's inline error: the Server Action still answers an oversize file
 * with its own message. A "use server" file may only export async functions,
 * so the schema lives here.)
 */
export const pulihkanAkunSchema = z.object({
  // One of them: the Akun's id (picked from the staff roster) or its email on record.
  accountId: z.string().trim().min(1).max(64).optional(),
  currentEmail: emailInput.optional(),
  newEmail: emailInput,
  ktpCheck: z.instanceof(File).refine((file) => file.size <= KTP_CHECK_MAX_BYTES, "Berkas KTP paling besar 10 MB."),
  ktpChecked: z.literal("ya").optional(),
  reason: z.string().trim().max(500),
});

export type PulihkanAkunInput = z.infer<typeof pulihkanAkunSchema>;
