import { describe, expect, it } from "vitest";
import { csWhatsAppLink, identityMessage, type IdentityRefusal } from "./state";

const everyRefusal: IdentityRefusal[] = [
  "nomor_tidak_valid",
  "nomor_bukan_indonesia",
  "gagal_kirim",
  "tunggu_kirim_ulang",
  "terlalu_sering",
  "terkunci",
  "kode_salah",
  "kode_kedaluwarsa",
  "terlalu_banyak_percobaan",
  "belum_masuk",
  "tidak_berwenang",
  "input_tidak_valid",
  "perlu_totp",
  "email_tidak_valid",
  "email_sudah_dipakai",
];

describe("Kode Masuk and Akun Saya messages", () => {
  it("tells someone with a foreign phone number to give an Indonesian (+62) one", () => {
    expect(identityMessage("nomor_bukan_indonesia")).toBe("Gunakan nomor telepon Indonesia (+62).");
  });

  it("gives every refusal from the identity module and the guard its own message", () => {
    const messages = everyRefusal.map((reason) => identityMessage(reason));

    expect(messages).not.toContain("Terjadi kesalahan. Silakan coba lagi.");
    expect(new Set(messages).size).toBe(everyRefusal.length);
  });

  it("says how long to wait when the refusal has a retry time", () => {
    const now = new Date("2026-10-01T02:00:00Z");
    expect(identityMessage("terlalu_sering", new Date("2026-10-01T02:30:00Z"), now)).toBe(
      "Terlalu banyak permintaan kode. Coba lagi dalam 30 menit.",
    );
  });
});

describe('"Tidak punya email? Minta bantuan CS"', () => {
  it("links to the CS number from Pengaturan Operator by wa.me, without the plus", () => {
    expect(csWhatsAppLink({ whatsApp: "+6281122223333", replyHours: "dibalas mulai pukul 06:00" })).toBe(
      "https://wa.me/6281122223333",
    );
  });
});
