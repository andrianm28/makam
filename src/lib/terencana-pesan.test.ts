import { describe, expect, it } from "vitest";
import { pesanKirim, pesanPeriksa } from "./terencana-pesan";
/**
 * Every refusal the Pemesanan module can answer has words of its own: a family never
 * sees a reason key, and the fallback ("Periksa lagi pilihan petak Anda.") is only for
 * the refusals that name no plot.
 */
const TANPA_PETAK = new Set(["tanpa_unit", "input_tidak_valid", "lokasi_tidak_ada", "harga_tidak_tersedia", "akun_tidak_cocok", "telepon_tidak_valid", "telepon_pemegang_hak_tidak_valid"]);

const penolakan = [
  { reason: "sudah_dipesan", nomor: "A-12", sisa: [] },
  { reason: "unit_tidak_bisa_dipilih", nomor: "A-12", status: "terisi", sisa: [] },
  { reason: "unit_campur" },
  { reason: "unit_ganda", nomor: "A-12" },
  { reason: "tanpa_unit" },
  { reason: "melebihi_batas_qris", total: 10_150_000 },
  { reason: "unit_tidak_ditemukan" },
  { reason: "lokasi_tidak_ada" },
  { reason: "harga_tidak_tersedia" },
  { reason: "telepon_pemegang_hak_tidak_valid" },
  { reason: "akun_tidak_cocok" },
  { reason: "telepon_tidak_valid" },
  { reason: "input_tidak_valid" },
] as const;

describe("the words for a refused Terencana selection", () => {
  it("names the plot, the limit and the next step", () => {
    expect(pesanKirim({ ok: false, reason: "sudah_dipesan", nomor: "A-12", sisa: [] })).toBe(
      "Maaf, A-12 baru saja dipesan keluarga lain. Pilihan petak Anda yang lain tetap tersimpan.",
    );
    expect(pesanKirim({ ok: false, reason: "unit_tidak_bisa_dipilih", nomor: "A-12", status: "terisi", sisa: [] })).toBe(
      "A-12 sudah terisi, jadi tidak bisa dipilih. Pilih petak lain di denah.",
    );
    expect(pesanKirim({ ok: false, reason: "melebihi_batas_qris", total: 10_150_000 })).toContain("Rp 10.150.000 melewati batas pembayaran Rp 10.000.000 lewat QRIS");
  });

  it("says the same thing at Lanjut as at Kirim", () => {
    const ditolak = { ok: false as const, reason: "sudah_dipesan" as const, nomor: "A-12", sisa: [] };
    expect(pesanPeriksa(ditolak)).toBe(pesanKirim(ditolak));
  });

  it("never shows a reason key, and every refusal has a message of its own", () => {
    for (const satu of penolakan) {
      const pesan = pesanKirim(satu as Parameters<typeof pesanKirim>[0]);
      expect(pesan.length).toBeGreaterThan(20);
      expect(pesan).toMatch(/[a-z]/i);
      if (!TANPA_PETAK.has(satu.reason)) expect(pesan).not.toBe("Periksa lagi pilihan petak Anda.");
    }
  });
});
