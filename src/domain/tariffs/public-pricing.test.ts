import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  jenisMakamInput,
  newLokasiMitra,
  publishOnTestDatabase,
  publishedLokasiMitra,
  signedInAdminPlatform,
} from "../../../tests/support/publish";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const at = wib("2026-10-05 09:00");

describe("the public Lokasi page's prices (spec, story 9: the page equals quote())", () => {
  it("a Jenis Makam's Harga Hak Pakai and Perpanjangan all-in equal quote()'s total for the same lines, at the same instant", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const jenisMakamTariff = jenisMakamInput("Reguler");
    const { lokasiMitra, jenisMakam } = await publishedLokasiMitra(setup, admin, undefined, { jenisMakam: jenisMakamTariff });

    const pricing = await setup.tariffs.lokasiPricing(lokasiMitra.id, at);

    const hakPakaiExpected = await setup.tariffs.quote([{ kind: "harga_hak_pakai", jenisMakamId: jenisMakam.id }], at);
    const perpanjanganExpected = await setup.tariffs.quote(
      [{ kind: "perpanjangan", jenisMakamId: jenisMakam.id, tenure: jenisMakamTariff.tariff.tenure, terms: 1 }],
      at,
    );
    expect(hakPakaiExpected.ok).toBe(true);
    expect(perpanjanganExpected.ok).toBe(true);
    expect(pricing.jenisMakam).toHaveLength(1);
    expect(pricing.jenisMakam[0].hakPakai.total).toBe(hakPakaiExpected.ok ? hakPakaiExpected.total : null);
    expect(pricing.jenisMakam[0].perpanjangan?.total).toBe(perpanjanganExpected.ok ? perpanjanganExpected.total : null);
    expect(pricing.mulaiDari).toBe(hakPakaiExpected.ok ? hakPakaiExpected.total : null);
  });

  it("leaves out a Perpanjangan price for a Selamanya Jenis Makam", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin, undefined, {
      jenisMakam: {
        name: "Keluarga Selamanya",
        description: "",
        tariff: { hargaHakPakai: 9_000_000, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
        reason: null,
      },
    });

    const pricing = await setup.tariffs.lokasiPricing(lokasiMitra.id, at);

    expect(pricing.jenisMakam).toHaveLength(1);
    expect(pricing.jenisMakam[0].perpanjangan).toBeNull();
  });

  it("hides a Jenis Makam whose all-in total exceeds the Rp 10.000.000 QRIS cap (spec, decision 2026-09-26)", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin, undefined, {
      jenisMakam: {
        name: "Mewah",
        description: "",
        tariff: { hargaHakPakai: 50_000_000, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
        reason: null,
      },
    });

    const pricing = await setup.tariffs.lokasiPricing(lokasiMitra.id, at);

    expect(pricing.jenisMakam).toHaveLength(0);
    expect(pricing.mulaiDari).toBeNull();
  });

  it("mulaiDari is the lowest Harga Hak Pakai all-in among several Jenis Makam", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin, undefined, {
      jenisMakam: {
        name: "Reguler",
        description: "",
        tariff: { hargaHakPakai: 5_000_000, tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 2_000_000, effectiveOn: "2026-10-01" },
        reason: null,
      },
      biayaLayananPlatform: 150_000,
    });
    const vip = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, {
      name: "VIP",
      description: "",
      tariff: { hargaHakPakai: 9_000_000, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
      reason: null,
    });
    expect(vip.ok).toBe(true);

    const pricing = await setup.tariffs.lokasiPricing(lokasiMitra.id, at);

    expect(pricing.jenisMakam).toHaveLength(2);
    expect(pricing.mulaiDari).toBe(5_000_000 + 150_000);
  });

  it("Biaya Pemakaman (and its tumpang amount) all-in equal quote()'s total for the same lines", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin);
    await setup.tariffs.setBiayaPemakaman(admin, lokasiMitra.id, {
      biayaPemakaman: 1_987_655,
      biayaPemakamanTumpang: 1_250_003,
      effectiveOn: "2026-10-01",
      reason: null,
    });

    const pricing = await setup.tariffs.lokasiPricing(lokasiMitra.id, at);
    const expected = await setup.tariffs.quote([{ kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: false }], at);
    const expectedTumpang = await setup.tariffs.quote([{ kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: true }], at);
    expect(pricing.biayaPemakaman?.total).toBe(expected.ok ? expected.total : null);
    expect(pricing.biayaPemakamanTumpang?.total).toBe(expectedTumpang.ok ? expectedTumpang.total : null);
  });

  it("no actor: a Lokasi Mitra that is not (yet) Terverifikasi has no public pricing", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const belumTayang = await newLokasiMitra(setup, admin);
    await setup.tariffs.createJenisMakam(admin, belumTayang.id, jenisMakamInput());

    const pricing = await setup.tariffs.lokasiPricing(belumTayang.id, at);

    expect(pricing).toEqual({ jenisMakam: [], biayaPemakaman: null, biayaPemakamanTumpang: null, mulaiDari: null });
  });
});
