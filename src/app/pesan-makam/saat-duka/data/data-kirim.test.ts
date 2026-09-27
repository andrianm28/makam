/**
 * "Data & kirim" says what is not paid yet and when it will be (AC 1: the
 * Lokasi Mitra's own Saat Duka payment window, not a span written in copy). The
 * screen is rendered here with the window its server page read, so a hardcoded
 * deadline in this file would show up as the same words for two different
 * Lokasi.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock("../actions", () => ({
  kirimPesanan: async () => ({ status: "gagal" as const, pesan: {} }),
  verifikasiKodeMasukDanKirim: async () => ({ status: "gagal" as const, pesan: {} }),
}));

const { DataKirim } = await import("./data-kirim");

/** The screen as the page renders it, with one Lokasi Mitra's payment window. */
function layar(jumlahJamPembayaran: number | null) {
  return renderToStaticMarkup(
    createElement(DataKirim, {
      draft: { lokasiId: "7a0c5a52-0000-4000-8000-000000000001", jenisMakamId: "b7d93983-c9f0-4088-a874-a65d4d762b40", email: "keluarga@contoh.id", pemesanName: "Budi Santoso", phoneNumber: "081234567890" },
      kartu: {
        nama: "Reguler 1 × 2 m",
        tenure: "5 tahun",
        total: 9_650_000,
        rincian: [{ label: "Harga Hak Pakai – Reguler 1 × 2 m", jumlah: 7_500_000 }],
      } as never,
      lokasi: { id: "7a0c5a52-0000-4000-8000-000000000001", name: "Makam Wakaf Al-Ikhlas", city: "Kota Jakarta Timur" },
      sudahMasuk: true,
      mintaKodeMasuk: async () => ({ status: "idle" }) as never,
      csContact: null,
      jumlahJamPembayaran,
    }),
  );
}

describe("the wizard's promise about money", () => {
  it("names the Lokasi's own payment window: two Lokasi, two different deadlines", () => {
    const pendek = layar(24);
    const panjang = layar(120);

    expect(pendek).toContain("jatuh tempo sehari setelah pemakaman");
    expect(panjang).toContain("jatuh tempo lima hari setelah pemakaman");
    expect(pendek).not.toEqual(panjang);
  });

  it("never names a span of its own, and keeps saying that the burial goes ahead", () => {
    const html = layar(72);

    expect(html).not.toContain("3×24");
    expect(html).toContain("Pemakaman tetap berjalan");
    expect(html).toContain("Tagihan terbit setelah Lokasi Mitra mengonfirmasi");
  });
});
