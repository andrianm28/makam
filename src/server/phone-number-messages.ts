import type { PhoneNumberRejection } from "@/domain/identity";

/**
 * Bahasa Indonesia for a refused WhatsApp number: shared by the staff screens
 * (Undangan Staf, Pindah Nomor) and the ops CLIs (seed:admin, reset-totp).
 */
export const phoneNumberRefusals: Record<PhoneNumberRejection["reason"], string> = {
  nomor_tidak_valid: "Nomor WhatsApp tidak valid.",
  nomor_bukan_indonesia: "Gunakan nomor WhatsApp Indonesia (+62).",
};
