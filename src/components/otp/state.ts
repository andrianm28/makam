import type {
  ConfirmEmailVerificationResult,
  RemoveEmailResult,
  RequestEmailFallbackResult,
  RequestEmailLoginResult,
  RequestEmailVerificationResult,
  RequestOtpResult,
  VerifyOtpResult,
} from "@/domain/identity";
import type { GuardError } from "@/server/guard";

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
      /** The slot offers "Kirim lewat email" (the number's Akun has an Email Terverifikasi); otherwise the CS pointer. */
      emailFallback: boolean;
      /** Changes on every send, so the screen restarts its timers. */
      sentAt: string;
    }
  | { status: "gagal"; message: string; phoneNumber?: string };

export type OtpVerifyState = { status: "idle" } | { status: "gagal"; message: string };

export const initialOtpRequestState: OtpRequestState = { status: "idle" };

/** "Kirim lewat email" in the fallback slot. */
export type EmailFallbackState = { status: "idle" } | { status: "terkirim"; sentAt: string } | { status: "gagal"; message: string };
export const initialEmailFallbackState: EmailFallbackState = { status: "idle" };
export const initialOtpVerifyState: OtpVerifyState = { status: "idle" };

/** The CS WhatsApp contact from Pengaturan Operator, for the OTP screen's pointer; null until it is entered. */
export interface CsContact {
  /** Canonical E.164 (+62…). */
  whatsApp: string;
  /** e.g. "dibalas mulai pukul 06:00". */
  replyHours: string;
}

/** The wa.me link to the CS WhatsApp number. */
export function csWhatsAppLink(contact: CsContact): string {
  return `https://wa.me/${contact.whatsApp.replace(/^\+/, "")}`;
}

type Refusal<T> = T extends { ok: false; reason: infer R } ? R : never;

/** Every reason the identity module's Kode Masuk and email actions, or the guard, can refuse. */
export type OtpRefusal =
  | Refusal<RequestOtpResult>
  | Refusal<VerifyOtpResult>
  | Refusal<RequestEmailLoginResult>
  | Refusal<RequestEmailFallbackResult>
  | Refusal<RequestEmailVerificationResult>
  | Refusal<ConfirmEmailVerificationResult>
  | Refusal<RemoveEmailResult>
  | GuardError;

/** Bahasa Indonesia for every reason the identity module or the guard can refuse. */
export function otpMessage(reason: OtpRefusal, retryAt?: Date, now?: Date): string {
  const wait = retryAt && now ? waitText(retryAt, now) : "";
  switch (reason) {
    case "nomor_tidak_valid":
      return "Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.";
    case "nomor_bukan_indonesia":
      return "Gunakan nomor WhatsApp Indonesia (+62).";
    case "tunggu_kirim_ulang":
      return `Kode baru bisa dikirim ${wait || "sebentar lagi"}.`;
    case "terlalu_sering":
      return `Terlalu banyak permintaan kode. Coba lagi ${wait || "nanti"}.`;
    case "terkunci":
      return `Terlalu banyak kode salah. Masuk ke akun ini dikunci sementara; coba lagi ${wait || "nanti"}.`;
    case "gagal_kirim":
      return "Kode belum bisa dikirim lewat WhatsApp. Silakan coba lagi.";
    case "kode_salah":
      return "Kode salah. Periksa lagi kode di WhatsApp Anda.";
    case "kode_kedaluwarsa":
      return "Kode sudah kedaluwarsa. Kirim ulang untuk mendapat kode baru.";
    case "terlalu_banyak_percobaan":
      return "Terlalu banyak kode salah. Kirim ulang untuk mendapat kode baru.";
    case "belum_masuk":
      return "Silakan masuk dulu dengan nomor WhatsApp Anda.";
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    case "perlu_totp":
      return "Masukkan kode dari aplikasi authenticator Anda dulu.";
    case "input_tidak_valid":
      return "Periksa lagi isian Anda.";
    case "email_tidak_valid":
      return "Alamat email tidak valid. Contoh: nama@contoh.id.";
    case "tanpa_kode_whatsapp":
      return "Kirim kode lewat WhatsApp dulu. Kode lewat email bisa diminta 1 menit sesudahnya.";
    case "tanpa_email_terverifikasi":
      return "Akun ini belum punya email terverifikasi. Hubungi CS kami lewat WhatsApp.";
    case "email_sudah_dipakai":
      return "Email ini sudah terverifikasi di akun lain. Hubungi CS kami lewat WhatsApp untuk bantuan.";
    case "email_wajib":
      return "Akun staf wajib punya email. Ganti emailnya, jangan dihapus.";
  }
  // Exhaustive: a new refusal reason fails the typecheck here until it has a message.
  const unhandled: never = reason;
  throw new Error(`No message for ${String(unhandled)}`);
}

function waitText(retryAt: Date, now: Date): string {
  const seconds = Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 1000));
  if (seconds < 60) return `dalam ${seconds} detik`;
  return `dalam ${Math.ceil(seconds / 60)} menit`;
}
