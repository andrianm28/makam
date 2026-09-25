import type { GuardError } from "@/server/guard";

/** Bahasa Indonesia for a guard refusal in the staff area. */
export function guardMessage(error: GuardError): string {
  switch (error) {
    case "belum_masuk":
      return "Sesi Anda sudah berakhir. Silakan masuk lagi.";
    case "perlu_totp":
      return "Masukkan kode dari aplikasi authenticator Anda dulu.";
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    case "input_tidak_valid":
      return "Periksa lagi isian Anda.";
  }
}
