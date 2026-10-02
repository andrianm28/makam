import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { adminPlatformOf } from "../../../tests/support/identity";
import { layananOnTestDatabase, lokasiDenganLayanan, petakDenganHakPakai, pemesanLayanan, siapkanOperatorLayanan } from "../../../tests/support/layanan";
import { scheduledTicks, ticksForRelease } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("Scheduled ticks by release (ADR 0006)", () => {
  it("at Rilis 1 the Hak Pakai reminder tick is registered but sends nothing, and never touches its dependencies", async () => {
    const logs: string[] = [];
    const tick = ticksForRelease(scheduledTicks, 1, (message) => logs.push(message)).find((t) => t.name === "perpanjangan.pengingat_hak_pakai");
    expect(tick).toBeDefined();
    // An empty context would throw if the reminder ran: the skipped tick never reads it.
    await expect(tick!.tick({} as never, wib("2026-10-02 10:00"))).resolves.toBeUndefined();
    await tick!.tick({} as never, wib("2026-10-02 10:01"));
    expect(logs.filter((line) => line.includes("perpanjangan.pengingat_hak_pakai"))).toHaveLength(1);
  });

  it("at Rilis 3 the same tick runs", async () => {
    const tick = ticksForRelease(scheduledTicks, 3).find((t) => t.name === "perpanjangan.pengingat_hak_pakai");
    await expect(tick!.tick({} as never, wib("2026-10-02 10:00"))).rejects.toThrow();
  });

  it("every tick keeps its name and cron, so the worker registers the same jobs at any release", () => {
    expect(ticksForRelease(scheduledTicks, 1).map(({ name, cron }) => ({ name, cron }))).toEqual(scheduledTicks.map(({ name, cron }) => ({ name, cron })));
  });

  it("at Rilis 1 a Berhenti Lokasi's effective date changes nothing; at Rilis 2 it cancels and refunds", async () => {
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
    setup.clock.set(wib("2026-10-20 00:05"));
    const konteks = { db: setup.db, lokasi: setup.lokasi, layanan: setup.layanan, payouts: setup.payouts, terencana: { nomorTerencanaAktifDiLokasi: async () => [] } } as never;
    const find = (rilis: 1 | 2 | 3) => ticksForRelease(scheduledTicks, rilis, () => {}).find((t) => t.name === "lokasi.berhenti_berlaku")!;

    await find(1).tick(konteks, setup.clock.now());
    expect(await setup.layanan.pengembalianTerbuka()).toEqual([]);

    await find(2).tick(konteks, setup.clock.now());
    expect(await setup.layanan.pengembalianTerbuka()).toMatchObject([{ alasan: "berhenti" }]);
  });
});
