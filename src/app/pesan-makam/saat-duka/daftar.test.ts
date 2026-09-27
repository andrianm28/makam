/**
 * "Pilih makam": the city filter, and the list it really leaves (the review's
 * finding that a remembered city or a deep link highlighted a chip without
 * filtering anything).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../tests/support/next-request";
import { pemesananOnTestDatabase, terverifikasiLokasi, type PemesananSetup } from "../../../../tests/support/pemesanan";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { KOTA_PILIHAN } from "./draft";
import { layarPilihMakam } from "./daftar";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));

const { db, close } = testDatabase();
afterAll(close);
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

/** A Terverifikasi Lokasi Mitra per city, so "filtered" is visible in the list. */
async function duaKota(): Promise<{ setup: PemesananSetup; barat: Awaited<ReturnType<typeof terverifikasiLokasi>> }> {
  const setup = pemesananOnTestDatabase(db);
  await terverifikasiLokasi(setup, { name: "Makam Timur" });
  const barat = await terverifikasiLokasi(setup, { name: "Makam Barat", city: "Kota Jakarta Barat", hargaHakPakai: 7_750_000 });
  return { setup, barat };
}

/** The screen's own modules, the way the page hands it the runtime's. */
const modul = (setup: PemesananSetup) => ({ pemesanan: setup.pemesanan, lokasi: setup.lokasi });

describe("the city filter on Pilih makam", () => {
  it("a first-time visitor sees every Lokasi Mitra, cheapest all-in total first", async () => {
    const { setup } = await duaKota();

    const layar = await layarPilihMakam({ kota: "", lokasiId: "" }, modul(setup));

    expect(layar.kota).toBeNull();
    expect(layar.grup.map((satu) => satu.lokasi.name)).toEqual(["Makam Timur", "Makam Barat"]);
    expect(layar.semuaKota).toEqual(["Kota Jakarta Barat", "Kota Jakarta Timur"]);
  });

  it("the city the visitor chose last time really leaves the other city's cards out", async () => {
    const { setup } = await duaKota();
    browser.store([{ name: KOTA_PILIHAN, value: "Kota Jakarta Barat" }]);

    const layar = await layarPilihMakam({ kota: "", lokasiId: "" }, modul(setup));

    expect(layar.kota).toBe("Kota Jakarta Barat");
    expect(layar.grup.map((satu) => satu.lokasi.name)).toEqual(["Makam Barat"]);
  });

  it("a deep link filters to the Lokasi Mitra's own city, ahead of the city remembered", async () => {
    const { setup, barat } = await duaKota();
    browser.store([{ name: KOTA_PILIHAN, value: "Kota Jakarta Timur" }]);

    const layar = await layarPilihMakam({ kota: "", lokasiId: barat.lokasiMitra.id }, modul(setup));

    expect(layar.kota).toBe("Kota Jakarta Barat");
    expect(layar.asal?.id).toBe(barat.lokasiMitra.id);
    expect(layar.grup.map((satu) => satu.lokasi.name)).toEqual(["Makam Barat"]);
  });

  it("the chip in the URL decides over both, and the list follows that city", async () => {
    const { setup, barat } = await duaKota();
    browser.store([{ name: KOTA_PILIHAN, value: "Kota Jakarta Timur" }]);

    const layar = await layarPilihMakam({ kota: "Kota Jakarta Timur", lokasiId: barat.lokasiMitra.id }, modul(setup));

    expect(layar.kota).toBe("Kota Jakarta Timur");
    expect(layar.grup.map((satu) => satu.lokasi.name)).toEqual(["Makam Timur"]);
  });
});
