/**
 * The Admin Platform Antrean's Tier 1 "Saat Duka ditolak" row (spec, Work
 * Queues: "Saat Duka ditolak (call within 2 h)"; story 33; ticket 24's AC 4): a
 * declined order is a phone call, the two hours are daytime hours, and the row
 * closes itself the moment somebody logs that call.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AlasanTolak } from "@/domain/pemesanan";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { orderSaatDuka, saatDukaFixture } from "../../../tests/support/pemesanan";
import { queuesOnTestDatabase, type QueuesSetup } from "../../../tests/support/queues";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The Admin Platform's own Antrean rows, of this type only. */
async function tier1Ditolak(setup: QueuesSetup, admin: Awaited<ReturnType<typeof saatDukaFixture>>["admin"]) {
  const rows = (await setup.queues.antrean(admin)).filter((row) => row.type === "saat_duka_ditolak");
  return rows;
}

/** One placed order, declined by its own Admin Lokasi at the Clock's now. */
async function pesananDitolak(setup: QueuesSetup, options: { alasan?: AlasanTolak; pada?: string } = {}) {
  const fixture = await saatDukaFixture(setup);
  const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  if (options.pada) setup.clock.set(wib(options.pada));
  const ditolak = await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, {
    nomor: placed.pemesanan.nomor,
    alasan: options.alasan ?? "kapasitas_penuh",
  });
  if (!ditolak.ok) throw new Error(`Tolak refused: ${ditolak.reason}`);
  return { ...fixture, nomor: placed.pemesanan.nomor };
}

describe('the Tier 1 "Saat Duka ditolak" row', () => {
  it("appears for a declined order, is Tier 1, and is due two daytime hours after the decline", async () => {
    const setup = queuesOnTestDatabase(db);
    // Declined at 17:00, near the close of the 06:00–18:00 window: only one of
    // the two hours fits today, so the second is counted from 06:00 tomorrow and
    // the call is owed at 07:00 — not at 19:00 tonight, as a plain "+2 h" would say.
    const fixture = await pesananDitolak(setup, { pada: "2026-10-01 17:00" });

    const [row] = await tier1Ditolak(setup, fixture.admin);

    expect(row).toMatchObject({
      type: "saat_duka_ditolak",
      tier: 1,
      label: "Saat Duka ditolak",
      subjectKind: "pemesanan_makam",
      subjectLabel: `${fixture.nomor} · Siti Aminah · Budi Santoso`,
      deadline: wib("2026-10-02 07:00"),
      pastDeadline: false,
      alerts: true,
    });
  });

  it("is a call and not an email, and the family stays a row until the call is logged", async () => {
    const setup = queuesOnTestDatabase(db);
    const fixture = await pesananDitolak(setup);

    // Admin Platform's own call row: no Lokasi, so the declining Lokasi's staff cannot log it.
    const [telepon] = await setup.notifications.teleponPemesanTerbuka();
    expect(telepon).toMatchObject({ subjectKind: "pemesanan", nomorPemesanan: fixture.nomor, lokasiId: null, sebab: "saat_duka_ditolak" });
    expect(telepon?.perihal).toContain("Kapasitas blok ini sudah penuh");

    // Logged by the Lokasi's own Admin Lokasi, who cannot: a declined family is not theirs to call.
    expect(
      await setup.notifications.catatPanggilan(fixture.adminLokasi, { teleponId: telepon!.id, hasil: "sudah_dihubungi" }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await tier1Ditolak(setup, fixture.admin)).toHaveLength(1);

    // Logged by Admin Platform, who may: the row closes by itself.
    const dicatat = await setup.notifications.catatPanggilan(fixture.admin, { teleponId: telepon!.id, hasil: "sudah_dihubungi" });
    expect(dicatat.ok).toBe(true);
    expect(await tier1Ditolak(setup, fixture.admin)).toEqual([]);
  });

  it("does not appear for an order still waiting, and a decline does not leave the late-confirmation row behind", async () => {
    const setup = queuesOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);

    // 09:00 submission, confirmed by 11:00: on time, so no late row either.
    expect(await tier1Ditolak(setup, fixture.admin)).toEqual([]);

    setup.clock.set(wib("2026-10-01 11:30"));
    const ditolak = await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, { nomor: placed.pemesanan.nomor, alasan: "petak_tidak_tersedia" });
    expect(ditolak.ok).toBe(true);

    // Exactly one Tier 1 row: the declined-order call. The "Konfirmasi Lokasi terlambat"
    // row is gone, because a declined order is no longer waiting for its confirmation.
    const tier1 = (await setup.queues.antrean(fixture.admin)).filter((row) => row.tier === 1);
    expect(tier1.map((row) => row.type)).toEqual(["saat_duka_ditolak"]);
    // 11:30 + 2 daytime hours, still inside the window today.
    expect(tier1[0]?.deadline).toEqual(wib("2026-10-01 13:30"));
  });
});
