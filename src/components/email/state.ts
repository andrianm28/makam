/**
 * What the Verifikasi Email Server Actions (Akun Saya, the staff area) hand
 * back to their forms.
 */

/** "gagal kirim" for a code by email. */
export const EMAIL_GAGAL_KIRIM = "Kode belum bisa dikirim lewat email. Silakan coba lagi.";

export type EmailRequestState =
  | { status: "idle" }
  | {
      status: "terkirim";
      /** The email as the identity module normalised it. */
      email: string;
      message: string;
      /** Seconds until "Kirim ulang" opens, from the server's Clock. */
      resendInSeconds: number;
      /** Changes on every request, so the form restarts its timer. */
      sentAt: string;
    }
  | { status: "gagal"; message: string; email?: string };

export const initialEmailRequestState: EmailRequestState = { status: "idle" };

/** The result of a profile action (Verifikasi Email's code, the phone number). */
export type EmailProfileState =
  | { status: "idle" }
  | { status: "berhasil" | "gagal"; message: string };

export const initialEmailProfileState: EmailProfileState = { status: "idle" };
