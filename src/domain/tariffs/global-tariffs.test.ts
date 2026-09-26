import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { signedInAdminPlatform, tariffsOnTestDatabase } from "../../../tests/support/tariffs";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the Biaya Layanan Platform", () => {
  it("a version entered with a future effective date is returned only from that date: before, on and after", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-10-01 09:00"));
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 150_000, effectiveOn: "2026-10-01", reason: null });
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 175_000, effectiveOn: "2026-11-01", reason: null });

    expect(await setup.tariffs.globalTariff("biaya_layanan_platform", wib("2026-10-31 23:59"))).toMatchObject({
      amount: 150_000,
      effectiveOn: "2026-10-01",
    });
    expect(await setup.tariffs.globalTariff("biaya_layanan_platform", wib("2026-11-01 00:00"))).toMatchObject({
      amount: 175_000,
      effectiveOn: "2026-11-01",
    });
    expect(await setup.tariffs.globalTariff("biaya_layanan_platform", wib("2027-03-15 12:00"))).toMatchObject({
      amount: 175_000,
      effectiveOn: "2026-11-01",
    });
  });

  it("entering a new version keeps every older one unchanged, and the database refuses to change or delete one", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-10-01 09:00"));
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 150_000, effectiveOn: "2026-10-01", reason: null });
    setup.clock.set(wib("2026-10-10 14:00"));
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 175_000, effectiveOn: "2026-11-01", reason: null });

    const history = [
      { amount: 150_000, effectiveOn: "2026-10-01", inForceFrom: wib("2026-10-01 09:00"), enteredAt: wib("2026-10-01 09:00") },
      { amount: 175_000, effectiveOn: "2026-11-01", inForceFrom: wib("2026-11-01 00:00"), enteredAt: wib("2026-10-10 14:00") },
    ];
    expect(await setup.tariffs.globalTariffHistory("biaya_layanan_platform")).toMatchObject(history);

    await expect(db.execute(sql`update tariff_global_version set amount = 1`)).rejects.toThrow();
    await expect(db.execute(sql`delete from tariff_global_version`)).rejects.toThrow();
    expect(await setup.tariffs.globalTariffHistory("biaya_layanan_platform")).toMatchObject(history);
  });

  it("each entry records an Entri Audit with the version it replaces from that date, the new one and the reason", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-10-01 09:00"));
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 150_000, effectiveOn: "2026-10-01", reason: null });
    setup.clock.set(wib("2026-10-10 14:00"));
    await setup.tariffs.setGlobalTariff(admin, {
      key: "biaya_layanan_platform",
      amount: 175_000,
      effectiveOn: "2026-11-01",
      reason: "Penyesuaian biaya 2026",
    });

    expect(await setup.audit.entriesAbout({ kind: "tarif_global", id: "biaya_layanan_platform" })).toEqual([
      expect.objectContaining({
        at: wib("2026-10-01 09:00"),
        actor: { accountId: admin.accountId, role: "admin_platform" },
        action: "tarif.ubah_global",
        lokasiId: null,
        before: null,
        after: { amount: 150_000, effectiveOn: "2026-10-01" },
        reason: null,
      }),
      expect.objectContaining({
        at: wib("2026-10-10 14:00"),
        action: "tarif.ubah_global",
        before: { amount: 150_000, effectiveOn: "2026-10-01" },
        after: { amount: 175_000, effectiveOn: "2026-11-01" },
        reason: "Penyesuaian biaya 2026",
      }),
    ]);
  });
});
