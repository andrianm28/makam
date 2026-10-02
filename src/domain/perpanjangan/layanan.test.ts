/**
 * The optional "Tambah Layanan" step of a Perpanjangan at a Lokasi Mitra (spec, Perpanjangan; Billing > due rules; story 48 area;
 * ticket 53). The fake Clock sits at Kamis 1 Oktober 2026 09:00 WIB, so a Perpanjangan ordered now is due Minggu 4 Oktober 09:00.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { lapsePayFirstTagihanTick } from "@/domain/billing";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { tawarkanLayananDi } from "../../../tests/support/pemesanan";
import { akunDenganEmail, hakPakaiSiap, PEMEGANG_HAK, perpanjanganOnTestDatabase, type PerpanjanganSetup } from "../../../tests/support/perpanjangan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const QRIS = { kind: "penyedia_pembayaran", channel: "QRIS" } as const;

/** A Hak Pakai whose Lokasi offers a Pembersihan with a 3-day lead time, and its holder's Akun. */
async function siap(setup: PerpanjanganSetup) {
  const fixture = await hakPakaiSiap(setup);
  const { varian } = await tawarkanLayananDi(setup, fixture.lokasiMitra.id, { nama: "Pembersihan Makam", bisaHariH: false, adaDiPetakKosong: true, leadTimeDays: 3, amount: 400_000 });
  const pemohon = await akunDenganEmail(setup, PEMEGANG_HAK.email);
  return { ...fixture, varian, pemohon };
}

describe("Tambah Layanan at a Perpanjangan checkout", () => {
  it("puts the Layanan on the same Tagihan, which keeps the Perpanjangan due date (3x24 h) and its one Biaya Layanan Platform", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await siap(setup);

    const hasil = await setup.perpanjangan.ajukan({
      hakPakaiId: fixture.hakPakaiId,
      terms: 1,
      pemohon: fixture.pemohon,
      layanan: [{ layananVariantId: fixture.varian.id, targetDate: "2026-10-07" }],
    });

    if (!hasil.ok) throw new Error(`ajukan refused: ${hasil.reason}`);
    expect(hasil.perpanjangan.tagihan.dueAt).toEqual(wib("2026-10-04 09:00"));
    const [ringkas] = await setup.billing.cariTagihan(hasil.perpanjangan.tagihan.nomorTagihan);
    const tagihan = await setup.billing.tagihan(ringkas!.id);
    expect(tagihan).toMatchObject({ kind: "pay_first", dueAt: wib("2026-10-04 09:00") });
    expect(tagihan!.lines.filter((line) => line.kind === "layanan")).toMatchObject([{ amount: 400_000 }]);
    expect(tagihan!.lines.filter((line) => line.kind === "perpanjangan")).toHaveLength(1);
    expect(tagihan!.lines.filter((line) => line.kind === "biaya_layanan_platform")).toHaveLength(1);
  });

  it("refuses a target date less than the lead time after the due date, and issues nothing", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await siap(setup);
    const awal = { hakPakaiId: fixture.hakPakaiId, terms: 1, pemohon: fixture.pemohon };

    // Due 4 Oktober, lead time 3 days: 6 Oktober is too early, 7 Oktober is the first day allowed.
    expect(await setup.perpanjangan.ajukan({ ...awal, layanan: [{ layananVariantId: fixture.varian.id, targetDate: "2026-10-06" }] })).toEqual({ ok: false, reason: "lead_time_melewati" });
    // Nothing was issued, so no earlier Tagihan stands in the way of the next order.
    expect((await setup.perpanjangan.ajukan({ ...awal, layanan: [{ layananVariantId: fixture.varian.id, targetDate: "2026-10-07" }] })).ok).toBe(true);
  });

  it("schedules the Layanan jobs when the Perpanjangan Tagihan is paid, not before", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await siap(setup);
    const hasil = await setup.perpanjangan.ajukan({
      hakPakaiId: fixture.hakPakaiId,
      terms: 1,
      pemohon: fixture.pemohon,
      layanan: [{ layananVariantId: fixture.varian.id, targetDate: "2026-10-07" }],
    });
    if (!hasil.ok || !hasil.perpanjangan.layananNomor) throw new Error("ajukan refused");
    const nomor = hasil.perpanjangan.layananNomor;

    expect((await setup.layanan.pesananLayananOf(nomor, fixture.pemohon))?.item).toMatchObject([{ targetDate: "2026-10-07", pekerjaan: { status: "menunggu_pembayaran" } }]);
    const [tagihan] = await setup.billing.cariTagihan(hasil.perpanjangan.tagihan.nomorTagihan);
    expect((await setup.billing.recordPayment(tagihan!.id, { method: QRIS, reference: null })).ok).toBe(true);
    expect((await setup.layanan.pesananLayananOf(nomor, fixture.pemohon))?.item).toMatchObject([{ pekerjaan: { status: "dijadwalkan" } }]);
  });

  it("offers the Lokasi's Layanan for that grave, each with the first target date its lead time allows after the 3x24 h due date", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await siap(setup);

    const tawaran = await setup.perpanjangan.penawaranLayanan(fixture.hakPakaiId);

    if (!tawaran.ok) throw new Error("no offer");
    expect(tawaran.batasBayar).toEqual(wib("2026-10-04 09:00"));
    expect(tawaran.opsi).toMatchObject([{ layanan: { name: "Pembersihan Makam" }, tanggalPalingDini: "2026-10-07", varian: [{ harga: 400_000 }] }]);
  });
});

describe("the Layanan of a Perpanjangan whose Tagihan lapses", () => {
  it("has its Pekerjaan Layanan Dibatalkan once the Tagihan is Dibatalkan, and a second tick changes nothing", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await siap(setup);
    const hasil = await setup.perpanjangan.ajukan({
      hakPakaiId: fixture.hakPakaiId,
      terms: 1,
      pemohon: fixture.pemohon,
      layanan: [{ layananVariantId: fixture.varian.id, targetDate: "2026-10-07" }],
    });
    if (!hasil.ok || !hasil.perpanjangan.layananNomor) throw new Error("ajukan refused");
    const nomor = hasil.perpanjangan.layananNomor;

    setup.clock.set(wib("2026-10-04 10:00"));
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());
    expect(await setup.layanan.batalkanPekerjaanTagihanLapse(setup.clock.now())).toBe(1);
    expect((await setup.layanan.pesananLayananOf(nomor, fixture.pemohon))?.item).toMatchObject([{ pekerjaan: { status: "dibatalkan" } }]);
    expect(await setup.layanan.batalkanPekerjaanTagihanLapse(setup.clock.now())).toBe(0);
  });

  it("leaves the jobs of a Tagihan still open alone", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await siap(setup);
    const hasil = await setup.perpanjangan.ajukan({
      hakPakaiId: fixture.hakPakaiId,
      terms: 1,
      pemohon: fixture.pemohon,
      layanan: [{ layananVariantId: fixture.varian.id, targetDate: "2026-10-07" }],
    });
    if (!hasil.ok || !hasil.perpanjangan.layananNomor) throw new Error("ajukan refused");

    expect(await setup.layanan.batalkanPekerjaanTagihanLapse(setup.clock.now())).toBe(0);
    expect((await setup.layanan.pesananLayananOf(hasil.perpanjangan.layananNomor, fixture.pemohon))?.item).toMatchObject([{ pekerjaan: { status: "menunggu_pembayaran" } }]);
  });
});
