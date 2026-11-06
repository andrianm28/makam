import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { setLokasiMitraStatusForTest } from "../../../tests/support/lokasi";
import { newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform, tariffsOnTestDatabase, type TariffsSetup } from "../../../tests/support/tariffs";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A listed Lokasi Mitra with Biaya Pemakaman Rp 9.600.000 and two Jenis Makam, all from 1 Oct 2026 (the Graha Sentosa case). */
async function grahaSentosa(setup: TariffsSetup) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const lokasiMitra = await newLokasiMitra(setup, admin, "Graha Sentosa Memorial Park");
  await setLokasiMitraStatusForTest(db, lokasiMitra.id, "terverifikasi");
  const tariff = { tenure: { kind: "selamanya" as const }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" };
  const single = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, {
    name: "Single",
    description: "Blok A & J · 2 x 5 m",
    tariff: { ...tariff, hargaHakPakai: 217_800_000 },
    reason: null,
  });
  const peace = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, {
    name: "Paket Peace Garden",
    description: "tipe lama",
    tariff: { ...tariff, hargaHakPakai: 109_688_000 },
    reason: null,
  });
  if (!single.ok || !peace.ok) throw new Error("Jenis Makam refused");
  await setup.tariffs.setBiayaPemakaman(admin, lokasiMitra.id, { biayaPemakaman: 9_600_000, biayaPemakamanTumpang: null, effectiveOn: "2026-10-01", reason: null });
  await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 250_000, effectiveOn: "2026-10-01", reason: null });
  return { admin, lokasiMitra, single: single.jenisMakam, peace: peace.jenisMakam };
}

const biayaPemakamanOf = (lines: { kind: string; amount: number }[]) => lines.find((line) => line.kind === "biaya_pemakaman")?.amount;

describe("a Jenis Makam's own Biaya Pemakaman", () => {
  it("a Saat Duka quote for Paket Peace Garden carries its own Rp 11.800.000; Single keeps the Lokasi's Rp 9.600.000", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra, single, peace } = await grahaSentosa(setup);
    expect(
      await setup.tariffs.setBiayaPemakamanJenis(admin, peace.id, { biayaPemakaman: 11_800_000, effectiveOn: "2026-10-01", reason: "Brosur GS" }),
    ).toMatchObject({ ok: true, version: { biayaPemakaman: 11_800_000 } });

    const saatDuka = (jenisMakamId: string) =>
      setup.tariffs.quote(
        [
          { kind: "harga_hak_pakai", jenisMakamId },
          { kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: false, jenisMakamId },
        ],
        wib("2026-11-07 10:00"),
      );
    const peaceQuote = await saatDuka(peace.id);
    const singleQuote = await saatDuka(single.id);
    if (!peaceQuote.ok || !singleQuote.ok) throw new Error("quote refused");
    expect(biayaPemakamanOf(peaceQuote.lines)).toBe(11_800_000);
    expect(peaceQuote.total).toBe(109_688_000 + 11_800_000 + 250_000);
    expect(biayaPemakamanOf(singleQuote.lines)).toBe(9_600_000);
    expect(singleQuote.total).toBe(217_800_000 + 9_600_000 + 250_000);

    // Without a Jenis Makam (and for a tumpang) the line is the Lokasi's.
    const lokasiSaja = await setup.tariffs.quote([{ kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: true, jenisMakamId: peace.id }], wib("2026-11-07 10:00"));
    expect(lokasiSaja.ok && biayaPemakamanOf(lokasiSaja.lines)).toBe(9_600_000);
  });

  it("a later version takes effect on its date, shows as the scheduled change, and a null version returns it to the Lokasi's", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra, peace } = await grahaSentosa(setup);
    await setup.tariffs.setBiayaPemakamanJenis(admin, peace.id, { biayaPemakaman: 11_800_000, effectiveOn: "2026-12-01", reason: null });
    await setup.tariffs.setBiayaPemakamanJenis(admin, peace.id, { biayaPemakaman: null, effectiveOn: "2027-01-01", reason: null });
    const line = [{ kind: "biaya_pemakaman" as const, lokasiId: lokasiMitra.id, tumpang: false, jenisMakamId: peace.id }];

    const pemakamanAt = async (instant: Date) => {
      const quoted = await setup.tariffs.quote(line, instant);
      return quoted.ok ? quoted.lines.find((one) => one.kind === "biaya_pemakaman") : quoted;
    };
    expect(await pemakamanAt(wib("2026-11-15 10:00"))).toMatchObject({
      amount: 9_600_000,
      inForceSince: "2026-10-01",
      scheduledChange: { effectiveOn: "2026-12-01", amount: 11_800_000 },
    });
    expect(await pemakamanAt(wib("2026-12-15 10:00"))).toMatchObject({
      amount: 11_800_000,
      inForceSince: "2026-12-01",
      scheduledChange: { effectiveOn: "2027-01-01", amount: 9_600_000 },
    });
    expect(await pemakamanAt(wib("2027-01-15 10:00"))).toMatchObject({ amount: 9_600_000, inForceSince: "2027-01-01", scheduledChange: null });

    expect(await db.execute(sql`update tariff_biaya_pemakaman_jenis_version set biaya_pemakaman = 1`).catch(() => "ditolak")).toBe("ditolak");
  });

  it("a Jenis Makam's own Biaya Pemakaman equal to the Lokasi's is no scheduled change", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra, peace } = await grahaSentosa(setup);
    await setup.tariffs.setBiayaPemakaman(admin, lokasiMitra.id, { biayaPemakaman: 9_600_000, biayaPemakamanTumpang: 5_000_000, effectiveOn: "2026-11-06", reason: null });
    await setup.tariffs.setBiayaPemakamanJenis(admin, peace.id, { biayaPemakaman: 9_600_000, effectiveOn: "2026-12-01", reason: null });
    const quoted = await setup.tariffs.quote([{ kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: false, jenisMakamId: peace.id }], wib("2026-11-15 10:00"));
    expect(quoted.ok && quoted.lines.find((one) => one.kind === "biaya_pemakaman")).toMatchObject({ amount: 9_600_000, scheduledChange: null });
  });

  it("the public Lokasi pricing shows a Jenis Makam's own Biaya Pemakaman on its card only", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra, single, peace } = await grahaSentosa(setup);
    await setup.tariffs.setBiayaPemakamanJenis(admin, peace.id, { biayaPemakaman: 11_800_000, effectiveOn: "2026-10-01", reason: null });

    const pricing = await setup.tariffs.lokasiPricing(lokasiMitra.id, wib("2026-11-07 10:00"));
    const card = (id: string) => pricing.jenisMakam.find((one) => one.jenisMakam.id === id);
    expect(card(peace.id)?.biayaPemakamanKhusus?.total).toBe(11_800_000 + 250_000);
    expect(card(single.id)?.biayaPemakamanKhusus).toBeNull();
    expect(pricing.biayaPemakaman?.total).toBe(9_600_000 + 250_000);
  });

  it("only Admin Platform enters it, a Jenis Makam of another Lokasi cannot price this one, and the change is in the Audit Log", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra, peace } = await grahaSentosa(setup);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    expect(await setup.tariffs.setBiayaPemakamanJenis(adminLokasi, peace.id, { biayaPemakaman: 1, effectiveOn: "2026-10-01", reason: null })).toMatchObject({ ok: false });
    expect(await setup.tariffs.setBiayaPemakamanJenis(admin, peace.id, { biayaPemakaman: 1.5, effectiveOn: "2026-10-01", reason: null })).toEqual({ ok: false, reason: "tarif_tidak_valid" });

    const lain = await newLokasiMitra(setup, admin, "Lokasi Lain");
    await setLokasiMitraStatusForTest(db, lain.id, "terverifikasi");
    const lainJenis = await setup.tariffs.createJenisMakam(admin, lain.id, {
      name: "Reguler",
      description: "",
      tariff: { hargaHakPakai: 5_000_000, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
      reason: null,
    });
    if (!lainJenis.ok) throw new Error("Jenis Makam refused");
    const campur = await setup.tariffs.quote(
      [{ kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: false, jenisMakamId: lainJenis.jenisMakam.id }],
      wib("2026-11-07 10:00"),
    );
    expect(campur).toEqual({ ok: false, reason: "baris_tidak_valid" });

    await setup.tariffs.setBiayaPemakamanJenis(admin, peace.id, { biayaPemakaman: 11_800_000, effectiveOn: "2026-10-01", reason: "Brosur GS" });
    const log = await setup.lokasi.auditLog(adminLokasi, lokasiMitra.id);
    if (!log.ok) throw new Error(log.reason);
    expect(log.entries).toContainEqual(
      expect.objectContaining({
        action: "tarif.ubah_biaya_pemakaman_jenis",
        before: null,
        after: { name: "Paket Peace Garden", biayaPemakaman: 11_800_000, effectiveOn: "2026-10-01" },
        reason: "Brosur GS",
      }),
    );
  });
});

describe("a Jenis Makam's description", () => {
  it("Admin Platform corrects it; every read shows the corrected one and the Audit Log keeps the old", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra, peace } = await grahaSentosa(setup);
    expect(
      await setup.tariffs.ubahKeteranganJenisMakam(admin, peace.id, { description: "Blok PG · 1,2 x 3 m · termasuk bangunan makam", reason: null }),
    ).toEqual({ ok: true, description: "Blok PG · 1,2 x 3 m · termasuk bangunan makam" });

    const tariffs = await setup.tariffs.asStaff(admin).lokasiTariffs(lokasiMitra.id, wib("2026-11-07 10:00"));
    expect(tariffs.jenisMakam.find((one) => one.id === peace.id)?.description).toBe("Blok PG · 1,2 x 3 m · termasuk bangunan makam");
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    const log = await setup.lokasi.auditLog(adminLokasi, lokasiMitra.id);
    if (!log.ok) throw new Error(log.reason);
    expect(log.entries).toContainEqual(
      expect.objectContaining({
        action: "tarif.ubah_keterangan_jenis_makam",
        before: { name: "Paket Peace Garden", description: "tipe lama" },
        after: { name: "Paket Peace Garden", description: "Blok PG · 1,2 x 3 m · termasuk bangunan makam" },
      }),
    );
    expect(await setup.tariffs.ubahKeteranganJenisMakam(admin, peace.id, { description: "x".repeat(501), reason: null })).toEqual({ ok: false, reason: "keterangan_tidak_valid" });
  });
});
