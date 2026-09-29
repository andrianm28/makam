import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { lapsePayFirstTagihanTick } from "@/domain/billing";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  layananOnTestDatabase,
  lokasiDenganLayanan,
  petakDenganHakPakai,
  pemesanLayanan,
  siapkanOperatorLayanan,
} from "../../../tests/support/layanan";
import { tandaiTerlambat } from "./pekerjaan";

/**
 * Cancelling a job, and what that costs (spec, Pekerjaan Layanan: "Cancel until H-1
 * or until it starts"; spec, Billing > Refunds: the Pemesan cancelling keeps the
 * Biaya Layanan Platform, a Terlambat cancellation gets it back).
 *
 * The refund is a **request**: the money leaves through Billing after an Admin
 * Platform approval, which is a later flow. What is asserted here is the rule this
 * module owns — which lines come back, and whether the platform fee is in them —
 * read through the module's own list of open requests.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const foto = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);
const HARI_INI = wib("2026-10-01 10:00");
/** The target date every order below is placed for: the 20th. */
const TARGET = "2026-10-20";

/** A paid order, so its Tagihan is Lunas and a cancellation has money to return. */
async function siap(options: Parameters<typeof lokasiDenganLayanan>[1] = {}) {
  const setup = layananOnTestDatabase(db);
  await siapkanOperatorLayanan(setup);
  const lokasi = await lokasiDenganLayanan(setup, { amount: 750_000, ...options });
  const petak = await petakDenganHakPakai(setup, lokasi);
  const { pemesan } = await pemesanLayanan(setup);
  const order = await setup.layanan.placePesananLayanan(pemesan, {
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    lokasiId: lokasi.lokasiMitra.id,
    petakId: petak.petakId,
    item: [{ layananVariantId: lokasi.varian.id, targetDate: TARGET, teks: null }],
  });
  if (!order.ok) throw new Error(`order refused: ${order.reason}`);
  setup.clock.set(HARI_INI);
  const dibayar = await setup.billing.recordPayment(order.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: HARI_INI });
  if (!dibayar.ok) throw new Error("payment refused");
  const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
  const kerja = dibaca?.item[0].pekerjaan;
  if (!kerja) throw new Error("no job");
  return { setup, lokasi, pemesan, order, pekerjaanId: kerja.id };
}

/** One captured proof, so a job can be finished. */
function bukti(pekerjaanId: string, kind: "foto_sebelum" | "foto_sesudah") {
  return { pekerjaanId, kind, takenAt: wib("2026-10-20 10:00"), file: { body: foto(), contentType: "image/jpeg" } };
}

describe("the Pemesan cancels a job of their own accord", () => {
  it("is allowed through H-1, and the item comes back with the platform fee kept", async () => {
    const { setup, pemesan, pekerjaanId } = await siap();
    // The 19th is H-1: the last day it may be cancelled.
    setup.clock.set(wib("2026-10-19 08:00"));
    const hasil = await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId, alasan: "Rencana berubah." });
    expect(hasil.ok).toBe(true);
    if (!hasil.ok) throw new Error("refused");

    expect(hasil.pengembalian).toMatchObject({
      total: 750_000,
      platformDikembalikan: false,
      baris: [{ label: "Layanan – Pembersihan Makam (Reguler)", amount: 750_000 }],
    });
    // The request is on the list the Billing refund flow works through, naming the
    // Tagihan and the line it quotes.
    expect(await setup.layanan.pengembalianTerbuka()).toMatchObject([{ alasan: "pemesan_batal", tagihanId: expect.any(String), total: 750_000 }]);
  });

  it("is refused on the target date itself, and once the work has started", async () => {
    const { setup, lokasi, pemesan, pekerjaanId } = await siap();
    // H-1 has passed: the day before was the last day.
    setup.clock.set(wib("2026-10-20 07:00"));
    expect(await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId, alasan: "Berubah." })).toEqual({ ok: false, reason: "sudah_dikerjakan" });

    // The same holds for a job that has been picked up, whatever the date.
    setup.clock.set(wib("2026-10-19 08:00"));
    await setup.layanan.mulaiPekerjaan(lokasi.adminLokasi, { pekerjaanId });
    expect(await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId, alasan: "Berubah." })).toEqual({ ok: false, reason: "sudah_dikerjakan" });
  });

  it("is refused to anybody but the Pemesan who placed the order, without saying the job exists", async () => {
    const { setup, pemesan, pekerjaanId } = await siap();
    const lain = await pemesanLayanan(setup, "saudara@contoh.id");
    setup.clock.set(wib("2026-10-19 08:00"));
    // "Not found", not "not yours": a refusal that named the job would tell a stranger
    // that somebody is being cared for at a known plot.
    expect(await setup.layanan.batalkanPekerjaan(lain.pemesan, { pekerjaanId, alasan: "Bukan Pesanan saya." })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
    // Nobody was refused twice over: the order's own Pemesan may still cancel it.
    expect((await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId, alasan: "Berubah." })).ok).toBe(true);
  });

  it("is refused twice: one request, one refund", async () => {
    const { setup, pemesan, pekerjaanId } = await siap();
    setup.clock.set(wib("2026-10-19 08:00"));
    await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId, alasan: "Berubah." });
    expect(await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId, alasan: "Berubah lagi." })).toEqual({ ok: false, reason: "sudah_dibatalkan" });
    expect(await setup.layanan.pengembalianTerbuka()).toHaveLength(1);
  });
});

describe("a job cancelled for the lateness", () => {
  it("gives back the whole Tagihan, the platform fee included", async () => {
    const { setup, pemesan, pekerjaanId } = await siap();
    setup.clock.set(wib("2026-10-22 09:00"));
    expect(await tandaiTerlambat(setup.db, setup.clock.now())).toBe(1);

    const hasil = await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId, alasan: "Terlambat, tidak jadi." });
    if (!hasil.ok) throw new Error("refused");
    // The fulfiller's failure is not the family's bill: item and platform fee both.
    expect(hasil.pengembalian).toMatchObject({
      total: 900_000,
      platformDikembalikan: true,
      baris: [
        { label: "Layanan – Pembersihan Makam (Reguler)", amount: 750_000 },
        { label: "Biaya Layanan Platform", amount: 150_000 },
      ],
    });
    expect(await setup.layanan.pengembalianTerbuka()).toMatchObject([{ alasan: "terlambat_batal", platformDikembalikan: true, total: 900_000 }]);
  });

  it("is still refused once the Lokasi has finished it, however late it was", async () => {
    const { setup, lokasi, pemesan, pekerjaanId } = await siap();
    setup.clock.set(wib("2026-10-22 09:00"));
    await tandaiTerlambat(setup.db, setup.clock.now());
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(pekerjaanId, "foto_sebelum"));
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(pekerjaanId, "foto_sesudah"));
    expect((await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId })).ok).toBe(true);

    expect(await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId, alasan: "Terlambat." })).toEqual({ ok: false, reason: "sudah_selesai" });
    expect(await setup.layanan.pengembalianTerbuka()).toEqual([]);
  });
});

describe("a job whose Tagihan was never paid", () => {
  it("is not cancellable: the family withdraws by not paying, and the Tagihan lapses", async () => {
    const setup = layananOnTestDatabase(db);
    await siapkanOperatorLayanan(setup);
    const lokasi = await lokasiDenganLayanan(setup, { amount: 750_000 });
    const petak = await petakDenganHakPakai(setup, lokasi);
    const { pemesan } = await pemesanLayanan(setup, "belum.bayar@contoh.id");
    const order = await setup.layanan.placePesananLayanan(pemesan, {
      pemesanName: "Budi Santoso",
      phoneNumber: "081234567890",
      lokasiId: lokasi.lokasiMitra.id,
      petakId: petak.petakId,
      item: [{ layananVariantId: lokasi.varian.id, targetDate: TARGET, teks: null }],
    });
    if (!order.ok) throw new Error("order refused");
    const kerja = (await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan))?.item[0].pekerjaan;
    if (!kerja) throw new Error("no job");

    // A job still Menunggu Pembayaran is never cancelled: the Tagihan is already
    // issued, so cancelling would let the family pay for a job that no longer
    // exists. Not paying is the withdrawal, and the pay-first Tagihan lapses.
    setup.clock.set(wib("2026-10-19 08:00"));
    expect(await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId: kerja.id, alasan: "Berubah pikiran." })).toEqual({
      ok: false,
      reason: "sudah_dikerjakan",
    });
    expect(await setup.layanan.pengembalianTerbuka()).toEqual([]);

    setup.clock.set(wib("2026-10-03 10:00"));
    await lapsePayFirstTagihanTick({ db: setup.db }, setup.clock.now());
    const tagihan = await setup.billing.tagihan(order.tagihan.id);
    expect(tagihan).toMatchObject({ status: "dibatalkan", cancelledReason: "batas_pembayaran_lewat" });
  });
});

