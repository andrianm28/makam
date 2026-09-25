/**
 * What the OTP Server Actions hand back to the OTP screen. Shared by Masuk and
 * (later) Kirim in the booking wizards.
 */
export type OtpRequestState =
  | { status: "idle" }
  | {
      status: "terkirim";
      /** Canonical E.164 number the code went to. */
      phoneNumber: string;
      /** Seconds until "Kirim ulang" opens, from the server's Clock. */
      resendInSeconds: number;
      /** Seconds until the fallback slot shows, from the server's Clock. */
      fallbackInSeconds: number;
      /** Changes on every send, so the screen restarts its timers. */
      sentAt: string;
    }
  | { status: "gagal"; message: string; phoneNumber?: string };

export type OtpVerifyState = { status: "idle" } | { status: "gagal"; message: string };

export const initialOtpRequestState: OtpRequestState = { status: "idle" };
export const initialOtpVerifyState: OtpVerifyState = { status: "idle" };

/** Bahasa Indonesia for every reason the identity module can refuse. */
export function otpMessage(reason: string, retryAt?: Date, now?: Date): string {
  const wait = retryAt && now ? waitText(retryAt, now) : "";
  switch (reason) {
    case "nomor_tidak_valid":
      return "Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.";
    case "tunggu_kirim_ulang":
      return `Kode baru bisa dikirim ${wait || "sebentar lagi"}.`;
    case "terlalu_sering":
      return `Terlalu banyak permintaan kode. Coba lagi ${wait || "nanti"}.`;
    case "terkunci":
      return `Terlalu banyak kode salah. Nomor ini dikunci sementara; coba lagi ${wait || "nanti"}.`;
    case "gagal_kirim":
      return "Kode belum bisa dikirim lewat WhatsApp. Silakan coba lagi.";
    case "kode_salah":
      return "Kode salah. Periksa lagi kode di WhatsApp Anda.";
    case "kode_kedaluwarsa":
      return "Kode sudah kedaluwarsa. Kirim ulang untuk mendapat kode baru.";
    case "terlalu_banyak_percobaan":
      return "Terlalu banyak kode salah. Kirim ulang untuk mendapat kode baru.";
    case "input_tidak_valid":
      return "Periksa lagi isian Anda.";
    default:
      return "Terjadi kesalahan. Silakan coba lagi.";
  }
}

function waitText(retryAt: Date, now: Date): string {
  const seconds = Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 1000));
  if (seconds < 60) return `dalam ${seconds} detik`;
  return `dalam ${Math.ceil(seconds / 60)} menit`;
}
