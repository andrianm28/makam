/**
 * The identity module's own emails (sent directly through EmailSender, like
 * the WhatsApp Kode Masuk; no Notifications template). Bahasa Indonesia.
 */

const FOOTER = "Abaikan email ini bila bukan Anda yang memintanya. Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku dari Makam.co.id.";

/** The email Kode Masuk (Masuk dengan email, and "Kirim lewat email" after a WhatsApp code). */
export function kodeMasukEmailMessage(code: string): { subject: string; text: string } {
  return {
    subject: `Kode Masuk Makam.co.id: ${code}`,
    text: [
      `Kode Masuk Anda: ${code}`,
      "",
      "Masukkan kode ini di halaman Masuk Makam.co.id. Kode berlaku 10 menit dan hanya bisa dipakai sekali.",
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
      "Masukkan kode ini untuk memverifikasi email ini di akun Makam.co.id Anda. Setelah terverifikasi, Anda bisa masuk dengan email ini. Kode berlaku 10 menit dan hanya bisa dipakai sekali.",
      "",
      FOOTER,
    ].join("\n"),
  };
}
