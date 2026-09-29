import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { adminPlatformOf } from "../../../tests/support/identity";
import {
  layananOnTestDatabase,
  lokasiDenganLayanan,
  petakDenganHakPakai,
  pemesanLayanan,
  siapkanOperatorLayanan,
} from "../../../tests/support/layanan";
import { browserPushSubscription } from "../../../tests/support/notifications";
import { createQueuesTicks } from "./index";

/**
 * A Keluhan is a Tier 1 row (spec, Work Queues), so an undecided one alerts the Admin Platform on duty like
 * every other Tier 1 row (ticket 28), and its alert clocks count from when the Pemesan filed it, the fact the
 * row already carries, and not from when a tick first saw it.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const foto = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);

/** A finished job at a Lokasi Mitra, an Admin Platform with a Perangkat Push, and the Antrean's alert tick over the same database. */
async function siap() {
  const setup = layananOnTestDatabase(db);
  await siapkanOperatorLayanan(setup);
  const lokasi = await lokasiDenganLayanan(setup);
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
  await setup.billing.recordPayment(order.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: wib("2026-10-01 10:00") });
  const pekerjaanId = (await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan))?.item[0].pekerjaan?.id;
  if (!pekerjaanId) throw new Error("no job");
  setup.clock.set(wib("2026-10-20 10:00"));
  for (const kind of ["foto_sebelum", "foto_sesudah"] as const) {
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, { pekerjaanId, kind, takenAt: setup.clock.now(), file: { body: foto(), contentType: "image/jpeg" } });
  }
  const selesai = await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId });
  if (!selesai.ok) throw new Error(`Selesai refused: ${selesai.reason}`);

  const { actor: admin } = await adminPlatformOf(setup);
  await setup.notifications.enablePush(admin, { subscription: browserPushSubscription() });
  // The Tier 1 rows of the other modules read nothing here: no Saat Duka order and no TPU confirmation exists.
  const ticks = createQueuesTicks({
    db,
    clock: setup.clock,
    identity: setup.identity,
    notifications: setup.notifications,
    pemesanan: { konfirmasiLewatTenggat: async () => [], saatDukaDitolak: async () => [] } as never,
    pengurusan: { konfirmasiTpuTerbuka: async () => [] },
    layanan: setup.layanan,
  });
  const jumlah = async (template: string) =>
    (await setup.notifications.pesanStaf(admin.accountId, { limit: 100 })).filter((pesan) => pesan.template === template && pesan.channel === "email").length;
  return { setup, pemesan, pekerjaanId, lokasi, ticks, jumlah };
}

describe("an undecided Keluhan", () => {
  it("alerts the Admin Platform on duty once filed, and again at 30 min untaken, counting from the filing and not from the tick", async () => {
    const { setup, pemesan, pekerjaanId, ticks, jumlah } = await siap();
    setup.clock.set(wib("2026-10-21 09:00"));
    const diajukan = await setup.layanan.ajukanKeluhan(pemesan, { pekerjaanId, alasan: "Nisannya masih kotor." });
    if (!diajukan.ok) throw new Error(`Keluhan refused: ${diajukan.reason}`);

    // The worker was down: its first tick comes 31 min after the filing, so the first alert and the 30 min
    // escalation are queued together, which only holds if the clocks run from the filing.
    setup.clock.set(wib("2026-10-21 09:31"));
    expect(await ticks.peringatanTick(setup.clock.now())).toEqual({ diantrekan: 2 });
    await setup.notifications.kirimPeringatanAntreanTick();
    expect(await jumlah("staf_antrean_mendesak")).toBe(1);
    expect(await jumlah("staf_antrean_eskalasi")).toBe(1);
    // Idempotent: the same moment alerts nothing more.
    expect(await ticks.peringatanTick(setup.clock.now())).toEqual({ diantrekan: 0 });
  });

  it("stops alerting once Admin Platform has decided it", async () => {
    const { setup, pemesan, pekerjaanId, lokasi, ticks } = await siap();
    setup.clock.set(wib("2026-10-21 09:00"));
    const diajukan = await setup.layanan.ajukanKeluhan(pemesan, { pekerjaanId, alasan: "Nisannya masih kotor." });
    if (!diajukan.ok) throw new Error("Keluhan refused");
    expect((await setup.layanan.putuskanKeluhan(lokasi.admin, { keluhanId: diajukan.keluhan.id, keputusan: "tolak", catatan: "Sudah bersih." })).ok).toBe(true);

    setup.clock.set(wib("2026-10-21 09:31"));
    expect(await ticks.peringatanTick(setup.clock.now())).toEqual({ diantrekan: 0 });
  });
});
