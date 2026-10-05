import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/domain/identity";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { layananOnTestDatabase, lokasiDenganLayanan, petakDenganHakPakai, pemesanLayanan, setLokasiMitraStatusForTest, siapkanOperatorLayanan } from "../../../tests/support/layanan";
import { tandaiTerlambat } from "./pekerjaan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const HARI_INI = wib("2026-10-01 10:00");

const foto = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);
const rekening = { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Budi Santoso" };

/** A Layanan order at a Lokasi Mitra, paid unless `bayar` is false, with `jumlahItem` Pekerjaan Layanan (one unless told) targeting the 20th. */
async function siap(options: { bayar?: boolean; jumlahItem?: number } = {}) {
  const { bayar = true, jumlahItem = 1 } = options;
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
    item: Array.from({ length: jumlahItem }, () => ({ layananVariantId: lokasi.varian.id, targetDate: "2026-10-20", teks: null })),
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

/** Admin Platform approves the one open request, enters the account and transfers it: the Bukti Pengembalian Dana. */
async function transferkan(setup: Awaited<ReturnType<typeof siap>>["setup"], admin: Actor, permintaanId: string) {
  expect((await setup.refunds.setujuiPengembalian(admin, { permintaanId })).ok).toBe(true);
  await setup.refunds.isiRekeningAdmin(admin, { permintaanId, rekening, alasan: "Diminta lewat telepon" });
  const terbit = await setup.refunds.terbitkanBuktiPengembalianDana(admin, { permintaanId, ditransferPada: "2026-10-01", bukti: { body: foto(), contentType: "image/jpeg" } });
  if (!terbit.ok) throw new Error(`transfer refused: ${terbit.reason}`);
  return terbit.bukti;
}

/** One captured proof, so a job can be finished. */
const bukti = (pekerjaanId: string, kind: "foto_sebelum" | "foto_sesudah") => ({ pekerjaanId, kind, takenAt: wib("2026-10-20 10:00"), file: { body: foto(), contentType: "image/jpeg" as const } });

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
    const { setup, lokasi } = await siap({ bayar: false });

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

describe("the refund of the Layanan a Lokasi Mitra's Berhenti cancels", () => {
  it("is recorded penuh when it returns the whole Tagihan, and its transfer leaves the Tagihan Dikembalikan Penuh", async () => {
    const { setup, lokasi, order } = await siap();
    await setup.layanan.batalkanSisaBerhenti(lokasi.lokasiMitra.id);

    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({
      nomorPemesanan: order.pesanan.nomor,
      pihakBersalah: "lokasi",
      biayaLayananPlatformDikembalikan: true,
      jumlah: 900_000,
      penuh: true,
    });

    await transferkan(setup, lokasi.admin, permintaan.id);
    expect(await setup.billing.tagihan(order.tagihan.id)).toMatchObject({ status: "dikembalikan_penuh" });
  });

  it("is one request for an order's two jobs, penuh once the second completes the Tagihan, and the platform fee is returned once", async () => {
    const { setup, lokasi, order } = await siap({ jumlahItem: 2 });
    await setup.layanan.batalkanSisaBerhenti(lokasi.lokasiMitra.id);

    const permintaan = await setup.refunds.permintaanTerbuka();
    expect(permintaan).toHaveLength(1);
    expect(permintaan[0]).toMatchObject({ jumlah: 750_000 * 2 + 150_000, penuh: true, biayaLayananPlatformDikembalikan: true });
    expect(permintaan[0]!.lines.filter((baris) => baris.label === "Biaya Layanan Platform")).toHaveLength(1);

    await transferkan(setup, lokasi.admin, permintaan[0]!.id);
    expect(await setup.billing.tagihan(order.tagihan.id)).toMatchObject({ status: "dikembalikan_penuh" });
  });

  it("is not penuh when a job already Selesai keeps its price: only the rest of the Tagihan comes back, and it is Dikembalikan Sebagian", async () => {
    const { setup, lokasi, order, pekerjaanId: selesai } = await siap({ jumlahItem: 2 });
    setup.clock.set(wib("2026-10-22 09:00"));
    await tandaiTerlambat(setup.db, setup.clock.now());
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(selesai, "foto_sebelum"));
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(selesai, "foto_sesudah"));
    expect((await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: selesai })).ok).toBe(true);

    expect(await setup.layanan.batalkanSisaBerhenti(lokasi.lokasiMitra.id)).toEqual({ dibatalkan: 1, tertunda: 0 });

    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ jumlah: 750_000 + 150_000, penuh: false, biayaLayananPlatformDikembalikan: true });
    await transferkan(setup, lokasi.admin, permintaan.id);
    expect(await setup.billing.tagihan(order.tagihan.id)).toMatchObject({ status: "dikembalikan_sebagian" });
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
