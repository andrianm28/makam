import { describe, expect, it } from "vitest";
import {
  addresseeText,
  buktiPemesananHak,
  buktiPemesananMasa,
  lineProviderText,
  paymentMethodText,
  tagihanStatusText,
} from "./billing-labels";

describe("how a Tagihan and a Bukti Pembayaran read", () => {
  it("names every Tagihan status as the glossary does", () => {
    expect(
      (["belum_dibayar", "lunas", "lewat_jatuh_tempo", "tidak_tertagih", "dibatalkan", "dikembalikan_sebagian", "dikembalikan_penuh"] as const).map(
        tagihanStatusText,
      ),
    ).toEqual([
      "Belum Dibayar",
      "Lunas",
      "Lewat Jatuh Tempo",
      "Tidak Tertagih",
      "Dibatalkan",
      "Dikembalikan Sebagian",
      "Dikembalikan Penuh",
    ]);
  });

  it("words each payment method; a direct payment reads 'diterima oleh Lokasi Mitra X', a Rp 0 Tagihan 'Tanpa pembayaran (Harga Khusus)'", () => {
    expect(paymentMethodText({ kind: "penyedia_pembayaran", channel: "QRIS" })).toBe("Pembayaran online (QRIS)");
    expect(paymentMethodText({ kind: "transfer_manual" })).toBe("Transfer manual");
    expect(paymentMethodText({ kind: "tunai" })).toBe("Tunai");
    expect(paymentMethodText({ kind: "langsung_ke_lokasi", lokasiName: "Makam Wakaf Al-Ikhlas" })).toBe(
      "Dibayar langsung, diterima oleh Lokasi Mitra Makam Wakaf Al-Ikhlas",
    );
    expect(paymentMethodText({ kind: "tanpa_pembayaran" })).toBe("Tanpa pembayaran (Harga Khusus)");
  });

  it("names the addressee by role: a Tagihan is 'Kepada' the Pemesan or Pemegang Hak, its Bukti Pembayaran 'Atas nama' them", () => {
    expect(addresseeText("tagihan", "pemesan")).toBe("Kepada (Pemesan)");
    expect(addresseeText("tagihan", "pemegang_hak")).toBe("Kepada (Pemegang Hak)");
    expect(addresseeText("bukti_pembayaran", "pemesan")).toBe("Atas nama (Pemesan)");
    expect(addresseeText("bukti_pembayaran", "pemegang_hak")).toBe("Atas nama (Pemegang Hak)");
  });

  it("attributes each line to who provides it: the Lokasi Mitra by name, Makam.co.id for the Operator's own fees", () => {
    expect(lineProviderText({ kind: "lokasi_mitra", lokasiId: "x", name: "Makam Wakaf Al-Ikhlas" })).toBe("Makam Wakaf Al-Ikhlas");
    expect(lineProviderText({ kind: "operator" })).toBe("Makam.co.id");
    expect(lineProviderText({ kind: "pemda" })).toBe("Pemda (disetor sesuai biaya)");
  });
});

/**
 * A Bukti Pemesanan states one right for a fixed length of time or for ever, and
 * a document that proves a grave may never say both at once. The row and the
 * sentence are locked together here, because a family reads the sentence when it
 * decides whether the plot is theirs for good.
 */
describe("what a Bukti Pemesanan says about the Hak Pakai's term", () => {
  const hak = { lokasiName: "Makam Wakaf Al-Ikhlas", pemegangHakName: "Budi Santoso", petakNomor: "A-01" };
  const tetap = { mulai: "2026-10-02", selesai: "2031-10-02" };
  const selamanya = { mulai: "2026-10-02", selesai: null };

  it("a fixed-term Hak Pakai names both of its dates, and is never called limitless", () => {
    expect(buktiPemesananMasa(tetap)).toBe("2 Oktober 2026 sampai 2 Oktober 2031");
    const kalimat = buktiPemesananHak(hak, tetap);
    expect(kalimat).toContain("2 Oktober 2026");
    expect(kalimat).toContain("2 Oktober 2031");
    expect(kalimat).not.toContain("tanpa batas waktu");
    expect(kalimat).not.toContain("selamanya");
  });

  it("a perpetual Hak Pakai says so, in the row and in the sentence", () => {
    expect(buktiPemesananMasa(selamanya)).toBe("2 Oktober 2026 · selamanya");
    const kalimat = buktiPemesananHak(hak, selamanya);
    expect(kalimat).toContain("sah tanpa batas waktu");
    expect(kalimat).toContain("2 Oktober 2026");
    expect(kalimat).not.toMatch(/sampai \d/);
  });

  it("the sentence and the row read one masa, so they can never disagree", () => {
    // The defect this locks: the row said "sampai 2 Oktober 2031" while the
    // sentence said "sah tanpa batas waktu" on the very same document.
    for (const masa of [tetap, selamanya]) {
      const ringkasan = buktiPemesananMasa(masa);
      const kalimat = buktiPemesananHak(hak, masa);
      const tanpaAkhir = ringkasan.includes("selamanya");
      expect(kalimat.includes("sah tanpa batas waktu")).toBe(tanpaAkhir);
    }
  });
});
