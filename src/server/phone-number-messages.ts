import type { PhoneNumberRejection } from "@/domain/identity";

/**
 * Bahasa Indonesia for a refused phone number (a contact, never a login):
 * shared by the screens that take one (Akun Saya, Undangan Staf, Pengaturan
 * Operator) and the `seed:admin` CLI.
 */
export const phoneNumberRefusals: Record<PhoneNumberRejection["reason"], string> = {
  nomor_tidak_valid: "Nomor telepon tidak valid.",
  nomor_bukan_indonesia: "Gunakan nomor telepon Indonesia (+62).",
};
