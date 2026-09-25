import { describe, expect, it } from "vitest";
import { otpMessage, type OtpRefusal } from "./state";

const everyRefusal: OtpRefusal[] = [
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
  "tanpa_email_terverifikasi",
  "email_sudah_dipakai",
  "email_wajib",
];

describe("OTP screen messages", () => {
  it("tells a Pemesan with a foreign number to use an Indonesian (+62) WhatsApp number", () => {
    expect(otpMessage("nomor_bukan_indonesia")).toBe("Gunakan nomor WhatsApp Indonesia (+62).");
  });

  it("gives every refusal from the identity module and the guard its own message", () => {
    const messages = everyRefusal.map((reason) => otpMessage(reason));

    expect(messages).not.toContain("Terjadi kesalahan. Silakan coba lagi.");
    expect(new Set(messages).size).toBe(everyRefusal.length);
  });

  it("says how long to wait when the refusal has a retry time", () => {
    const now = new Date("2026-10-01T02:00:00Z");
    expect(otpMessage("terlalu_sering", new Date("2026-10-01T02:30:00Z"), now)).toBe(
      "Terlalu banyak permintaan kode. Coba lagi dalam 30 menit.",
    );
  });
});
