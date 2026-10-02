import { describe, expect, it } from "vitest";
import { perluTindakanDariBerkasTpu, perluTindakanDariKonsen, perluTindakanDariPermohonan, perluTindakanDariPesanan, type RingkasanTindakan } from "./perlu-tindakan";

/** One order with nothing that needs the family, the baseline every test starts from and overrides. */
function ringkasan(over: Partial<RingkasanTindakan> = {}): RingkasanTindakan {
  return {
    nomor: "MKM-2026-000001",
    href: "/pesanan/MKM-2026-000001",
    tagihan: null,
    dokumenBelum: 0,
    alternatifMenunggu: false,
    tertutup: false,
    ...over,
  };
}

describe("Akun Saya's Perlu Tindakan strip: the registry (spec story 99)", () => {
  it("is empty when nothing on the Akun needs it", () => {
    expect(perluTindakanDariPesanan([ringkasan()])).toEqual([]);
  });

  it("flags an unpaid Tagihan, worded differently once it is past its due date", () => {
    const belumDibayar = perluTindakanDariPesanan([ringkasan({ tagihan: { status: "belum_dibayar", href: "/dokumen/abc" } })]);
    expect(belumDibayar).toEqual([
      expect.objectContaining({ id: "tagihan:MKM-2026-000001", href: "/dokumen/abc", judul: expect.stringContaining("belum dibayar") }),
    ]);

    const lewatJatuhTempo = perluTindakanDariPesanan([ringkasan({ tagihan: { status: "lewat_jatuh_tempo", href: "/dokumen/abc" } })]);
    expect(lewatJatuhTempo[0]?.deskripsi).toContain("lewat jatuh tempo");
  });

  it("never flags a Tagihan that is Lunas, Dibatalkan or Tidak Tertagih", () => {
    for (const status of ["lunas", "dibatalkan", "tidak_tertagih", "dikembalikan_sebagian", "dikembalikan_penuh"] as const) {
      expect(perluTindakanDariPesanan([ringkasan({ tagihan: { status, href: "/dokumen/abc" } })])).toEqual([]);
    }
  });

  it("flags missing documents on an order still open, and clears once none are missing", () => {
    const belum = perluTindakanDariPesanan([ringkasan({ dokumenBelum: 2 })]);
    expect(belum).toEqual([expect.objectContaining({ id: "dokumen:MKM-2026-000001", deskripsi: expect.stringContaining("2 dokumen") })]);

    expect(perluTindakanDariPesanan([ringkasan({ dokumenBelum: 0 })])).toEqual([]);
  });

  it("never nags for documents on a Ditolak or Dibatalkan order", () => {
    expect(perluTindakanDariPesanan([ringkasan({ dokumenBelum: 3, tertutup: true })])).toEqual([]);
  });

  it("flags an alternative waiting for an answer, and clears once it is answered", () => {
    expect(perluTindakanDariPesanan([ringkasan({ alternatifMenunggu: true })])).toEqual([
      expect.objectContaining({ id: "alternatif:MKM-2026-000001" }),
    ]);
    expect(perluTindakanDariPesanan([ringkasan({ alternatifMenunggu: false })])).toEqual([]);
  });

  it("lists every item across every order handed in, one order's own facts never bleeding into another's", () => {
    const items = perluTindakanDariPesanan([
      ringkasan({ nomor: "MKM-2026-000001", tagihan: { status: "belum_dibayar", href: "/dokumen/a" } }),
      ringkasan({ nomor: "MKM-2026-000002", href: "/pesanan/MKM-2026-000002", dokumenBelum: 1, alternatifMenunggu: true }),
    ]);
    expect(items.map((item) => item.id).sort()).toEqual(["alternatif:MKM-2026-000002", "dokumen:MKM-2026-000002", "tagihan:MKM-2026-000001"]);
  });
});

describe("a manual Perpanjangan request in Perlu tindakan", () => {
  const permohonan = { id: "8a1c0000-0000-4000-8000-000000000001", lokasiName: "Makam Wakaf Al-Ikhlas", petakNomor: "A-12" };

  it("shows a request the Admin Lokasi sent back (Perlu Perbaikan), linking to it, and clears once it is filed again", () => {
    expect(perluTindakanDariPermohonan([{ ...permohonan, status: "perlu_perbaikan", dapatDipesan: false }])).toEqual([
      expect.objectContaining({ id: `permohonan-perbaikan:${permohonan.id}`, href: `/perpanjangan/permohonan/${permohonan.id}`, judul: expect.stringContaining("perlu diperbaiki") }),
    ]);
    expect(perluTindakanDariPermohonan([{ ...permohonan, status: "diajukan", dapatDipesan: false }])).toEqual([]);
  });

  it("shows an approval that can still be ordered on, and nothing for one that lapsed, was spent, or was rejected", () => {
    expect(perluTindakanDariPermohonan([{ ...permohonan, status: "disetujui", dapatDipesan: true }])).toEqual([
      expect.objectContaining({ id: `permohonan-disetujui:${permohonan.id}`, deskripsi: expect.stringContaining("30 hari") }),
    ]);
    for (const status of ["disetujui", "ditolak", "dibatalkan"] as const) {
      expect(perluTindakanDariPermohonan([{ ...permohonan, status, dapatDipesan: false }])).toEqual([]);
    }
  });
});

describe("a TPU filing in Perlu tindakan (ticket 46)", () => {
  const dueAt = new Date("2026-10-09T16:59:59Z");

  it("names the missing documents of an order past Dimakamkan and links to its page", () => {
    const [item] = perluTindakanDariBerkasTpu([{ nomor: "TPU-2026-000001", tpuName: "TPU Karet Bivak", kurang: ["KTP Pemesan", "Surat kematian"], dueAt, terlambat: false }]);
    expect(item).toMatchObject({ id: "berkas-tpu:TPU-2026-000001", href: "/pengurusan/TPU-2026-000001" });
    expect(item!.judul).toContain("TPU-2026-000001");
    expect(item!.deskripsi).toContain("KTP Pemesan");
    expect(item!.deskripsi).toContain("Surat kematian");
  });

  it("says so when the 7-day window has passed", () => {
    const [item] = perluTindakanDariBerkasTpu([{ nomor: "TPU-2026-000001", tpuName: "TPU Karet Bivak", kurang: ["KTP Pemesan"], dueAt, terlambat: true }]);
    expect(item!.deskripsi).toContain("lewat");
  });

  it("has nothing for an order whose documents are all in", () => {
    expect(perluTindakanDariBerkasTpu([])).toEqual([]);
  });
});

describe("Perlu tindakan: a further burial's consent request (ticket 35)", () => {
  it("gives the Pemegang Hak one row per waiting request, pointing at its own answer page", () => {
    const item = perluTindakanDariKonsen([{ nomor: "MKM-2026-000007", lokasiName: "TPU Al-Ikhlas", pemesanName: "Rina", almarhumName: "Budi" }]);
    expect(item).toEqual([expect.objectContaining({ id: "konsen:MKM-2026-000007", href: "/akun/persetujuan/MKM-2026-000007" })]);
    expect(perluTindakanDariKonsen([])).toEqual([]);
  });
});
