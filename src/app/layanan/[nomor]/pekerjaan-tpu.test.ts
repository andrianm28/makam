/**
 * The hari-H and standalone TPU jobs as the family's Layanan page reads them, rendered (ticket 117): a job that was cancelled reads
 * Dibatalkan and says nobody will do it, whoever held it, and never "Dikerjakan oleh ...". A Mitra Jasa's name is a promise that
 * somebody is doing the work, so it must not sit on a job that is gone.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PekerjaanTpuPemesan, PesananTpuTerbaca } from "@/domain/layanan";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock("./actions", () => ({
  batalkanPekerjaanTerlambatTpuPemesan: async () => ({ status: "gagal" as const, message: "" }),
  ajukanKeluhanLayanan: async () => ({ status: "gagal" as const, message: "" }),
  ajukanKeluhanPekerjaanTpu: async () => ({ status: "gagal" as const, message: "" }),
  beriPenilaianLayanan: async () => ({ status: "gagal" as const, message: "" }),
}));

const { PekerjaanTpuDaftar } = await import("./pekerjaan-tpu");

function pekerjaan(over: Partial<PekerjaanTpuPemesan>): PekerjaanTpuPemesan {
  return {
    id: "pekerjaan-1",
    label: "Layanan – Bunga Tabur (Reguler)",
    amount: 250_001,
    targetDate: "2026-10-02",
    jendela: { dari: "2026-09-30", sampai: "2026-10-04" },
    teks: null,
    status: "dijadwalkan",
    mitraJasa: null,
    bukti: [],
    keluhan: { bolehDiajukan: false, berakhirAt: null, diajukan: null },
    ...over,
  };
}

/** The page's list for an order holding this one job. */
function daftarDengan(satu: PekerjaanTpuPemesan): string {
  const order: PesananTpuTerbaca = {
    nomor: "MKM-2026-000001",
    sumber: "saat_duka_tpu",
    tagihanId: "tagihan-1",
    tpu: { id: "tpu-1", name: "TPU Kober", address: "Jl. Kober" },
    makam: { blokNomor: "Blok C-7 No. 21", almarhumName: "Siti Aminah", keterangan: null, adaFoto: false, pin: null },
    total: 2_000_001,
    item: [satu],
  };
  return renderToStaticMarkup(createElement(PekerjaanTpuDaftar, { order }));
}

const RUDI = { namaDepan: "Rudi", fotoUrl: null };

describe("a TPU job on the family's Layanan page", () => {
  it("says a cancelled one will not be done, even when a Mitra Jasa still held it, and does not name them as the one doing it", () => {
    const markup = daftarDengan(pekerjaan({ status: "dibatalkan", mitraJasa: RUDI }));

    expect(markup).toContain("Pekerjaan ini dibatalkan dan tidak akan dikerjakan.");
    expect(markup).not.toContain("Dikerjakan oleh");
    expect(markup).not.toContain("Rudi");
  });

  it("says a cancelled one that no Mitra Jasa held will not be done, and does not promise one", () => {
    const markup = daftarDengan(pekerjaan({ status: "dibatalkan" }));

    expect(markup).toContain("Pekerjaan ini dibatalkan dan tidak akan dikerjakan.");
    expect(markup).not.toContain("Mitra Jasa akan ditugaskan");
  });

  it("names the Mitra Jasa who accepted a job that is still on", () => {
    const markup = daftarDengan(pekerjaan({ status: "dijadwalkan", mitraJasa: RUDI }));

    expect(markup).toContain("Dikerjakan oleh");
    expect(markup).toContain("Rudi");
    expect(markup).not.toContain("tidak akan dikerjakan");
  });

  it("promises a Mitra Jasa before the target date for a job nobody holds yet", () => {
    expect(daftarDengan(pekerjaan({ status: "dijadwalkan" }))).toContain("Mitra Jasa akan ditugaskan sebelum tanggal target.");
  });
});
