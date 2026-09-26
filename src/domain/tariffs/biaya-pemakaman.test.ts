import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  newLokasiMitra,
  signedInAdminLokasi,
  signedInAdminPlatform,
  tariffsOnTestDatabase,
} from "../../../tests/support/tariffs";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("a Lokasi Mitra's Biaya Pemakaman", () => {
  it("Admin Platform enters it per Lokasi with its own tumpang amount; a new version is returned only from its effective date", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    expect((await setup.tariffs.lokasiTariffs(lokasiMitra.id, wib("2026-10-01 09:00"))).biayaPemakaman).toEqual({
      inForce: null,
      scheduledChange: null,
    });

    await setup.tariffs.setBiayaPemakaman(admin, lokasiMitra.id, {
      biayaPemakaman: 2_000_000,
      biayaPemakamanTumpang: 1_500_000,
      effectiveOn: "2026-10-01",
      reason: null,
    });
    await setup.tariffs.setBiayaPemakaman(admin, lokasiMitra.id, {
      biayaPemakaman: 2_250_000,
      biayaPemakamanTumpang: null,
      effectiveOn: "2027-01-01",
      reason: "Tarif 2027",
    });

    const at = async (instant: Date) => (await setup.tariffs.lokasiTariffs(lokasiMitra.id, instant)).biayaPemakaman;
    expect(await at(wib("2026-12-31 23:59"))).toMatchObject({
      inForce: { biayaPemakaman: 2_000_000, biayaPemakamanTumpang: 1_500_000, effectiveOn: "2026-10-01" },
      scheduledChange: { biayaPemakaman: 2_250_000, biayaPemakamanTumpang: null, effectiveOn: "2027-01-01" },
    });
    expect(await at(wib("2027-01-01 00:00"))).toMatchObject({
      inForce: { biayaPemakaman: 2_250_000, biayaPemakamanTumpang: null, effectiveOn: "2027-01-01" },
      scheduledChange: null,
    });
    expect(await setup.tariffs.biayaPemakamanHistory(lokasiMitra.id)).toHaveLength(2);
    await expect(db.execute(sql`update tariff_biaya_pemakaman_version set biaya_pemakaman = 1`)).rejects.toThrow();
    await expect(db.execute(sql`delete from tariff_biaya_pemakaman_version`)).rejects.toThrow();
  });

  it("amounts are whole rupiah; only Admin Platform enters it; an unknown Lokasi Mitra is not found", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    const entry = { biayaPemakaman: 2_000_000, biayaPemakamanTumpang: null, effectiveOn: "2026-10-01", reason: null };

    expect(await setup.tariffs.setBiayaPemakaman(admin, lokasiMitra.id, { ...entry, biayaPemakaman: 1_999_999.99 })).toEqual({
      ok: false,
      reason: "tarif_tidak_valid",
    });
    expect(await setup.tariffs.setBiayaPemakaman(admin, lokasiMitra.id, { ...entry, biayaPemakamanTumpang: -5 })).toEqual({
      ok: false,
      reason: "tarif_tidak_valid",
    });
    expect(await setup.tariffs.setBiayaPemakaman(adminLokasi, lokasiMitra.id, entry)).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.tariffs.setBiayaPemakaman(admin, "5d1f4c2e-0000-4000-8000-00000000abcd", entry)).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
    expect(await setup.tariffs.biayaPemakamanHistory(lokasiMitra.id)).toEqual([]);
  });
});
