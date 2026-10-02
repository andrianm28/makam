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

/** The message for a refusal from a guarded action or the domain call behind it: the guard's own wording for a guard reason, else the screen's table, else a general one. */
export function refusalMessage(reason: string, table: Record<string, string>): string {
  if (reason === "belum_masuk" || reason === "perlu_totp" || reason === "tidak_berwenang" || reason === "input_tidak_valid") {
    return table[reason] ?? guardMessage(reason);
  }
  return table[reason] ?? "Gagal. Coba lagi.";
}
