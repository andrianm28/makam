/**
 * The red banner in the header of every staff page (spec, Work Queues: "a red
 * banner shows in the header of every staff page while any Tier 1 row is
 * untaken (Ambil)"; ticket 28's AC 2).
 *
 * The count is what the banner shows, so that is what is read: the Antrean of an
 * Admin Platform, and the same read by an Admin Lokasi, who has no Antrean at all
 * and must never see the platform's work in a header.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { orderSaatDuka, saatDukaFixture } from "../../../tests/support/pemesanan";
import { queuesOnTestDatabase, signedInAdminLokasi, type QueuesSetup } from "../../../tests/support/queues";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A declined Saat Duka order: one Tier 1 row, untaken, in Admin Platform's Antrean. */
async function ditolakTier1(setup: QueuesSetup, pada: string) {
  const fixture = await saatDukaFixture(setup);
  const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  setup.clock.set(wib(pada));
  const ditolak = await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, {
    nomor: placed.pemesanan.nomor,
    alasan: "kapasitas_penuh",
  });
  if (!ditolak.ok) throw new Error(`Tolak refused: ${ditolak.reason}`);
  return fixture;
}

describe("the header banner count of untaken Tier 1 rows", () => {
  it("counts a Tier 1 row nobody has taken, and stops counting it once it is taken (Ambil)", async () => {
    const setup = queuesOnTestDatabase(db);
    const ditolak = await ditolakTier1(setup, "2026-10-01 11:30");

    expect(await setup.queues.tier1BelumAmbil(ditolak.admin)).toBe(1);

    const diambil = await setup.queues.ambilRow(ditolak.admin, {
      type: "saat_duka_ditolak",
      subjectId: (await setup.queues.antrean(ditolak.admin)).find((satu) => satu.type === "saat_duka_ditolak")!
        .subjectId,
      subjectKind: "pemesanan_makam",
    });
    expect(diambil.ok).toBe(true);
    expect(await setup.queues.tier1BelumAmbil(ditolak.admin)).toBe(0);
  });

  it("is zero for an Admin Lokasi, who has no Antrean to count", async () => {
    const setup = queuesOnTestDatabase(db);
    const ditolak = await ditolakTier1(setup, "2026-10-01 11:30");
    const adminLokasi = await signedInAdminLokasi(setup, ditolak.admin, [ditolak.lokasiMitra.id]);
    expect(await setup.queues.tier1BelumAmbil(adminLokasi)).toBe(0);
  });
});
