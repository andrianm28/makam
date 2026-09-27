/**
 * The Saat Duka TPU submission (spec, Pengurusan; stories 68–72; ticket 44's
 * AC), read only through the Pengurusan module's public functions.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  fotoIptm,
  kuburanTumpang,
  orderSaatDukaTpu,
  pengurusanOnTestDatabase,
  saatDukaTpuFixture,
  setMenerimaMakamBaru,
} from "../../../tests/support/pengurusan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the Saat Duka TPU submission", () => {
  it("creates a Diajukan order with a Nomor Pemesanan, the deadline on the TPU clock, both document sets and no Tagihan", async () => {
    const setup = pengurusanOnTestDatabase(db);
    const fixture = await saatDukaTpuFixture(setup);
    setup.clock.set(wib("2026-10-01 23:00"));

    const placed = await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));

    expect(placed).toEqual({ ok: true, pengurusan: { nomor: "MKM-2026-000001", status: "diajukan", konfirmasiDueAt: wib("2026-10-02 08:00") } });

    const order = await setup.pengurusan.orderOf("MKM-2026-000001", fixture.pemesan);
    expect(order).toMatchObject({
      nomor: "MKM-2026-000001",
      kind: "saat_duka_tpu",
      status: "diajukan",
      tpu: { id: fixture.tpuDki.id, name: "TPU Kober", address: "Jl. TPU Kober No. 1, Jakarta Timur" },
      pemesan: { name: "Budi Santoso", email: "pemesan@contoh.id", phoneNumber: "+6281234567890" },
      almarhum: { name: "Siti Aminah", tanggalWafat: "2026-09-30" },
      jenisPenguburan: "baru",
      // Nothing is billed at submission: the Tagihan is issued at the confirmation.
      tagihanId: null,
      konfirmasiDueAt: wib("2026-10-02 08:00"),
      diajukanAt: wib("2026-10-01 23:00"),
    });
    // Two sets, kept apart: one to carry to the TPU, one to upload for the filing.
    expect(order?.dokumen.pemakaman.map((satu) => satu.nama)).toEqual([
      "KTP Pemegang Hak",
      "Kartu Keluarga",
      "Surat keterangan kematian almarhum / almarhumah",
    ]);
    expect(order?.dokumen.pengajuan.map((satu) => satu.nama)).toEqual([
      "Foto KTP Pemegang Hak",
      "Foto Kartu Keluarga",
      "Surat pernyataan pemilik makam",
      "Surat keterangan kematian almarhum / almarhumah",
    ]);
  });

  it("refuses a family with neither a DKI KTP nor a death in Jakarta, and writes no order", async () => {
    const setup = pengurusanOnTestDatabase(db);
    const fixture = await saatDukaTpuFixture(setup);

    const placed = await setup.pengurusan.placeSaatDukaTpu(
      orderSaatDukaTpu(fixture, { kelayakan: { ktpDki: false, wafatDiJakarta: false } }),
    );

    expect(placed).toEqual({ ok: false, reason: "kelayakan_tidak_terpenuhi" });
    expect(await setup.pengurusan.orderOf("MKM-2026-000001", fixture.pemesan)).toBeNull();
  });

  it("adds the Pasal 17(2) documents to a death outside Jakarta, while a KTP that is not a DKI one adds none", async () => {
    const setup = pengurusanOnTestDatabase(db);
    const fixture = await saatDukaTpuFixture(setup);
    const { pengurusan } = setup;

    const luarJakarta = await pengurusan.daftarDokumen({ jenis: "baru", kelayakan: { ktpDki: true, wafatDiJakarta: false } });
    const ktpLuar = await pengurusan.daftarDokumen({ jenis: "baru", kelayakan: { ktpDki: false, wafatDiJakarta: true } });

    expect(luarJakarta.pengajuan.length - ktpLuar.pengajuan.length).toBe(2);
    expect(luarJakarta.pengajuan.filter((satu) => satu.catatan?.includes("Pasal 17")).length).toBe(1);
    expect(ktpLuar.pengajuan.filter((satu) => satu.catatan?.includes("Pasal 17"))).toEqual([]);
    // The burial itself is met with what it was already met with.
    expect(luarJakarta.pemakaman).toEqual(ktpLuar.pemakaman);

    // And the order carries the set its own answers produced.
    const placed = await pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture, { kelayakan: { ktpDki: true, wafatDiJakarta: false } }));
    expect(placed.ok).toBe(true);
    const order = await pengurusan.orderOf("MKM-2026-000001", fixture.pemesan);
    expect(order?.dokumen.pengajuan).toEqual(luarJakarta.pengajuan);
  });

  it("makes a Tumpang only with the grave described and its IPTM photographed", async () => {
    const setup = pengurusanOnTestDatabase(db);
    const fixture = await saatDukaTpuFixture(setup);
    const { pengurusan } = setup;

    expect(await pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture, { jenis: "tumpang" }))).toEqual({
      ok: false,
      reason: "kuburan_kosong",
    });
    expect(
      await pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture, { jenis: "tumpang", kuburan: kuburanTumpang() })),
    ).toEqual({ ok: false, reason: "foto_iptm_kosong" });

    const placed = await pengurusan.placeSaatDukaTpu(
      orderSaatDukaTpu(fixture, { jenis: "tumpang", kuburan: kuburanTumpang(), fotoIptm: fotoIptm() }),
    );

    expect(placed.ok).toBe(true);
    const order = await pengurusan.orderOf("MKM-2026-000001", fixture.pemesan);
    expect(order).toMatchObject({ jenisPenguburan: "tumpang", kuburan: { blokNomor: "Blok B-12 No. 34", nama: "Hasan Basri" } });
    // The consent of the holder it is tumpangi is a document of both sets for a Tumpang.
    expect(order?.dokumen.pemakaman.some((satu) => satu.nama.includes("persetujuan"))).toBe(true);
    expect(order?.dokumen.pengajuan.some((satu) => satu.nama.includes("Foto IPTM"))).toBe(true);
  });

  it("refuses a TPU that has stopped taking new plots, though the list offered it", async () => {
    const setup = pengurusanOnTestDatabase(db);
    const fixture = await saatDukaTpuFixture(setup);
    await setMenerimaMakamBaru(setup, fixture.tpuDki.id, false);

    const placed = await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));

    expect(placed).toEqual({ ok: false, reason: "tpu_tidak_menerima_makam_baru" });
  });

  it("keeps a Pemegang Hak named for the IPTM, with their own contact, and never the Almarhum", async () => {
    const setup = pengurusanOnTestDatabase(db);
    const fixture = await saatDukaTpuFixture(setup);

    const placed = await setup.pengurusan.placeSaatDukaTpu(
      orderSaatDukaTpu(fixture, {
        pemegangHak: { mode: "lain", name: "Andi Santoso", phoneNumber: "081298765432", email: "Andi@Keluarga.id" },
      }),
    );

    expect(placed.ok).toBe(true);
    const order = await setup.pengurusan.orderOf("MKM-2026-000001", fixture.pemesan);
    expect(order?.pemegangHak).toEqual({
      mode: "lain",
      name: "Andi Santoso",
      phoneNumber: "+6281298765432",
      email: "andi@keluarga.id",
    });
    expect(
      await setup.pengurusan.placeSaatDukaTpu(
        orderSaatDukaTpu(fixture, { pemegangHak: { mode: "lain", name: "Siti Aminah", phoneNumber: "081298765432", email: "" } }),
      ),
    ).toEqual({ ok: false, reason: "pemegang_hak_almarhum" });
  });
});
