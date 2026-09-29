import { describe, expect, it } from "vitest";
import { perluTindakanDariPesanan, type RingkasanTindakan } from "./perlu-tindakan";

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
