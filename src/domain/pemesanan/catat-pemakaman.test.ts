/**
 * The Admin Lokasi records the Pemakaman of a confirmed Saat Duka order (spec,
 * Inventory > Pemakaman and Pemesanan > Saat Duka: "Diajukan → Dikonfirmasi →
 * Dimakamkan → Selesai"; ticket 25's AC 2). The Hak Pakai's tenure clock starts
 * at the **first** Pemakaman and its end date is that burial plus the Jenis
 * Makam's term, so a burial entered days after it happened still prices the
 * right from the day it did.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A confirmed order: placed, its first cleared Petak assigned, its pay-after Tagihan issued. */
async function pesananDikonfirmasi(setup: PemesananSetup, pemakamanAt = "2026-10-02T10:00") {
  const fixture = await saatDukaFixture(setup);
  await siapkanOperatorPemesanan(setup);
  const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");
  const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
    nomor: placed.pemesanan.nomor,
    petakId: cells[0]!.id,
    pemakamanAt,
  });
  if (!hasil.ok) throw new Error(`confirmation refused: ${hasil.reason}`);
  return { ...fixture, nomor: placed.pemesanan.nomor, petakId: cells[0]!.id, hakPakaiId: hasil.pesanan.hakPakaiId };
}

/** The Hak Pakai the confirmation granted, as the Lokasi's own staff read it. */
function hakPakai(setup: PemesananSetup, fixture: Awaited<ReturnType<typeof pesananDikonfirmasi>>, by = fixture.adminLokasi) {
  return setup.inventory.asStaff(by).hakPakaiOfPetak(fixture.lokasiMitra.id, fixture.petakId);
}

describe("the Admin Lokasi records the Pemakaman", () => {
  it("makes the order Dimakamkan and starts the fixed-term Hak Pakai at the recorded date, its end date that burial plus the tenure", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    // The burial was agreed for 2 October; it actually happened on the 6th.
    setup.clock.set(new Date("2026-10-06T08:00:00+07:00"));

    const hasil = await setup.pemesanan.catatPemakaman(fixture.adminLokasi, {
      nomor: fixture.nomor,
      tanggal: "2026-10-06",
      layer: 2,
    });

    expect(hasil).toMatchObject({
      ok: true,
      pesanan: { nomor: fixture.nomor, status: "dimakamkan", petakNomor: "A-01" },
      pemakaman: { tanggal: "2026-10-06", layer: 2 },
      hakPakai: { masa: { mulai: "2026-10-06", selesai: "2031-10-06" } },
    });

    // The order's own timeline says Dimakamkan, and the family reads it there.
    expect(await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan)).toMatchObject({ status: "dimakamkan" });

    // The Hak Pakai's clock runs from the burial that was recorded, not from today.
    expect(await hakPakai(setup, fixture)).toMatchObject({
      tenureStartAt: new Date("2026-10-06T00:00:00.000Z"),
      endDate: new Date("2031-10-06T00:00:00.000Z"),
      pemakaman: [{ almarhumName: "Siti Aminah", date: "2026-10-06", layer: 2 }],
    });
  });

  it("records the first Pemakaman once: a second attempt is refused and moves neither the clock nor the order", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    setup.clock.set(new Date("2026-10-06T08:00:00+07:00"));
    await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-06" });

    // A later, equally valid day would be refused too: the first burial is the one that counts.
    const kedua = await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-07" });
    expect(kedua).toEqual({ ok: false, reason: "pemakaman_sudah_dicatat" });

    const hak = await hakPakai(setup, fixture);
    expect(hak?.tenureStartAt).toEqual(new Date("2026-10-06T00:00:00.000Z"));
    expect(hak?.endDate).toEqual(new Date("2031-10-06T00:00:00.000Z"));
    expect(hak?.pemakaman).toHaveLength(1);
    expect((await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan))?.status).toBe("dimakamkan");
  });

  it("refuses Admin Platform, another Lokasi's Admin Lokasi, an unknown order and a date the Clock has not reached", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);

    // Admin Platform does the recording for the Lokasi only by asking it to.
    expect(await setup.pemesanan.catatPemakaman(fixture.admin, { nomor: fixture.nomor, tanggal: "2026-10-06" })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: "MKM-2026-999999", tanggal: "2026-10-06" })).toEqual({
      ok: false,
      reason: "pesanan_tidak_ditemukan",
    });
    // A burial cannot be recorded for a day that has not come.
    expect(await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-06" })).toEqual({
      ok: false,
      reason: "tanggal_pemakaman_tidak_valid",
    });

    expect((await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan))?.status).toBe("dikonfirmasi");
  });
});

describe("Catat Pemakaman after a Harga Khusus reissued the Tagihan (ticket 93)", () => {
  it("a family that paid the replacement Tagihan before the burial gets its Bukti Pemesanan: the order is Selesai at once", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    const order = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    const khusus = await setup.billing.tetapkanHargaKhusus(fixture.admin, {
      tagihanId: order!.tagihanId!,
      amount: 100_000,
      alasan: "Keringanan untuk keluarga",
      porsiMitra: 0,
      catatanPorsiMitra: "Ditanggung Operator",
    });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
    const dibayar = await setup.billing.recordPayment(khusus.tagihan.id, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    expect(dibayar.ok).toBe(true);
    setup.clock.set(new Date("2026-10-06T08:00:00+07:00"));

    const hasil = await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-06" });

    expect(hasil).toMatchObject({ ok: true, pesanan: { nomor: fixture.nomor, status: "selesai" } });
    expect((await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan))?.status).toBe("selesai");
  });

  it("leaves the order Dimakamkan, not Selesai, while the replacement Tagihan is unpaid (only the replaced one is Dibatalkan)", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    const order = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    const khusus = await setup.billing.tetapkanHargaKhusus(fixture.admin, {
      tagihanId: order!.tagihanId!,
      amount: 100_000,
      alasan: "Keringanan untuk keluarga",
      porsiMitra: 0,
      catatanPorsiMitra: "Ditanggung Operator",
    });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
    setup.clock.set(new Date("2026-10-06T08:00:00+07:00"));

    const hasil = await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-06" });

    expect(hasil).toMatchObject({ ok: true, pesanan: { nomor: fixture.nomor, status: "dimakamkan" } });
    expect(await setup.billing.tagihan(order!.tagihanId!)).toMatchObject({ status: "dibatalkan", cancelledReason: "diganti" });
    expect((await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan))?.status).toBe("dimakamkan");
  });
});
