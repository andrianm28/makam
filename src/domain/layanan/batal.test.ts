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
async function siap(options: Parameters<typeof lokasiDenganLayanan>[1] & { hargaKhusus?: number } = {}) {
  const { hargaKhusus, ...opsiLokasi } = options;
  const setup = layananOnTestDatabase(db);
  await siapkanOperatorLayanan(setup);
  const lokasi = await lokasiDenganLayanan(setup, { amount: 750_000, ...opsiLokasi });
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
  let tagihanDibayar = order.tagihan.id;
  if (hargaKhusus) {
    const khusus = await setup.billing.tetapkanHargaKhusus(lokasi.admin, {
      tagihanId: order.tagihan.id,
      amount: hargaKhusus,
      alasan: "Keringanan untuk keluarga",
      porsiMitra: 0,
      catatanPorsiMitra: "Ditanggung Operator",
    });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
    tagihanDibayar = khusus.tagihan.id;
  }
  const dibayar = await setup.billing.recordPayment(tagihanDibayar, { method: { kind: "transfer_manual" }, reference: null, paidAt: HARI_INI });
  if (!dibayar.ok) throw new Error("payment refused");
  const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
  const kerja = dibaca?.item[0].pekerjaan;
  if (!kerja) throw new Error("no job");
  return { setup, lokasi, pemesan, order, pekerjaanId: kerja.id, tagihanDibayar };
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


describe("the refund a cancellation asks of the Refunds module", () => {
  const rekening = { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Budi Santoso" };

  /** An order of two Layanan, paid, so each of its two jobs can be cancelled on its own. */
  async function pesananDuaItem({ hargaKhusus = 0 }: { hargaKhusus?: number } = {}) {
    const setup = layananOnTestDatabase(db);
    await siapkanOperatorLayanan(setup);
    const lokasi = await lokasiDenganLayanan(setup, { amount: 750_000 });
    const petak = await petakDenganHakPakai(setup, lokasi);
    const { pemesan } = await pemesanLayanan(setup);
    const order = await setup.layanan.placePesananLayanan(pemesan, {
      pemesanName: "Budi Santoso",
      phoneNumber: "081234567890",
      lokasiId: lokasi.lokasiMitra.id,
      petakId: petak.petakId,
      item: [
        { layananVariantId: lokasi.varian.id, targetDate: TARGET, teks: null },
        { layananVariantId: lokasi.varian.id, targetDate: TARGET, teks: null },
      ],
    });
    if (!order.ok) throw new Error(`order refused: ${order.reason}`);
    setup.clock.set(HARI_INI);
    let tagihanDibayar = order.tagihan.id;
    if (hargaKhusus) {
      const khusus = await setup.billing.tetapkanHargaKhusus(lokasi.admin, {
        tagihanId: order.tagihan.id,
        amount: hargaKhusus,
        alasan: "Keringanan untuk keluarga",
        porsiMitra: 0,
        catatanPorsiMitra: "Ditanggung Operator",
      });
      if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
      tagihanDibayar = khusus.tagihan.id;
    }
    await setup.billing.recordPayment(tagihanDibayar, { method: { kind: "transfer_manual" }, reference: null, paidAt: HARI_INI });
    const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
    const [satu, dua] = dibaca?.item.map((item) => item.pekerjaan?.id) ?? [];
    if (!satu || !dua) throw new Error("no jobs");
    return { setup, lokasi, pemesan, satu, dua, tagihanDibayar };
  }

  it("becomes a request Admin Platform approves and transfers into a Bukti Pengembalian Dana, the platform fee kept", async () => {
    const { setup, lokasi, pemesan, pekerjaanId, order } = await siap();
    setup.clock.set(wib("2026-10-19 08:00"));
    const hasil = await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId, alasan: "Rencana berubah." });
    if (!hasil.ok) throw new Error("refused");

    // The request is in the Refunds module, naming the Tagihan and the one line refunded.
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({
      tagihanId: order.tagihan.id,
      penuh: false,
      pihakBersalah: "pemesan",
      biayaLayananPlatformDikembalikan: false,
      jumlah: 750_000,
      status: "diajukan",
    });
    expect(permintaan.lines).toEqual([{ label: "Layanan – Pembersihan Makam (Reguler)", amount: 750_000, lokasiId: lokasi.lokasiMitra.id }]);

    expect((await setup.refunds.setujuiPengembalian(lokasi.admin, { permintaanId: permintaan.id })).ok).toBe(true);
    await setup.refunds.isiRekeningAdmin(lokasi.admin, { permintaanId: permintaan.id, rekening, alasan: "Diminta lewat telepon" });
    const terbit = await setup.refunds.terbitkanBuktiPengembalianDana(lokasi.admin, {
      permintaanId: permintaan.id,
      ditransferPada: "2026-10-19",
      bukti: { body: foto(), contentType: "image/jpeg" },
    });
    if (!terbit.ok) throw new Error(`transfer refused: ${terbit.reason}`);
    expect(terbit.bukti.amount).toBe(750_000);
    expect(await setup.billing.tagihan(order.tagihan.id)).toMatchObject({ status: "dikembalikan_sebagian" });
  });

  it("returns the platform fee too when cancelled for lateness: the whole Tagihan", async () => {
    const { setup, pemesan, pekerjaanId } = await siap();
    setup.clock.set(wib("2026-10-22 09:00"));
    await tandaiTerlambat(setup.db, setup.clock.now());
    const hasil = await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId, alasan: "Terlambat, tidak jadi." });
    if (!hasil.ok) throw new Error("refused");

    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ pihakBersalah: "lokasi", biayaLayananPlatformDikembalikan: true, jumlah: 900_000 });
  });

  it("joins the open request when a second job of the same order is cancelled: one transfer for the order", async () => {
    const { setup, pemesan, satu, dua } = await pesananDuaItem();

    setup.clock.set(wib("2026-10-19 08:00"));
    expect((await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId: satu, alasan: "Satu saja." })).ok).toBe(true);
    // The second cancellation joins the same open request: one transfer for the order.
    expect((await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId: dua, alasan: "Dua juga." })).ok).toBe(true);
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect(permintaan.jumlah).toBe(1_500_000);
  });

  it("returns the job line's own share of a Harga Khusus Tagihan, and the platform fee's own share when it comes back (ticket 95)", async () => {
    const { setup, pemesan, pekerjaanId } = await siap({ hargaKhusus: 50_000 });
    setup.clock.set(wib("2026-10-22 09:00"));
    await tandaiTerlambat(setup.db, setup.clock.now());

    const hasil = await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId, alasan: "Terlambat, tidak jadi." });
    if (!hasil.ok) throw new Error("refused");
    expect(hasil.pengembalian).toMatchObject({
      total: 840_000,
      platformDikembalikan: true,
      baris: [
        { label: "Layanan – Pembersihan Makam (Reguler)", amount: 700_000 },
        { label: "Biaya Layanan Platform", amount: 140_000 },
      ],
    });
    expect(hasil.pengembalian!.total).toBeLessThanOrEqual((await setup.billing.tagihan(hasil.pengembalian!.tagihanId))!.total);
  });

  it("never refunds more than a Harga Khusus Tagihan was paid, across two refunds and their apportioned fee (ticket 95)", async () => {
    const { setup, pemesan, satu, dua, tagihanDibayar } = await pesananDuaItem({ hargaKhusus: 50_000 });
    const tagihan = await setup.billing.tagihan(tagihanDibayar);
    if (!tagihan) throw new Error("no Tagihan");
    setup.clock.set(wib("2026-10-22 09:00"));
    await tandaiTerlambat(setup.db, setup.clock.now());

    expect((await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId: satu, alasan: "Terlambat." })).ok).toBe(true);
    expect((await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId: dua, alasan: "Terlambat juga." })).ok).toBe(true);
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    // Each line's share of the reduced total, rounded down; the fee's share is added once.
    expect(permintaan.jumlah).toBe(725_000 + 145_000 + 725_000);
    expect(permintaan.jumlah).toBeLessThanOrEqual(tagihan.total);
  });
  it("still refunds a paid line when the Harga Khusus is larger than the tariff, never refusing it (ticket 95)", async () => {
    // Rp 750.000 + Rp 150.000 fee, reduced by Rp 800.000: the family really paid Rp 100.000, less than the tariff alone.
    const { setup, pemesan, pekerjaanId } = await siap({ hargaKhusus: 800_000 });
    setup.clock.set(wib("2026-10-22 09:00"));
    await tandaiTerlambat(setup.db, setup.clock.now());

    const hasil = await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId, alasan: "Terlambat, tidak jadi." });
    if (!hasil.ok) throw new Error("refused");
    const tagihan = await setup.billing.tagihan(hasil.pengembalian!.tagihanId);
    if (!tagihan) throw new Error("no Tagihan");
    // Each paid line's share of the Rp 100.000 that was really paid, never refused and never more than it.
    expect(hasil.pengembalian!.baris).toEqual([
      expect.objectContaining({ label: "Layanan – Pembersihan Makam (Reguler)", amount: 83_333 }),
      expect.objectContaining({ label: "Biaya Layanan Platform", amount: 16_666 }),
    ]);
    expect(hasil.pengembalian!.total).toBe(99_999);
    expect(hasil.pengembalian!.total).toBeLessThanOrEqual(tagihan.total);
  });

  it("rounds each line's share down, so the refund never passes the reduced total (ticket 95)", async () => {
    const { setup, pemesan, satu, dua, tagihanDibayar } = await pesananDuaItem({ hargaKhusus: 50_001 });
    const tagihan = await setup.billing.tagihan(tagihanDibayar);
    if (!tagihan) throw new Error("no Tagihan");
    setup.clock.set(wib("2026-10-22 09:00"));
    await tandaiTerlambat(setup.db, setup.clock.now());

    expect((await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId: satu, alasan: "Terlambat." })).ok).toBe(true);
    expect((await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId: dua, alasan: "Terlambat juga." })).ok).toBe(true);
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    // floor(750.000 × 1.449.999 / 1.500.000) = 724.999,5 → 724.999 each; the fee's share floors the same way.
    expect(permintaan.jumlah).toBe(724_999 + 144_999 + 724_999);
    expect(permintaan.jumlah).toBeLessThanOrEqual(tagihan.total);
  });

  it("is refused, and the job left as it was, while an approved refund is still open on the Tagihan", async () => {
    const { setup, lokasi, pemesan, satu, dua } = await pesananDuaItem();
    setup.clock.set(wib("2026-10-19 08:00"));
    expect((await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId: satu, alasan: "Satu saja." })).ok).toBe(true);
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    await setup.refunds.setujuiPengembalian(lokasi.admin, { permintaanId: permintaan.id });

    expect(await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId: dua, alasan: "Dua juga." })).toEqual({ ok: false, reason: "pengembalian_tertunda" });
    // Nothing was cancelled and nothing was asked: the family can cancel it again after the transfer.
    expect(await setup.layanan.pengembalianTerbuka()).toHaveLength(1);
    expect((await setup.refunds.permintaanTerbuka())[0].jumlah).toBe(750_000);
  });
});
