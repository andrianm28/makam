import { formatWib } from "@/lib/time/jakarta";
import type { StaffRole } from "./authorize";

/**
 * The identity module's own emails, sent directly through EmailSender (no
 * Notifications template). Bahasa Indonesia.
 */

const FOOTER = "Abaikan email ini bila bukan Anda yang memintanya. Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku dari Makam.co.id.";

/** The Kode Masuk (Masuk, and Kirim in a wizard). */
export function kodeMasukEmailMessage(code: string): { subject: string; text: string } {
  return {
    subject: `Kode Masuk Makam.co.id: ${code}`,
    text: [
      `Kode Masuk Anda: ${code}`,
      "",
      "Masukkan kode ini di Makam.co.id. Kode berlaku 10 menit dan hanya bisa dipakai sekali. Bila email ini belum punya akun, akun dibuat saat kode dimasukkan.",
      "",
      FOOTER,
    ].join("\n"),
  };
}

/** The Verifikasi Email code (Akun Saya profile, staff area). */
export function verifikasiEmailMessage(code: string): { subject: string; text: string } {
  return {
    subject: `Kode verifikasi email Makam.co.id: ${code}`,
    text: [
      `Kode verifikasi email Anda: ${code}`,
      "",
      "Masukkan kode ini untuk menjadikan email ini email akun Makam.co.id Anda. Setelah terverifikasi, Kode Masuk dikirim ke email ini. Kode berlaku 10 menit dan hanya bisa dipakai sekali.",
      "",
      FOOTER,
    ].join("\n"),
  };
}

/** How the Undangan Staf email names the role. */
const inviteRoleNames: Record<StaffRole, string> = {
  admin_platform: "Admin Platform",
  admin_lokasi: "Admin Lokasi",
  petugas_lapangan: "Petugas Lapangan",
  mitra_jasa: "Mitra Jasa",
};

/** The Undangan Staf: which role, where to log in, and until when. */
export function undanganStafEmailMessage(input: {
  role: StaffRole;
  masukUrl: string;
  expiresAt: Date;
}): { subject: string; text: string } {
  const role = inviteRoleNames[input.role];
  return {
    subject: `Undangan Staf Makam.co.id: ${role}`,
    text: [
      `Anda diundang sebagai ${role} di Makam.co.id.`,
      "",
      `Masuk di ${input.masukUrl} dengan email ini sebelum ${formatWib(input.expiresAt)}. Kode Masuk dikirim ke email ini; peran Anda aktif begitu kode dimasukkan.`,
      "",
      "Abaikan email ini bila Anda tidak mengenal undangan ini.",
    ].join("\n"),
  };
}
