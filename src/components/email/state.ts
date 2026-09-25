/**
 * What the email Server Actions (Masuk dengan email, "Kirim lewat email",
 * Verifikasi Email) hand back to their forms.
 */

/** The one reply to the email step of Masuk dengan email, whatever the email (spec, story 189). */
export const EMAIL_LOGIN_REPLY = "Jika email ini terdaftar dan terverifikasi, kode sudah kami kirim.";

/** "gagal kirim" for a code by email ("Kirim lewat email" and Verifikasi Email; never the email step of Masuk). */
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

/** The Akun's email as the profile shows it, after a profile action. */
export type EmailProfileState =
  | { status: "idle" }
  | { status: "berhasil" | "gagal"; message: string };

export const initialEmailProfileState: EmailProfileState = { status: "idle" };
