import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { scheduledTicks } from "@/domain/scheduler";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  layananOnTestDatabase,
  lokasiDenganLayanan,
  newLayananFor,
  petakDenganHakPakai,
  pemesanLayanan,
  siapkanOperatorLayanan,
  type LayananSetup,
} from "../../../tests/support/layanan";
import type { Frekuensi } from "@/domain/layanan";

/**
 * A Paket Layanan's recurring cycles (spec, Layanan > Recurring cycles; ticket 54,
 * slice 1). Every assertion goes through the module's public interface: the
 * subscription, the cycle the tick issues, the Tagihan Billing issued, and the
 * jobs the payment schedules. Nothing reads a table.
 *
 * The fake Clock sits at Thursday 1 Oktober 2026 09:00 WIB, so "today" is that
 * day, and the first cycle below is dated 20 November 2026: its H-7 is the 13th.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A Lokasi offering two Layanan, a grave, a Paket of both and a family subscribed to it. */
async function siap(frekuensi: Frekuensi = "bulanan") {
  const setup = layananOnTestDatabase(db);
  const admin = await siapkanOperatorLayanan(setup);
  const lokasi = await lokasiDenganLayanan(setup, { amount: 750_000 });
  const kedua = await newLayananFor(setup, admin, { name: "Laporan Foto/Video", jenis: "laporan", leadTimeDays: 1 });
  const ditawarkan = await setup.layanan.tawarkanLayanan(admin, lokasi.lokasiMitra.id, kedua.varian.id, {
    amount: 500_000,
    effectiveOn: "2026-10-01",
    reason: null,
  });
  if (!ditawarkan.ok) throw new Error(`offering refused: ${ditawarkan.reason}`);
  const dibuat = await setup.layanan.buatPaket(admin, {
    name: "Paket Ziarah",
    description: "Dua Layanan tiap siklus.",
    frekuensi,
    itemIds: [lokasi.varian.id, kedua.varian.id],
    reason: null,
  });
  if (!dibuat.ok) throw new Error(`Paket refused: ${dibuat.reason}`);
  const petak = await petakDenganHakPakai(setup, lokasi);
  const { pemesan } = await pemesanLayanan(setup);
  const langganan = await setup.layanan.berlanggananPaket(pemesan, {
    paketId: dibuat.paket.id,
    lokasiId: lokasi.lokasiMitra.id,
    petakId: petak.petakId,
    mulai: "2026-11-20",
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
  });
  if (!langganan.ok) throw new Error(`Berlangganan refused: ${langganan.reason}`);
  return { setup, admin, lokasi, petak, pemesan, langganan };
}

/** Pays a Tagihan the way the Admin Platform's manual payment does, at `paidAt`. */
async function bayar(setup: LayananSetup, tagihanId: string, paidAt: Date) {
  return setup.billing.recordPayment(tagihanId, { method: { kind: "transfer_manual" }, reference: null, paidAt });
}

describe("a Paket Layanan cycle", () => {
  it("issues one Tagihan at H-7 with the cycle's items and one Biaya Layanan Platform", async () => {
    const { setup, langganan } = await siap();

    const hasil = await setup.layanan.paketSiklusTick(wib("2026-11-13 09:00"));
    expect(hasil.diterbitkan).toBe(1);

    const dibaca = await setup.layanan.bacaPesananPaket(langganan.paket.id);
    expect(dibaca).toMatchObject({ frekuensi: "bulanan", status: "aktif", nextCycleDate: "2026-12-20" });
    expect(dibaca?.siklus).toHaveLength(1);
    expect(dibaca?.siklus[0]).toMatchObject({
      siklus: "2026-11-20",
      tagihan: { total: 1_400_000, kind: "pay_first", dueAt: wib("2026-11-19 23:59") },
    });
    expect(dibaca?.siklus[0].tagihan?.nomorTagihan).toMatch(/^TGH\/\d{4}\/\d{6}$/);
    // One Pekerjaan Layanan per item exists from the order, waiting for the money.
    expect(dibaca?.siklus[0].pekerjaan.map((job) => [job.status, job.targetDate])).toEqual([
      ["menunggu_pembayaran", "2026-11-20"],
      ["menunggu_pembayaran", "2026-11-20"],
    ]);
  });

  it("issues nothing extra on a second tick for the same moment", async () => {
    const { setup, langganan } = await siap();
    const now = wib("2026-11-13 09:00");
    expect(await setup.layanan.paketSiklusTick(now)).toEqual({ diterbitkan: 1 });
    expect(await setup.layanan.paketSiklusTick(now)).toEqual({ diterbitkan: 0 });
    expect((await setup.layanan.bacaPesananPaket(langganan.paket.id))?.siklus).toHaveLength(1);
  });

  it("is the tick the worker schedules", async () => {
    expect(scheduledTicks.find((tick) => tick.name === "layanan.paket_siklus")).toBeDefined();
  });

  it("issues the next cycle at the frequency's H-7", async () => {
    const { setup, langganan } = await siap();
    await setup.layanan.paketSiklusTick(wib("2026-11-13 09:00"));
    // Not yet: the next monthly cycle's H-7 is still a month away.
    expect(await setup.layanan.paketSiklusTick(wib("2026-11-13 10:00"))).toEqual({ diterbitkan: 0 });
    expect(await setup.layanan.paketSiklusTick(wib("2026-12-13 09:00"))).toEqual({ diterbitkan: 1 });
    const dibaca = await setup.layanan.bacaPesananPaket(langganan.paket.id);
    expect(dibaca?.siklus.map((satu) => satu.siklus)).toEqual(["2026-11-20", "2026-12-20"]);
    expect(dibaca?.nextCycleDate).toBe("2027-01-20");
  });

  it("a sekali Paket has one cycle and then no next date", async () => {
    const { setup, langganan } = await siap("sekali");
    expect(await setup.layanan.paketSiklusTick(wib("2026-11-13 09:00"))).toEqual({ diterbitkan: 1 });
    expect((await setup.layanan.bacaPesananPaket(langganan.paket.id))?.nextCycleDate).toBeNull();
    expect(await setup.layanan.paketSiklusTick(wib("2027-01-01 09:00"))).toEqual({ diterbitkan: 0 });
  });

  it("schedules one Pekerjaan Layanan per item for that cycle once it is paid", async () => {
    const { setup, langganan } = await siap();
    await setup.layanan.paketSiklusTick(wib("2026-11-13 09:00"));
    const tagihanId = (await setup.layanan.bacaPesananPaket(langganan.paket.id))?.siklus[0].tagihan?.id;
    if (!tagihanId) throw new Error("the tick issued no Tagihan");

    setup.clock.set(wib("2026-11-13 10:00"));
    const dibayar = await bayar(setup, tagihanId, wib("2026-11-13 10:00"));
    expect(dibayar.ok).toBe(true);

    const dibaca = await setup.layanan.bacaPesananPaket(langganan.paket.id);
    expect(dibaca?.siklus[0].pekerjaan.map((job) => job.status)).toEqual(["dijadwalkan", "dijadwalkan"]);
    expect(dibaca?.siklus[0].pekerjaan.map((job) => job.label)).toEqual([
      "Layanan – Pembersihan Makam (Reguler)",
      "Layanan – Laporan Foto/Video (Reguler)",
    ]);
    // The payment is idempotent: paying twice schedules nothing twice.
    await bayar(setup, tagihanId, wib("2026-11-13 10:05"));
    expect((await setup.layanan.bacaPesananPaket(langganan.paket.id))?.siklus[0].pekerjaan.map((job) => job.status)).toEqual([
      "dijadwalkan",
      "dijadwalkan",
    ]);
  });
});
