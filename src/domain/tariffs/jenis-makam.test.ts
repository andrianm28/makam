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

/** A fixed-term Jenis Makam as Admin Platform types it from the agreement. */
const reguler = {
  name: "Reguler 1 × 2 m",
  description: "Blok A–C",
  tariff: {
    hargaHakPakai: 7_500_000,
    tenure: { kind: "tahun", years: 5 },
    hargaPerpanjangan: 3_000_000,
    effectiveOn: "2026-10-01",
  },
  reason: null,
} as const;

/** A perpetual Jenis Makam: no Perpanjangan. */
const keluargaSelamanya = {
  name: "Keluarga Selamanya",
  description: "",
  tariff: { hargaHakPakai: 25_000_000, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
  reason: null,
} as const;

describe("a Lokasi Mitra's Jenis Makam", () => {
  it("Admin Platform defines each with its Harga Hak Pakai and tenure: Selamanya, or N years with a Perpanjangan price per term", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    const created = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, reguler);
    await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, keluargaSelamanya);

    expect(created).toMatchObject({ ok: true, jenisMakam: { lokasiId: lokasiMitra.id, name: "Reguler 1 × 2 m" } });
    const tariffs = await setup.tariffs.lokasiTariffs(lokasiMitra.id, wib("2026-10-01 12:00"));
    expect(tariffs.jenisMakam).toMatchObject([
      {
        name: "Keluarga Selamanya",
        description: "",
        inForce: { hargaHakPakai: 25_000_000, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
        scheduledChange: null,
      },
      {
        name: "Reguler 1 × 2 m",
        description: "Blok A–C",
        inForce: {
          hargaHakPakai: 7_500_000,
          tenure: { kind: "tahun", years: 5 },
          hargaPerpanjangan: 3_000_000,
          effectiveOn: "2026-10-01",
        },
        scheduledChange: null,
      },
    ]);
  });

  it("a Perpanjangan price is required for N years and refused for Selamanya; N is a whole number of years from 1", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const refused = { ok: false, reason: "tarif_tidak_valid" };

    for (const tariff of [
      { ...reguler.tariff, hargaPerpanjangan: null },
      { ...keluargaSelamanya.tariff, hargaPerpanjangan: 1_000_000 },
      { ...reguler.tariff, tenure: { kind: "tahun", years: 0 } },
      { ...reguler.tariff, tenure: { kind: "tahun", years: 2.5 } },
      { ...reguler.tariff, hargaHakPakai: 7_500_000.5 },
    ] as const) {
      expect(await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, { ...reguler, tariff })).toEqual(refused);
    }
    expect(await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, { ...reguler, name: "   " })).toEqual(refused);
    expect((await setup.tariffs.lokasiTariffs(lokasiMitra.id, wib("2026-10-01 12:00"))).jenisMakam).toEqual([]);
  });

  it("two Jenis Makam of one Lokasi Mitra cannot share a name (ignoring case and spaces); another Lokasi may use it", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const other = await newLokasiMitra(setup, admin, "Makam Yayasan Al-Hikmah");
    await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, reguler);

    expect(await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, { ...reguler, name: "  reguler 1 × 2 M " })).toEqual({
      ok: false,
      reason: "nama_sudah_ada",
    });
    expect(await setup.tariffs.createJenisMakam(admin, other.id, reguler)).toMatchObject({ ok: true });
  });

  it("only Admin Platform defines Jenis Makam: its Admin Lokasi is refused; an unknown Lokasi Mitra is not found", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);

    expect(await setup.tariffs.createJenisMakam(adminLokasi, lokasiMitra.id, reguler)).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.tariffs.createJenisMakam(admin, "5d1f4c2e-0000-4000-8000-00000000abcd", reguler)).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
    expect((await setup.tariffs.lokasiTariffs(lokasiMitra.id, wib("2026-10-01 12:00"))).jenisMakam).toEqual([]);
  });
});

describe("a Jenis Makam's tariff versions", () => {
  it("a new version with a future effective date is returned only from that date: before, on and after; the old one is kept", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const created = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, reguler);
    if (!created.ok) throw new Error(created.reason);
    setup.clock.set(wib("2026-10-15 10:00"));

    expect(
      await setup.tariffs.setJenisMakamTariff(admin, created.jenisMakam.id, {
        hargaHakPakai: 8_000_000,
        tenure: { kind: "tahun", years: 5 },
        hargaPerpanjangan: 3_250_000,
        effectiveOn: "2027-01-01",
        reason: "Tarif 2027 sesuai perjanjian",
      }),
    ).toMatchObject({ ok: true });

    const priceAt = async (at: Date) =>
      (await setup.tariffs.lokasiTariffs(lokasiMitra.id, at)).jenisMakam[0];
    expect(await priceAt(wib("2026-12-31 23:59"))).toMatchObject({
      inForce: { hargaHakPakai: 7_500_000, hargaPerpanjangan: 3_000_000, effectiveOn: "2026-10-01" },
      scheduledChange: { hargaHakPakai: 8_000_000, hargaPerpanjangan: 3_250_000, effectiveOn: "2027-01-01" },
    });
    expect(await priceAt(wib("2027-01-01 00:00"))).toMatchObject({
      inForce: { hargaHakPakai: 8_000_000, effectiveOn: "2027-01-01" },
      scheduledChange: null,
    });
    expect(await priceAt(wib("2028-06-01 00:00"))).toMatchObject({ inForce: { hargaHakPakai: 8_000_000 } });
    expect(await setup.tariffs.jenisMakamTariffHistory(created.jenisMakam.id)).toMatchObject([
      { hargaHakPakai: 7_500_000, effectiveOn: "2026-10-01", enteredAt: wib("2026-10-01 09:00") },
      { hargaHakPakai: 8_000_000, effectiveOn: "2027-01-01", enteredAt: wib("2026-10-15 10:00") },
    ]);
    await expect(db.execute(sql`update tariff_jenis_makam_version set harga_hak_pakai = 1`)).rejects.toThrow();
    await expect(db.execute(sql`delete from tariff_jenis_makam_version`)).rejects.toThrow();
  });

  it("a Jenis Makam's tenure can change from a date too (e.g. 5 years to Selamanya), with the version", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const created = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, reguler);
    if (!created.ok) throw new Error(created.reason);

    await setup.tariffs.setJenisMakamTariff(admin, created.jenisMakam.id, {
      ...keluargaSelamanya.tariff,
      hargaHakPakai: 12_000_000,
      effectiveOn: "2026-11-01",
      reason: null,
    });

    const at = async (instant: Date) => (await setup.tariffs.lokasiTariffs(lokasiMitra.id, instant)).jenisMakam[0]?.inForce;
    expect(await at(wib("2026-10-31 12:00"))).toMatchObject({ tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 3_000_000 });
    expect(await at(wib("2026-11-01 12:00"))).toMatchObject({ tenure: { kind: "selamanya" }, hargaPerpanjangan: null });
  });

  it("only Admin Platform enters a version; an unknown Jenis Makam is not found", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    const created = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, reguler);
    if (!created.ok) throw new Error(created.reason);
    const version = { ...reguler.tariff, hargaHakPakai: 1, effectiveOn: "2026-10-02", reason: null };

    expect(await setup.tariffs.setJenisMakamTariff(adminLokasi, created.jenisMakam.id, version)).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.tariffs.setJenisMakamTariff(admin, "5d1f4c2e-0000-4000-8000-00000000abcd", version)).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
    expect(await setup.tariffs.jenisMakamTariffHistory(created.jenisMakam.id)).toHaveLength(1);
  });
});
