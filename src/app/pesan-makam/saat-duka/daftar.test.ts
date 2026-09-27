/**
 * "Pilih makam": the city filter, and the list it really leaves (the review's
 * finding that a remembered city or a deep link highlighted a chip without
 * filtering anything).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../tests/support/next-request";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, terverifikasiLokasi, type PemesananSetup } from "../../../../tests/support/pemesanan";
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

describe("Pilih makam after a Tolak", () => {
  /** One declined order and a second Lokasi Mitra in the same city, as the link's list must show. */
  async function ditolakDenganLain() {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    const ditolak = await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, {
      nomor: placed.pemesanan.nomor,
      alasan: "kapasitas_penuh",
    });
    if (!ditolak.ok) throw new Error(`Tolak refused: ${ditolak.reason}`);
    await terverifikasiLokasi(setup, { name: "Makam Sawah Indah", city: "Kota Jakarta Timur", hargaHakPakai: 7_750_000 });
    return { setup, fixture, nomor: placed.pemesanan.nomor };
  }

  it("opens with the banner, without the Lokasi that refused, and with the family's own data", async () => {
    const { setup, fixture, nomor } = await ditolakDenganLain();

    const layar = await layarPilihMakam(
      { kota: "", lokasiId: "", dari: nomor, pemesan: fixture.pemesan },
      modul(setup),
    );

    expect(layar.pemesanUlang).toMatchObject({
      nomor,
      banner: { lokasi: { name: "Makam Wakaf Al-Ikhlas" }, alasan: "Kapasitas blok ini sudah penuh" },
      isi: { pemesanName: "Budi Santoso", almarhumName: "Siti Aminah", tanggalWafat: "2026-09-30" },
    });
    // The screen behind the banner really has lost that Lokasi Mitra's card.
    expect(layar.grup.map((grup) => grup.lokasi.name)).toEqual(["Makam Sawah Indah"]);
    expect(layar.kota).toBe("Kota Jakarta Timur");
  });

  it("opens plainly for a link that names no declined order of this family", async () => {
    const { setup, fixture, nomor } = await ditolakDenganLain();
    const lain = await saatDukaFixture(setup, { email: "keluarga.lain@contoh.id" });

    // Another Akun's order: no banner, no exclusion, no data — and no error page either.
    const layar = await layarPilihMakam({ kota: "", lokasiId: "", dari: nomor, pemesan: lain.pemesan }, modul(setup));
    expect(layar.pemesanUlang).toBeNull();
    // The Lokasi that refused is listed again, because nobody told this list it was refused.
    expect(layar.grup.map((grup) => grup.lokasi.id)).toContain(fixture.lokasiMitra.id);

    // A visitor who is not signed in is no family at all, and the list is plain.
    const tanpaAkun = await layarPilihMakam({ kota: "", lokasiId: "", dari: nomor }, modul(setup));
    expect(tanpaAkun.pemesanUlang).toBeNull();
    expect(tanpaAkun.grup.map((grup) => grup.lokasi.id)).toContain(fixture.lokasiMitra.id);
    expect(tanpaAkun.grup.length).toBe(layar.grup.length);
  });
});
