import type {
  ConfirmEmailVerificationResult,
  RequestEmailVerificationResult,
  RequestKodeMasukResult,
  UpdatePhoneNumberResult,
  VerifyKodeMasukResult,
} from "@/domain/identity";
import type { GuardError } from "@/server/guard";

/**
 * What the Kode Masuk Server Actions hand back to the Kode Masuk form. Shared
 * by Masuk and (later) Kirim in the booking wizards.
 */
export type KodeMasukRequestState =
  | { status: "idle" }
  | {
      status: "terkirim";
      /** The email as the identity module normalised it. */
      email: string;
      /** Seconds until "Kirim ulang" opens, from the server's Clock. */
      resendInSeconds: number;
      /** Changes on every send, so the form restarts its timer. */
      sentAt: string;
    }
  | { status: "gagal"; message: string; email?: string };

export type KodeMasukVerifyState = { status: "idle" } | { status: "gagal"; message: string };

export const initialKodeMasukRequestState: KodeMasukRequestState = { status: "idle" };
export const initialKodeMasukVerifyState: KodeMasukVerifyState = { status: "idle" };

/** The CS WhatsApp contact from Pengaturan Operator, for "Tidak punya email? Minta bantuan CS"; null until it is entered. */
export interface CsContact {
  /** Canonical E.164 (+62…). */
  whatsApp: string;
  /** e.g. "dibalas mulai pukul 06:00". */
  replyHours: string;
}

/** The wa.me link to the CS number (a person answering in the Business app; no API). */
export function csWhatsAppLink(contact: CsContact): string {
  return `https://wa.me/${contact.whatsApp.replace(/^\+/, "")}`;
}

type Refusal<T> = T extends { ok: false; reason: infer R } ? R : never;

/** Every reason the identity module's Kode Masuk, Verifikasi Email and phone actions, or the guard, can refuse. */
export type IdentityRefusal =
  | Refusal<RequestKodeMasukResult>
  | Refusal<VerifyKodeMasukResult>
  | Refusal<RequestEmailVerificationResult>
  | Refusal<ConfirmEmailVerificationResult>
  | Refusal<UpdatePhoneNumberResult>
  | GuardError;

/** Bahasa Indonesia for every reason the identity module or the guard can refuse. */
export function identityMessage(reason: IdentityRefusal, retryAt?: Date, now?: Date): string {
  const wait = retryAt && now ? waitText(retryAt, now) : "";
  switch (reason) {
    case "nomor_tidak_valid":
      return "Nomor telepon tidak valid. Contoh: 0812 3456 7890.";
    case "nomor_bukan_indonesia":
      return "Gunakan nomor telepon Indonesia (+62).";
    case "tunggu_kirim_ulang":
      return `Kode baru bisa dikirim ${wait || "sebentar lagi"}.`;
    case "terlalu_sering":
      return `Terlalu banyak permintaan kode. Coba lagi ${wait || "nanti"}.`;
    case "terkunci":
      return `Terlalu banyak kode salah. Masuk dengan email ini dikunci sementara; coba lagi ${wait || "nanti"}.`;
    case "gagal_kirim":
      return "Kode belum bisa dikirim lewat email. Silakan coba lagi.";
    case "kode_salah":
      return "Kode salah. Periksa lagi kode di email Anda.";
    case "kode_kedaluwarsa":
      return "Kode sudah kedaluwarsa. Kirim ulang untuk mendapat kode baru.";
    case "terlalu_banyak_percobaan":
      return "Terlalu banyak kode salah. Kirim ulang untuk mendapat kode baru.";
    case "belum_masuk":
      return "Silakan masuk dulu dengan email Anda.";
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    case "perlu_totp":
      return "Masukkan kode dari aplikasi authenticator Anda dulu.";
    case "input_tidak_valid":
      return "Periksa lagi isian Anda.";
    case "email_tidak_valid":
      return "Alamat email tidak valid. Contoh: nama@contoh.id.";
    case "email_sudah_dipakai":
      return "Email ini sudah menjadi email akun lain. Hubungi CS kami untuk bantuan.";
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
