import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logInByOtp } from "../../../tests/support/identity";
import {
  newLokasiMitra,
  signedInAdminLokasi,
  signedInAdminPlatform,
  tariffsOnTestDatabase,
} from "../../../tests/support/tariffs";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const biayaLayananPlatform = { key: "biaya_layanan_platform", amount: 150_000, effectiveOn: "2026-10-01", reason: null } as const;

describe("who may enter a global tariff", () => {
  it("an Admin Lokasi, a Petugas Lapangan and a Pemesan are refused, and nothing is kept or audited", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    await setup.identity.inviteStaff(admin, { phoneNumber: "084444444444", email: "petugas@contoh.id", role: "petugas_lapangan" });
    const petugas = await actorOf(setup.identity, (await logInByOtp(setup.identity, setup.whatsapp, "084444444444")).cookies);
    const pemesan = await actorOf(setup.identity, (await logInByOtp(setup.identity, setup.whatsapp, "085555555555")).cookies);

    for (const who of [adminLokasi, petugas, pemesan]) {
      expect(await setup.tariffs.setGlobalTariff(who, biayaLayananPlatform)).toEqual({ ok: false, reason: "tidak_berwenang" });
    }
    expect(await setup.tariffs.globalTariffHistory("biaya_layanan_platform")).toEqual([]);
    expect(await setup.audit.entriesAbout({ kind: "tarif_global", id: "biaya_layanan_platform" })).toEqual([]);
  });

  it("an Admin Platform who has not passed TOTP in this session is refused", async () => {
    const setup = tariffsOnTestDatabase(db);
    await setup.identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });
    const beforeTotp = await actorOf(setup.identity, (await logInByOtp(setup.identity, setup.whatsapp, "081111111111")).cookies);

    expect(await setup.tariffs.setGlobalTariff(beforeTotp, biayaLayananPlatform)).toEqual({ ok: false, reason: "perlu_totp" });
    expect(await setup.tariffs.globalTariffHistory("biaya_layanan_platform")).toEqual([]);
  });
});

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

  it("a version effective today is in force from the moment it is entered, so what was in force earlier today stays so", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-10-01 09:00"));
    await setup.tariffs.setGlobalTariff(admin, { ...biayaLayananPlatform, amount: 150_000, effectiveOn: "2026-10-01" });
    setup.clock.set(wib("2026-10-20 13:30"));
    await setup.tariffs.setGlobalTariff(admin, { ...biayaLayananPlatform, amount: 160_000, effectiveOn: "2026-10-20" });

    expect(await setup.tariffs.globalTariff("biaya_layanan_platform", wib("2026-10-20 13:29"))).toMatchObject({ amount: 150_000 });
    expect(await setup.tariffs.globalTariff("biaya_layanan_platform", wib("2026-10-20 13:30"))).toMatchObject({
      amount: 160_000,
      effectiveOn: "2026-10-20",
      inForceFrom: wib("2026-10-20 13:30"),
    });
  });

  it("an effective date before today (WIB) is refused: a past price is never rewritten", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    // 00:30 WIB on 2 October is still 1 October in UTC: "today" is the WIB date.
    setup.clock.set(wib("2026-10-02 00:30"));

    expect(await setup.tariffs.setGlobalTariff(admin, { ...biayaLayananPlatform, effectiveOn: "2026-10-01" })).toEqual({
      ok: false,
      reason: "tanggal_berlaku_lampau",
    });
    expect(await setup.tariffs.setGlobalTariff(admin, { ...biayaLayananPlatform, effectiveOn: "2026-10-02" })).toMatchObject({
      ok: true,
    });
    expect(await setup.tariffs.globalTariffHistory("biaya_layanan_platform")).toHaveLength(1);
  });

  it("an amount is whole rupiah, zero or more; an effective date is a real calendar date", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    for (const amount of [-1, 150_000.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(await setup.tariffs.setGlobalTariff(admin, { ...biayaLayananPlatform, amount })).toEqual({
        ok: false,
        reason: "tarif_tidak_valid",
      });
    }
    for (const effectiveOn of ["2026-02-30", "1/10/2026", ""]) {
      expect(await setup.tariffs.setGlobalTariff(admin, { ...biayaLayananPlatform, effectiveOn })).toEqual({
        ok: false,
        reason: "tarif_tidak_valid",
      });
    }
    expect(await setup.tariffs.globalTariffHistory("biaya_layanan_platform")).toEqual([]);

    expect(await setup.tariffs.setGlobalTariff(admin, { ...biayaLayananPlatform, amount: 0 })).toMatchObject({ ok: true });
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
