/**
 * A Pesanan Layanan whose pay-first Tagihan a Harga Khusus reissued under a new id (ticket 93): the order stored the id it
 * was first issued, so a cancellation must read what the family paid from the Tagihan in force, not the replaced one, or the
 * refund it is owed is never asked for.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { layananOnTestDatabase, lokasiDenganLayanan, petakDenganHakPakai, pemesanLayanan, siapkanOperatorLayanan } from "../../../tests/support/layanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("cancelling a job after a Harga Khusus reissued the order's Tagihan (ticket 93)", () => {
  it("asks for the refund of what the family paid on the replacement Tagihan", async () => {
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
      item: [{ layananVariantId: lokasi.varian.id, targetDate: "2026-10-20", teks: null }],
    });
    if (!order.ok) throw new Error(`order refused: ${order.reason}`);
    setup.clock.set(wib("2026-10-01 10:00"));
    const khusus = await setup.billing.tetapkanHargaKhusus(lokasi.admin, {
      tagihanId: order.tagihan.id,
      amount: 50_000,
      alasan: "Keringanan untuk keluarga",
      porsiMitra: 0,
      catatanPorsiMitra: "Ditanggung Operator",
    });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
    const dibayar = await setup.billing.recordPayment(khusus.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: wib("2026-10-01 10:00") });
    if (!dibayar.ok) throw new Error("payment refused");
    const kerja = (await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan))?.item[0].pekerjaan;
    if (!kerja) throw new Error("no job");
    // The order's own read names the Tagihan in force, not the id it first stored.
    expect((await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan))?.tagihan?.id).toBe(khusus.tagihan.id);
    setup.clock.set(wib("2026-10-19 08:00"));

    const hasil = await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId: kerja.id, alasan: "Rencana berubah." });

    expect(hasil.ok).toBe(true);
    expect(await setup.layanan.pengembalianTerbuka()).toMatchObject([{ alasan: "pemesan_batal", tagihanId: khusus.tagihan.id }]);
  });

  it("asks for each job's proportional share of what was paid, and two cancellations together never exceed it (ticket 95)", async () => {
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
        { layananVariantId: lokasi.varian.id, targetDate: "2026-10-20", teks: null },
        { layananVariantId: lokasi.varian.id, targetDate: "2026-10-20", teks: null },
      ],
    });
    if (!order.ok) throw new Error(`order refused: ${order.reason}`);
    setup.clock.set(wib("2026-10-01 10:00"));
    const khusus = await setup.billing.tetapkanHargaKhusus(lokasi.admin, {
      tagihanId: order.tagihan.id,
      amount: 100_000,
      alasan: "Keringanan untuk keluarga",
      porsiMitra: 0,
      catatanPorsiMitra: "Ditanggung Operator",
    });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
    const dibayar = await setup.billing.recordPayment(khusus.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: wib("2026-10-01 10:00") });
    if (!dibayar.ok) throw new Error("payment refused");
    const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
    setup.clock.set(wib("2026-10-19 08:00"));
    for (const item of dibaca?.item ?? []) {
      const id = item.pekerjaan?.id;
      if (!id) throw new Error("no job");
      expect((await setup.layanan.batalkanPekerjaan(pemesan, { pekerjaanId: id, alasan: "Rencana berubah." })).ok).toBe(true);
    }
    const terbuka = await setup.layanan.pengembalianTerbuka();
    const dikembalikan = terbuka.reduce((sum, satu) => sum + satu.total, 0);
    expect(dikembalikan).toBeGreaterThan(0);
    expect(dikembalikan).toBeLessThanOrEqual(khusus.tagihan.total);
    // Each job returns a share of its line, never the whole line, because the Harga Khusus lowered what was paid for it.
    expect(terbuka.flatMap((satu) => satu.baris.map((baris) => baris.amount)).every((jumlah) => jumlah < 750_000)).toBe(true);
  });
});
