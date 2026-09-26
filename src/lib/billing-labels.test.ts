import { describe, expect, it } from "vitest";
import { addresseeText, lineProviderText, paymentMethodText, tagihanStatusText } from "./billing-labels";

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
