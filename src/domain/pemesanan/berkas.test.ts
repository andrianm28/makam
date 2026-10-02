/**
 * A family's own documents on one order, and the Lokasi's checklist (spec,
 * Pemesanan; stories 29, 30, 120; ticket 23's AC 5 and 8): the family uploads at
 * any time, the Admin Lokasi ticks, and documents never block anything.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, terverifikasiLokasi, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The documents a family scans of a paper, as the wizard's upload sends them. */
const ktp = { body: new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]), contentType: "image/jpeg" };

/** One placed order at a Lokasi Mitra whose checklist names these documents. */
async function orderDenganChecklist(setup: PemesananSetup) {
  const fixture = await saatDukaFixture(setup);
  const checklist = await setup.lokasi.documentChecklistOf(fixture.lokasiMitra.id);
  const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  return { ...fixture, checklist, nomor: placed.pemesanan.nomor };
}

describe("a family adds its own documents to its order", () => {
  it("puts a file on a checklist item and sees it on the order, at any time", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await orderDenganChecklist(setup);
    const nama = fixture.checklist[0]!;

    const hasil = await setup.pemesanan.unggahDokumen(fixture.pemesan, { nomor: fixture.nomor, nama, file: ktp });

    expect(hasil).toEqual({ ok: true, nama });
    const order = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    expect(order?.dokumen).toEqual([
      expect.objectContaining({ nama, diunggah: { at: wib("2026-10-01 09:00"), oleh: fixture.pemesan.accountId }, dicentang: null }),
      ...fixture.checklist.slice(1).map((lain) => ({ nama: lain, diunggah: null, dicentang: null })),
    ]);
    expect(await setup.pemesanan.urlDokumen(fixture.pemesan, fixture.nomor, nama)).toEqual(expect.stringContaining("/"));
  });

  it("replaces a file it already put there, and refuses a name that is not on the checklist", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await orderDenganChecklist(setup);
    const nama = fixture.checklist[0]!;

    await setup.pemesanan.unggahDokumen(fixture.pemesan, { nomor: fixture.nomor, nama, file: ktp });
    const kedua = await setup.pemesanan.unggahDokumen(fixture.pemesan, {
      nomor: fixture.nomor,
      nama,
      file: { body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 9, 9]), contentType: "application/pdf" },
    });

    expect(kedua).toEqual({ ok: true, nama });
    const order = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    expect(order?.dokumen.filter((satu) => satu.nama === nama)).toHaveLength(1);
    expect(
      await setup.pemesanan.unggahDokumen(fixture.pemesan, { nomor: fixture.nomor, nama: "Surat waris", file: ktp }),
    ).toEqual({ ok: false, reason: "dokumen_tidak_dikenal" });
    expect(await setup.pemesanan.unggahDokumen(fixture.pemesan, { nomor: fixture.nomor, nama, file: { body: new Uint8Array(), contentType: "image/jpeg" } })).toEqual({
      ok: false,
      reason: "berkas_kosong",
    });
  });

  it("is one order's own: another account's order and an unknown one are nothing", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await orderDenganChecklist(setup);
    const lain = await saatDukaFixture(setup, { email: "pemesan.lain@contoh.id" });
    const nama = fixture.checklist[0]!;

    expect(
      await setup.pemesanan.unggahDokumen(lain.pemesan, { nomor: fixture.nomor, nama, file: ktp }),
    ).toEqual({ ok: false, reason: "pesanan_tidak_ditemukan" });
    expect(
      await setup.pemesanan.unggahDokumen(fixture.pemesan, { nomor: "MKM-2026-999999", nama, file: ktp }),
    ).toEqual({ ok: false, reason: "pesanan_tidak_ditemukan" });
  });
});

describe("the Admin Lokasi of that Lokasi ticks its checklist off", () => {
  it("records the tick for its own order, audited on the Lokasi, and never for another Lokasi's", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await orderDenganChecklist(setup);
    const lain = await terverifikasiLokasi(setup, { name: "Makam Sawah Besar", city: "Kabupaten Bekasi" });
    const nama = fixture.checklist[0]!;

    expect(
      await setup.pemesanan.centangDokumen(lain.adminLokasi, { nomor: fixture.nomor, nama }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
    // Admin Platform may see an order but does not tick a Lokasi's checklist.
    expect(await setup.pemesanan.centangDokumen(fixture.admin, { nomor: fixture.nomor, nama })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });

    expect(await setup.pemesanan.centangDokumen(fixture.adminLokasi, { nomor: fixture.nomor, nama })).toEqual({ ok: true, nama });

    const order = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    expect(order?.dokumen[0]).toMatchObject({ nama, dicentang: { at: wib("2026-10-01 09:00"), oleh: fixture.adminLokasi.accountId } });
    const entries = await setup.audit.entriesForLokasi(fixture.lokasiMitra.id);
    expect(entries.at(-1)).toMatchObject({ action: "pemesanan.centang_dokumen", after: { nama, dicentang: true } });
  });

  it("never blocks a confirmation: an order with no documents at all is confirmed as it stands", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    const order = await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan);
    expect(order?.dokumen.every((satu) => satu.diunggah === null && satu.dicentang === null)).toBe(true);
  });
});

describe("an Admin Lokasi reads one order's family, and only its own Lokasi's", () => {
  it("lists the Lokasi's whole checklist on an order the family has uploaded nothing to", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await orderDenganChecklist(setup);

    const order = await setup.pemesanan.orderUntukStaf(fixture.adminLokasi, fixture.nomor);

    expect(fixture.checklist.length).toBeGreaterThan(0);
    expect(order?.dokumen.map((satu) => satu.nama)).toEqual(fixture.checklist);
  });

  it("shows the Pemesan's name, phone, email, the Almarhum and the documents for its own order", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await orderDenganChecklist(setup);
    await setup.pemesanan.unggahDokumen(fixture.pemesan, { nomor: fixture.nomor, nama: fixture.checklist[0]!, file: ktp });

    const order = await setup.pemesanan.orderUntukStaf(fixture.adminLokasi, fixture.nomor);

    expect(order).toMatchObject({
      nomor: fixture.nomor,
      status: "diajukan",
      pemesan: { name: "Budi Santoso", phoneNumber: "+6281234567890", email: "pemesan@contoh.id" },
      almarhum: { name: "Siti Aminah", tanggalWafat: "2026-09-30" },
      dokumen: [
        expect.objectContaining({ nama: fixture.checklist[0], diunggah: expect.objectContaining({ at: wib("2026-10-01 09:00") }) }),
        ...fixture.checklist.slice(1).map((lain) => ({ nama: lain, diunggah: null, dicentang: null })),
      ],
    });
    expect(await setup.pemesanan.urlDokumenUntukStaf(fixture.adminLokasi, fixture.nomor, fixture.checklist[0]!)).toEqual(
      expect.stringContaining("/"),
    );
  });

  it("finds nothing for another Lokasi Mitra's order, and nothing for an unknown one", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await orderDenganChecklist(setup);
    const lain = await terverifikasiLokasi(setup, { name: "Makam Sawah Besar", city: "Kabupaten Bekasi" });

    expect(await setup.pemesanan.orderUntukStaf(lain.adminLokasi, fixture.nomor)).toBeNull();
    expect(await setup.pemesanan.orderUntukStaf(fixture.adminLokasi, "MKM-2026-999999")).toBeNull();
    expect(await setup.pemesanan.urlDokumenUntukStaf(lain.adminLokasi, fixture.nomor, fixture.checklist[0]!)).toBeNull();
    // Admin Platform sees the order as it sees every order in the staff area.
    expect(await setup.pemesanan.orderUntukStaf(fixture.admin, fixture.nomor)).toMatchObject({ nomor: fixture.nomor });
    // Only its own Lokasi's open orders are on its work list.
    expect((await setup.pemesanan.orderUntukStafTerbaru(fixture.adminLokasi, fixture.lokasiMitra.id)).map((one) => one.nomor)).toEqual([
      fixture.nomor,
    ]);
    expect(await setup.pemesanan.orderUntukStafTerbaru(lain.adminLokasi, fixture.lokasiMitra.id)).toEqual([]);
  });
});
