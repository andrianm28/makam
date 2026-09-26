import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  newLokasiMitra,
  signedInAdminLokasi,
  signedInAdminPlatform,
  tariffsOnTestDatabase,
  type TariffsSetup,
} from "../../../tests/support/tariffs";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

async function lokasiWithTariffs(setup: TariffsSetup) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const lokasiMitra = await newLokasiMitra(setup, admin);
  const created = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, {
    name: "Reguler",
    description: "",
    tariff: { hargaHakPakai: 7_500_000, tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 3_000_000, effectiveOn: "2026-10-01" },
    reason: null,
  });
  if (!created.ok) throw new Error(created.reason);
  await setup.tariffs.setBiayaPemakaman(admin, lokasiMitra.id, {
    biayaPemakaman: 2_000_000,
    biayaPemakamanTumpang: null,
    effectiveOn: "2026-10-01",
    reason: null,
  });
  await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 150_000, effectiveOn: "2026-10-01", reason: null });
  return { admin, lokasiMitra, jenisMakam: created.jenisMakam };
}

describe("the 'tarif diperiksa' mark of a Lokasi Mitra (publish gate)", () => {
  it("Admin Platform sets it once the tariffs are in; it records who and when, and is audited on that Lokasi", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra } = await lokasiWithTariffs(setup);
    expect(await setup.tariffs.asStaff(admin).tariffsChecked(lokasiMitra.id)).toBeNull();
    setup.clock.set(wib("2026-10-02 11:00"));

    expect(await setup.tariffs.markTariffsChecked(admin, lokasiMitra.id, { reason: "Cocok dengan perjanjian" })).toEqual({
      ok: true,
    });

    expect(await setup.tariffs.asStaff(admin).tariffsChecked(lokasiMitra.id)).toEqual({
      checkedAt: wib("2026-10-02 11:00"),
      checkedByAccountId: admin.accountId,
      changedSinceCheck: false,
    });
    expect((await setup.audit.entriesForLokasi(lokasiMitra.id)).at(-1)).toMatchObject({
      actor: { accountId: admin.accountId, role: "admin_platform" },
      action: "tarif.tandai_diperiksa",
      entity: { kind: "lokasi_mitra", id: lokasiMitra.id },
      lokasiId: lokasiMitra.id,
      before: null,
      after: { checkedAt: wib("2026-10-02 11:00").toISOString() },
      reason: "Cocok dengan perjanjian",
    });
  });

  it("says when a tariff of that Lokasi was entered after the check, until it is checked again", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra, jenisMakam } = await lokasiWithTariffs(setup);
    setup.clock.set(wib("2026-10-02 11:00"));
    await setup.tariffs.markTariffsChecked(admin, lokasiMitra.id, { reason: null });
    setup.clock.set(wib("2026-10-03 08:00"));
    await setup.tariffs.setJenisMakamTariff(admin, jenisMakam.id, {
      hargaHakPakai: 8_000_000,
      tenure: { kind: "tahun", years: 5 },
      hargaPerpanjangan: 3_000_000,
      effectiveOn: "2027-01-01",
      reason: null,
    });

    expect(await setup.tariffs.asStaff(admin).tariffsChecked(lokasiMitra.id)).toMatchObject({ changedSinceCheck: true });

    setup.clock.set(wib("2026-10-03 09:00"));
    await setup.tariffs.markTariffsChecked(admin, lokasiMitra.id, { reason: null });
    expect(await setup.tariffs.asStaff(admin).tariffsChecked(lokasiMitra.id)).toEqual({
      checkedAt: wib("2026-10-03 09:00"),
      checkedByAccountId: admin.accountId,
      changedSinceCheck: false,
    });
  });

  it("the Admin Lokasi saving its Lokasi's Jam Operasional is no tariff change: the mark stays current", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra } = await lokasiWithTariffs(setup);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    setup.clock.set(wib("2026-10-02 11:00"));
    await setup.tariffs.markTariffsChecked(admin, lokasiMitra.id, { reason: null });
    setup.clock.set(wib("2026-10-03 08:00"));

    const open = { opens: "08:00", closes: "16:00" };
    const saved = await setup.lokasi.setJamOperasional(adminLokasi, lokasiMitra.id, {
      weekly: { monday: open, tuesday: open, wednesday: open, thursday: open, friday: open, saturday: open, sunday: null },
      tanggalTutup: [],
    });

    expect(saved).toEqual({ ok: true });
    expect(await setup.tariffs.asStaff(admin).tariffsChecked(lokasiMitra.id)).toEqual({
      checkedAt: wib("2026-10-02 11:00"),
      checkedByAccountId: admin.accountId,
      changedSinceCheck: false,
    });
  });

  it("is refused until the Lokasi has a Jenis Makam and a Biaya Pemakaman and the Biaya Layanan Platform is entered", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    expect(await setup.tariffs.markTariffsChecked(admin, lokasiMitra.id, { reason: null })).toEqual({
      ok: false,
      reason: "tarif_belum_lengkap",
      missing: ["jenis_makam", "biaya_pemakaman", "biaya_layanan_platform"],
    });
    expect(await setup.tariffs.asStaff(admin).tariffsChecked(lokasiMitra.id)).toBeNull();
  });

  it("only Admin Platform sets it: the Lokasi's own Admin Lokasi is refused; an unknown Lokasi Mitra is not found", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra } = await lokasiWithTariffs(setup);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);

    expect(await setup.tariffs.markTariffsChecked(adminLokasi, lokasiMitra.id, { reason: null })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.tariffs.markTariffsChecked(admin, "5d1f4c2e-0000-4000-8000-00000000abcd", { reason: null })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
    expect(await setup.tariffs.asStaff(admin).tariffsChecked(lokasiMitra.id)).toBeNull();
  });
});
