import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { layananOnTestDatabase, lokasiDenganLayanan, petakDenganHakPakai, pemesanLayanan, siapkanOperatorLayanan } from "../../../tests/support/layanan";
import { adminPlatformOf } from "../../../tests/support/identity";
import { scheduledTicks } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A paid Layanan order at a Lokasi Mitra the Admin Platform has set Berhenti, effective on the 20th. */
async function lokasiBerhenti() {
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
    item: [{ layananVariantId: lokasi.varian.id, targetDate: "2026-10-25", teks: null }],
  });
  if (!order.ok) throw new Error(`order refused: ${order.reason}`);
  setup.clock.set(wib("2026-10-01 10:00"));
  await setup.billing.recordPayment(order.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: wib("2026-10-01 10:00") });
  const { actor: admin } = await adminPlatformOf(setup);
  expect(await setup.lokasi.hentikan(admin, lokasi.lokasiMitra.id, { berlakuOn: "2026-10-20" })).toMatchObject({ ok: true });
  return { setup, lokasi, pemesan, order };
}

function berhentiTick() {
  const tick = scheduledTicks.find((scheduled) => scheduled.name === "lokasi.berhenti_berlaku");
  if (!tick) throw new Error("the worker does not schedule the Berhenti effective-date tick");
  return tick.tick;
}

function konteks(setup: Awaited<ReturnType<typeof lokasiBerhenti>>["setup"], terencana: string[] = []) {
  return { db: setup.db, lokasi: setup.lokasi, layanan: setup.layanan, payouts: setup.payouts, terencana: { pesananBerjalanDiLokasi: async () => terencana.map((nomor) => ({ nomor, kind: "terencana", status: "aktif", email: null })) } } as never;
}

describe("Berhenti effective-date tick", () => {
  it("leaves a Lokasi Mitra's unfinished Layanan alone before the effective date", async () => {
    const { setup, pemesan, order } = await lokasiBerhenti();
    setup.clock.set(wib("2026-10-19 12:00"));

    await berhentiTick()(konteks(setup), setup.clock.now());

    const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
    expect(dibaca?.item[0].pekerjaan).not.toMatchObject({ status: "dibatalkan" });
    expect(await setup.layanan.pengembalianTerbuka()).toEqual([]);
  });

  it("cancels the unfinished Layanan with a full refund on the effective date, and again changes nothing", async () => {
    const { setup, pemesan, order } = await lokasiBerhenti();
    setup.clock.set(wib("2026-10-20 00:05"));

    await berhentiTick()(konteks(setup), setup.clock.now());
    await berhentiTick()(konteks(setup), setup.clock.now());

    const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
    expect(dibaca?.item[0].pekerjaan).toMatchObject({ status: "dibatalkan" });
    expect(await setup.layanan.pengembalianTerbuka()).toMatchObject([{ alasan: "berhenti", platformDikembalikan: true, total: 900_000 }]);
    expect(await setup.lokasi.berhentiBerlakuBelumDiproses()).toEqual([]);
  });
});
