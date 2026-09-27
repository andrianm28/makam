/**
 * "Pilih makam": the city filter, the TPU section and the type chip over the
 * combined list (the review's finding that a remembered city or a deep link
 * highlighted a chip without filtering anything).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../tests/support/next-request";
import { pemesananOnTestDatabase, terverifikasiLokasi, type PemesananSetup } from "../../../../tests/support/pemesanan";
import { hargaTpu, tpu } from "../../../../tests/support/pengurusan";
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
const modul = (setup: PemesananSetup) => ({ pemesanan: setup.pemesanan, lokasi: setup.lokasi, pengurusan: setup.pengurusan });

/** A TPU in each of two cities, one of them not taking new plots, beside one Lokasi Mitra per city. */
async function denganTpu(): Promise<{ setup: PemesananSetup; barat: Awaited<ReturnType<typeof terverifikasiLokasi>> }> {
  const prepared = await duaKota();
  await hargaTpu(prepared.setup);
  await tpu(prepared.setup, { name: "TPU Kober Timur", city: "Kota Jakarta Timur" });
  await tpu(prepared.setup, { name: "TPU Kober Barat", city: "Kota Jakarta Barat" });
  await tpu(prepared.setup, { name: "TPU Penuh", city: "Kota Jakarta Timur", menerimaMakamBaru: false });
  return prepared;
}

describe("the city filter on Pilih makam", () => {
  it("a first-time visitor sees every Lokasi Mitra, cheapest all-in total first", async () => {
    const { setup } = await duaKota();

    const layar = await layarPilihMakam({ kota: "", lokasiId: "", jenis: "" }, modul(setup));

    expect(layar.kota).toBeNull();
    expect(layar.grup.map((satu) => satu.lokasi.name)).toEqual(["Makam Timur", "Makam Barat"]);
    expect(layar.semuaKota).toEqual(["Kota Jakarta Barat", "Kota Jakarta Timur"]);
  });

  it("the city the visitor chose last time really leaves the other city's cards out", async () => {
    const { setup } = await duaKota();
    browser.store([{ name: KOTA_PILIHAN, value: "Kota Jakarta Barat" }]);

    const layar = await layarPilihMakam({ kota: "", lokasiId: "", jenis: "" }, modul(setup));

    expect(layar.kota).toBe("Kota Jakarta Barat");
    expect(layar.grup.map((satu) => satu.lokasi.name)).toEqual(["Makam Barat"]);
  });

  it("a deep link filters to the Lokasi Mitra's own city, ahead of the city remembered", async () => {
    const { setup, barat } = await duaKota();
    browser.store([{ name: KOTA_PILIHAN, value: "Kota Jakarta Timur" }]);

    const layar = await layarPilihMakam({ kota: "", lokasiId: barat.lokasiMitra.id, jenis: "" }, modul(setup));

    expect(layar.kota).toBe("Kota Jakarta Barat");
    expect(layar.asal?.id).toBe(barat.lokasiMitra.id);
    expect(layar.grup.map((satu) => satu.lokasi.name)).toEqual(["Makam Barat"]);
  });

  it("the chip in the URL decides over both, and the list follows that city", async () => {
    const { setup, barat } = await duaKota();
    browser.store([{ name: KOTA_PILIHAN, value: "Kota Jakarta Timur" }]);

    const layar = await layarPilihMakam({ kota: "Kota Jakarta Timur", lokasiId: barat.lokasiMitra.id, jenis: "" }, modul(setup));

    expect(layar.kota).toBe("Kota Jakarta Timur");
    expect(layar.grup.map((satu) => satu.lokasi.name)).toEqual(["Makam Timur"]);
  });
});

describe("the TPU section and the type chip on Pilih makam", () => {
  it("shows every TPU that is taking new plots, priced by the TPU section and never by a Lokasi Mitra", async () => {
    const { setup } = await denganTpu();

    const layar = await layarPilihMakam({ kota: "", lokasiId: "", jenis: "" }, modul(setup));

    // "TPU Penuh" is not taking new plots, so it is not on the list at all.
    expect(layar.tpu.map((satu) => satu.tpuName)).toEqual(["TPU Kober Barat", "TPU Kober Timur"]);
    expect(layar.tpu[0].rincian).toEqual([
      { label: "Biaya Pengurusan", amount: 1_750_000 },
      { label: "Retribusi Pemda (IPTM)", amount: 0 },
    ]);
    expect(layar.tpu[0].konfirmasi).toBe("Dikonfirmasi paling lambat 1 Oktober 2026, 11.00 WIB");
  });

  it("filters the combined list by the chip, and the city filter leaves the TPUs too", async () => {
    const { setup } = await denganTpu();

    const semua = await layarPilihMakam({ kota: "", lokasiId: "", jenis: "" }, modul(setup));
    expect(semua.jenis).toBe("semua");
    expect(semua.grup.map((satu) => satu.lokasi.name)).toEqual(["Makam Timur", "Makam Barat"]);

    const tpuSaja = await layarPilihMakam({ kota: "", lokasiId: "", jenis: "tpu_dki" }, modul(setup));
    expect(tpuSaja.jenis).toBe("tpu_dki");
    expect(tpuSaja.grup).toEqual([]);

    const lokasiSaja = await layarPilihMakam({ kota: "", lokasiId: "", jenis: "lokasi_mitra" }, modul(setup));
    expect(lokasiSaja.jenis).toBe("lokasi_mitra");
    expect(lokasiSaja.tpu).toEqual([]);

    const satuKota = await layarPilihMakam({ kota: "Kota Jakarta Barat", lokasiId: "", jenis: "semua" }, modul(setup));
    expect(satuKota.grup.map((satu) => satu.lokasi.name)).toEqual(["Makam Barat"]);
    expect(satuKota.tpu.map((satu) => satu.tpuName)).toEqual(["TPU Kober Barat"]);
  });
});
