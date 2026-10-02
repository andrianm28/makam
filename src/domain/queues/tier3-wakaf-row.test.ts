/**
 * The Antrean's Tier 3 "Pengajuan Wakaf" row (spec, Work Queues: "Pengajuan Wakaf (first contact in
 * 3 working days; no alert)"; ticket 58): a new Pengajuan appears for Admin Platform's first contact
 * and closes the moment Admin Platform moves it on; it never alerts.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { signedInAdminPlatform, wakifDenganEmail } from "../../../tests/support/wakaf";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const PENGAJUAN = {
  tujuan: "sosial" as const,
  wakifNama: "Haji Slamet",
  wakifTelepon: "0812 3456 7890",
  hubunganDenganTanah: "Pemilik",
  kabKota: "Kota Depok",
  alamat: "Jl. Raya Sawangan No. 12",
  pin: null,
  luasM2: 1500,
  jenisBukti: "SHM",
};

describe("the Antrean's Tier 3 Pengajuan Wakaf row", () => {
  it("shows a new Pengajuan Wakaf due 3 working days later, raises no alert, and closes at the first contact", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const wakif = await wakifDenganEmail(setup as never);
    const diajukan = await setup.wakaf.ajukanWakaf(wakif, PENGAJUAN);
    if (!diajukan.ok) throw new Error("refused");

    const baris = (await setup.queues.antrean(admin)).filter((row) => row.type === "pengajuan_wakaf");
    expect(baris).toHaveLength(1);
    expect(baris[0]).toMatchObject({ tier: 3, subjectId: diajukan.pengajuanId, subjectLabel: expect.stringContaining(diajukan.nomor) });
    expect(baris[0]?.deadline).toBeInstanceOf(Date);
    expect((await setup.notifications.staffAlerts(admin))).toMatchObject({ ok: true, unread: 0 });

    await setup.wakaf.pindahStatus(admin, { pengajuanId: diajukan.pengajuanId, status: "ditinjau" });
    expect((await setup.queues.antrean(admin)).filter((row) => row.type === "pengajuan_wakaf")).toEqual([]);
  });

  it("does not show a Dirujuk Pengajuan: it is closed at filing", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const wakif = await wakifDenganEmail(setup as never);
    await setup.wakaf.ajukanWakaf(wakif, { ...PENGAJUAN, kabKota: "Kabupaten Sleman" });

    expect((await setup.queues.antrean(admin)).filter((row) => row.type === "pengajuan_wakaf")).toEqual([]);
  });
});
