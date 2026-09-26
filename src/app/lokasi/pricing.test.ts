import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { setLokasiMitraStatusForTest } from "../../../tests/support/lokasi";
import { newLokasiMitra, signedInAdminPlatform, tariffsOnTestDatabase, type TariffsSetup } from "../../../tests/support/tariffs";
import { lokasiPricing } from "./pricing";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

async function listedLokasiMitra(setup: TariffsSetup) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const lokasiMitra = await newLokasiMitra(setup, admin);
  await setLokasiMitraStatusForTest(db, lokasiMitra.id, "terverifikasi");
  return { admin, lokasiMitra };
}

describe("the public Lokasi page's prices (spec, story 9: the page equals quote())", () => {
  it("a Jenis Makam's Harga Hak Pakai all-in equals quote()'s total for the same line, at the same instant", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra } = await listedLokasiMitra(setup);
    const created = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, {
      name: "Reguler",
      description: "",
      tariff: { hargaHakPakai: 7_512_345, tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 3_000_001, effectiveOn: "2026-10-01" },
      reason: null,
    });
    if (!created.ok) throw new Error("Jenis Makam refused");
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 150_001, effectiveOn: "2026-10-01", reason: null });
    const at = wib("2026-10-05 09:00");

    const pricing = await lokasiPricing(setup.tariffs, lokasiMitra.id, at);

    const expected = await setup.tariffs.quote([{ kind: "harga_hak_pakai", jenisMakamId: created.jenisMakam.id }], at);
    expect(expected.ok).toBe(true);
    expect(pricing.jenisMakam).toHaveLength(1);
    expect(pricing.jenisMakam[0].hakPakai.total).toBe(expected.ok ? expected.total : null);
    expect(pricing.mulaiDari).toBe(expected.ok ? expected.total : null);
  });

  it("hides a Jenis Makam whose all-in total exceeds the Rp 10.000.000 QRIS cap (spec, decision 2026-09-26)", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra } = await listedLokasiMitra(setup);
    await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, {
      name: "Mewah",
      description: "",
      tariff: { hargaHakPakai: 50_000_000, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
      reason: null,
    });
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 150_000, effectiveOn: "2026-10-01", reason: null });

    const pricing = await lokasiPricing(setup.tariffs, lokasiMitra.id, wib("2026-10-05 09:00"));

    expect(pricing.jenisMakam).toHaveLength(0);
    expect(pricing.mulaiDari).toBeNull();
  });

  it("Biaya Pemakaman (and its tumpang amount) all-in, null before any is entered", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra } = await listedLokasiMitra(setup);
    const at = wib("2026-10-05 09:00");
    expect((await lokasiPricing(setup.tariffs, lokasiMitra.id, at)).biayaPemakaman).toBeNull();

    await setup.tariffs.setBiayaPemakaman(admin, lokasiMitra.id, {
      biayaPemakaman: 1_987_655,
      biayaPemakamanTumpang: 1_250_003,
      effectiveOn: "2026-10-01",
      reason: null,
    });
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 150_000, effectiveOn: "2026-10-01", reason: null });

    const pricing = await lokasiPricing(setup.tariffs, lokasiMitra.id, at);
    const expected = await setup.tariffs.quote([{ kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: false }], at);
    const expectedTumpang = await setup.tariffs.quote([{ kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: true }], at);
    expect(pricing.biayaPemakaman?.total).toBe(expected.ok ? expected.total : null);
    expect(pricing.biayaPemakamanTumpang?.total).toBe(expectedTumpang.ok ? expectedTumpang.total : null);
  });
});
