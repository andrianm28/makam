import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { setLokasiMitraStatusForTest } from "../../../tests/support/lokasi";
import { pemesananOnTestDatabase, terverifikasiLokasi } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the tarif shown for a Lokasi Mitra listed without verification", () => {
  it("is readable for display (profile and card), though it can be neither ordered nor quoted", async () => {
    const setup = pemesananOnTestDatabase(db);
    const lokasi = await terverifikasiLokasi(setup);
    setup.clock.set(wib("2026-10-01 09:00"));
    const verified = await setup.tariffs.lokasiPricingTampil(lokasi.lokasiMitra.id, setup.clock.now());
    expect(verified.mulaiDari).toBeGreaterThan(0);

    await setLokasiMitraStatusForTest(db, lokasi.lokasiMitra.id, "tayang_belum_terverifikasi");

    expect(await setup.tariffs.lokasiPricingTampil(lokasi.lokasiMitra.id, setup.clock.now())).toEqual(verified);
    expect(await setup.tariffs.lokasiPricing(lokasi.lokasiMitra.id, setup.clock.now())).toMatchObject({ mulaiDari: null, jenisMakam: [] });
  });

  it("is not shown for a Lokasi still Belum Tayang", async () => {
    const setup = pemesananOnTestDatabase(db);
    const lokasi = await terverifikasiLokasi(setup);
    setup.clock.set(wib("2026-10-01 09:00"));
    await setLokasiMitraStatusForTest(db, lokasi.lokasiMitra.id, "belum_tayang");

    expect(await setup.tariffs.lokasiPricingTampil(lokasi.lokasiMitra.id, setup.clock.now())).toMatchObject({ mulaiDari: null, jenisMakam: [] });
  });
});
