import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  layananOnTestDatabase,
  lokasiDenganLayanan,
  petakDenganHakPakai,
  pemesanLayanan,
  siapkanOperatorLayanan,
} from "../../../tests/support/layanan";
import { adminPlatformOf } from "../../../tests/support/identity";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { tandaiTerlambat } from "./pekerjaan";

/**
 * The Antrean rows a job appears in (spec, Work Queues: the Admin Lokasi's
 * "Layanan due today" is Mendesak and "upcoming / Terlambat" is Lainnya; the Admin
 * Platform's Tier 2 row is "Layanan Terlambat"). The rows are projections of the
 * Layanan module's own reads, so this reads them back through the Antrean's public
 * interface over the same database and never through a table.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** An order at a Terverifikasi Lokasi, paid and therefore scheduled, targeted at `targetDate`. */
async function orderYangDibayar(targetDate: string) {
  const setup = layananOnTestDatabase(db);
  await siapkanOperatorLayanan(setup);
  const lokasi = await lokasiDenganLayanan(setup, { leadTimeDays: 0 });
  const petak = await petakDenganHakPakai(setup, lokasi);
  const { pemesan } = await pemesanLayanan(setup);
  const order = await setup.layanan.placePesananLayanan(pemesan, {
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    lokasiId: lokasi.lokasiMitra.id,
    petakId: petak.petakId,
    item: [{ layananVariantId: lokasi.varian.id, targetDate, teks: null }],
  });
  if (!order.ok) throw new Error(`order refused: ${order.reason}`);
  setup.clock.set(wib("2026-10-01 10:00"));
  const dibayar = await setup.billing.recordPayment(order.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: wib("2026-10-01 10:00") });
  if (!dibayar.ok) throw new Error("payment refused");
  return { setup, lokasi, pemesan, order };
}

describe("the Antrean Lokasi's Layanan rows", () => {
  it("put a job due today in Mendesak", async () => {
    const { lokasi } = await orderYangDibayar("2026-10-01");
    const { queues } = queuesOnTestDatabase(db);
    const antrean = await queues.antreanLokasi(lokasi.adminLokasi, lokasi.lokasiMitra.id);
    const row = antrean.mendesak.find((satu) => satu.type === "layanan_hari_ini");
    expect(row).toMatchObject({ label: "Layanan hari ini", subjectKind: "pekerjaan_layanan" });
    expect(row?.href).toContain(`/staf/admin-lokasi/${lokasi.lokasiMitra.id}/pekerjaan/`);
    // It is urgent, not merely listed: the Mendesak group is the one an Admin Lokasi
    // works down first.
    expect(antrean.lainnya.map((satu) => satu.type)).not.toContain("layanan_hari_ini");
  });

  it("put a job further ahead in Lainnya, as one that is still to come", async () => {
    const { lokasi } = await orderYangDibayar("2026-10-20");
    const { queues } = queuesOnTestDatabase(db);
    const antrean = await queues.antreanLokasi(lokasi.adminLokasi, lokasi.lokasiMitra.id);
    expect(antrean.lainnya.map((satu) => satu.type)).toContain("layanan_akan_datang");
    expect(antrean.mendesak.map((satu) => satu.type)).not.toContain("layanan_hari_ini");
  });

  it("put a late job in Lainnya as Terlambat, and on the Admin Platform's Tier 2 row", async () => {
    const { setup, lokasi, order } = await orderYangDibayar("2026-10-01");
    setup.clock.set(wib("2026-10-03 09:00"));
    expect(await tandaiTerlambat(setup.db, setup.clock.now())).toBe(1);

    // The Antrean is composed over the same database with its own Clock, which is
    // what decides whether a row shows as past its deadline.
    const komposisi = queuesOnTestDatabase(db);
    komposisi.clock.set(wib("2026-10-03 09:00"));
    const antrean = await komposisi.queues.antreanLokasi(lokasi.adminLokasi, lokasi.lokasiMitra.id);
    // The Admin Lokasi is told which plot and which Layanan, which is what they walk to.
    expect(antrean.lainnya.find((satu) => satu.type === "layanan_terlambat")).toMatchObject({
      label: "Layanan terlambat",
      pastDeadline: true,
      subjectLabel: "Layanan – Pembersihan Makam (Reguler) · Petak A-01",
    });

    // The Operator sees it too, on its Tier 2 row, so a family that has paid is not
    // waiting on one Lokasi alone. There the Nomor Pesanan is what identifies it.
    const platform = await komposisi.queues.antrean((await adminPlatformOf(setup)).actor);
    expect(platform.filter((satu) => satu.type === "layanan_terlambat_platform")).toMatchObject([
      { tier: 2, pastDeadline: true, subjectLabel: expect.stringContaining(order.pesanan.nomor) },
    ]);
  });

  it("close themselves once the job is finished", async () => {
    const { setup, lokasi, pemesan, order } = await orderYangDibayar("2026-10-01");
    const kerja = (await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan))?.item[0].pekerjaan;
    if (!kerja) throw new Error("no job");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);
    for (const kind of ["foto_sebelum", "foto_sesudah"] as const) {
      await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, {
        pekerjaanId: kerja.id,
        kind,
        takenAt: wib("2026-10-01 10:00"),
        file: { body: jpeg, contentType: "image/jpeg" },
      });
    }
    expect((await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id })).ok).toBe(true);

    const { queues } = queuesOnTestDatabase(db);
    const antrean = await queues.antreanLokasi(lokasi.adminLokasi, lokasi.lokasiMitra.id);
    expect([...antrean.mendesak, ...antrean.lainnya].map((satu) => satu.type)).not.toContain("layanan_hari_ini");
  });
});


