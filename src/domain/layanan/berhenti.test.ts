import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { layananOnTestDatabase, lokasiDenganLayanan, petakDenganHakPakai, pemesanLayanan, setLokasiMitraStatusForTest, siapkanOperatorLayanan } from "../../../tests/support/layanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const HARI_INI = wib("2026-10-01 10:00");

/** A paid Layanan order at a Lokasi Mitra, one Pekerjaan Layanan targeting the 20th. */
async function siap(bayar = true) {
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
  setup.clock.set(HARI_INI);
  if (bayar) {
    const dibayar = await setup.billing.recordPayment(order.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: HARI_INI });
    if (!dibayar.ok) throw new Error("payment refused");
  }
  const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
  const pekerjaan = dibaca?.item[0].pekerjaan;
  if (!pekerjaan) throw new Error("no job");
  return { setup, lokasi, pemesan, order, pekerjaanId: pekerjaan.id };
}

describe("a Pekerjaan Layanan still open when its Lokasi Mitra Berhenti takes effect", () => {
  it("is cancelled with a full refund of the Tagihan, the Biaya Layanan Platform included", async () => {
    const { setup, lokasi, pemesan, order } = await siap();

    expect(await setup.layanan.batalkanSisaBerhenti(lokasi.lokasiMitra.id)).toEqual({ dibatalkan: 1, tertunda: 0 });

    const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
    expect(dibaca?.item[0].pekerjaan).toMatchObject({ status: "dibatalkan" });
    expect(await setup.layanan.pengembalianTerbuka()).toMatchObject([
      {
        alasan: "berhenti",
        platformDikembalikan: true,
        total: 900_000,
        baris: [
          { label: "Layanan – Pembersihan Makam (Reguler)", amount: 750_000 },
          { label: "Biaya Layanan Platform", amount: 150_000 },
        ],
      },
    ]);
  });

  it("is run twice without cancelling or refunding twice", async () => {
    const { setup, lokasi } = await siap();
    await setup.layanan.batalkanSisaBerhenti(lokasi.lokasiMitra.id);

    expect(await setup.layanan.batalkanSisaBerhenti(lokasi.lokasiMitra.id)).toEqual({ dibatalkan: 0, tertunda: 0 });
    expect(await setup.layanan.pengembalianTerbuka()).toHaveLength(1);
  });

  it("is cancelled with no refund request when its Tagihan was never paid", async () => {
    const { setup, lokasi } = await siap(false);

    expect(await setup.layanan.batalkanSisaBerhenti(lokasi.lokasiMitra.id)).toEqual({ dibatalkan: 1, tertunda: 0 });
    expect(await setup.layanan.pengembalianTerbuka()).toEqual([]);
  });

  it("leaves another Lokasi Mitra's jobs alone", async () => {
    const { setup, lokasi, pemesan, order } = await siap();

    expect(await setup.layanan.batalkanSisaBerhenti("00000000-0000-4000-8000-000000000000")).toEqual({ dibatalkan: 0, tertunda: 0 });
    const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
    expect(dibaca?.item[0].pekerjaan).not.toMatchObject({ status: "dibatalkan" });
    expect(lokasi.lokasiMitra.id).toBeTruthy();
  });
});

describe("the Layanan a Ditangguhkan Lokasi Mitra offers", () => {
  it("are still listed with their prices, since Layanan carry on while only a new Hak Pakai is stopped", async () => {
    const setup = layananOnTestDatabase(db);
    await siapkanOperatorLayanan(setup);
    const lokasi = await lokasiDenganLayanan(setup, { amount: 750_000 });
    await setLokasiMitraStatusForTest(db, lokasi.lokasiMitra.id, "ditangguhkan");

    const penawaran = await setup.layanan.penawaranLokasi(lokasi.lokasiMitra.id, setup.clock.now());

    expect(penawaran).toHaveLength(1);
  });
});
