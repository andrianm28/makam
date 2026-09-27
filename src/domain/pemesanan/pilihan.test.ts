/**
 * The Saat Duka wizard's "Pilih makam" list (spec, stories 17–20; ticket 22).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { kartuAwal, type GrupSaatDuka, type PilihanSaatDuka } from "@/domain/pemesanan";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { belumTeverifikasiLokasi, pemesananOnTestDatabase, pemesanDenganEmail, terverifikasiLokasi } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const DUA_JAM_WIB = 2 * 60 * 60 * 1000;

describe("the Saat Duka list of Lokasi Mitra × Jenis Makam", () => {
  it("offers a Terverifikasi Lokasi Mitra with its Jenis Makam, its all-in total and its Tersedia count", async () => {
    const setup = pemesananOnTestDatabase(db);
    const lokasi = await terverifikasiLokasi(setup, { petak: { rows: 2, cols: 2 } });

    const grup = await setup.pemesanan.pilihanSaatDuka();

    expect(grup).toHaveLength(1);
    expect(grup[0].lokasi).toEqual({ id: lokasi.lokasiMitra.id, name: "Makam Wakaf Al-Ikhlas", city: "Kota Jakarta Timur" });
    expect(grup[0].pilihan).toHaveLength(1);
    expect(grup[0].pilihan[0]).toMatchObject({
      jenisMakamId: lokasi.jenisMakam.id,
      jenisMakamName: "Reguler 1 × 2 m",
      tenure: { kind: "tahun", years: 5 },
      tersedia: 4,
    });
    // Harga Hak Pakai 7.500.000 + Biaya Pemakaman 2.000.000 + one Biaya Layanan Platform 150.000.
    expect(grup[0].pilihan[0].harga.total).toBe(9_650_000);
    expect(grup[0].pilihan[0].harga.lines.map((line) => line.kind)).toEqual(["harga_hak_pakai", "biaya_pemakaman", "biaya_layanan_platform"]);
  });

  it("leaves out a Lokasi Mitra that is not Terverifikasi, and one with no cleared Tersedia unit", async () => {
    const setup = pemesananOnTestDatabase(db);
    await terverifikasiLokasi(setup);
    await belumTeverifikasiLokasi(setup);

    // The Belum Tayang one takes no plot, so the only Blok is at the Terverifikasi one.
    const grup = await setup.pemesanan.pilihanSaatDuka();
    expect(grup.map((satu) => satu.lokasi.name)).toEqual(["Makam Wakaf Al-Ikhlas"]);

    // Mark every Petak there Tidak Tersedia: a Jenis Makam with none left is no card.
    const petakTidakTersedia = await terverifikasiLokasi(setup, { name: "Makam Penuh", petak: { rows: 1, cols: 1 } });
    for (const cell of await cellsOfPetak(setup, petakTidakTersedia)) {
      const cleared = await setup.inventory.clearPetak(petakTidakTersedia.adminLokasi, petakTidakTersedia.lokasiMitra.id, cell.id, {
        mode: "tidak_tersedia",
        reason: "Sedang dirapikan",
      });
      if (!cleared.ok) throw new Error(`clearPetak refused: ${cleared.reason}`);
    }

    expect((await setup.pemesanan.pilihanSaatDuka()).map((satu) => satu.lokasi.name)).toEqual(["Makam Wakaf Al-Ikhlas"]);
  });

  it("orders Lokasi Mitra by their cheapest all-in total", async () => {
    const setup = pemesananOnTestDatabase(db);
    await terverifikasiLokasi(setup, { name: "Makam Mahal", hargaHakPakai: 7_750_000 });
    await terverifikasiLokasi(setup, { name: "Makam Murah" });

    const grup = await setup.pemesanan.pilihanSaatDuka();

    expect(grup.map((satu) => satu.lokasi.name)).toEqual(["Makam Murah", "Makam Mahal"]);
    expect(grup.map((satu) => satu.pilihan[0].harga.total)).toEqual([9_650_000, 9_900_000]);
  });

  it("filters by kota, so a remembered city really leaves the other city's cards out", async () => {
    const setup = pemesananOnTestDatabase(db);
    await terverifikasiLokasi(setup, { name: "Makam Timur" });
    await terverifikasiLokasi(setup, { name: "Makam Barat", city: "Kota Jakarta Barat", hargaHakPakai: 7_750_000 });

    // "Semua kota" is the first-time visitor: both Lokasi Mitra, cheapest first.
    expect((await setup.pemesanan.pilihanSaatDuka()).map((satu) => satu.lokasi.name)).toEqual(["Makam Timur", "Makam Barat"]);
    expect((await setup.pemesanan.pilihanSaatDuka({ city: "Kota Jakarta Barat" })).map((satu) => satu.lokasi.name)).toEqual(["Makam Barat"]);
    expect((await setup.pemesanan.pilihanSaatDuka({ city: "Kota Jakarta Timur" })).map((satu) => satu.lokasi.name)).toEqual(["Makam Timur"]);
    expect(await setup.pemesanan.pilihanSaatDuka({ city: "Kota Surabaya" })).toEqual([]);
  });

  it("prices the one card the visitor chose, so the total on Data & kirim is the one the order carries", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await terverifikasiLokasi(setup, { petak: { rows: 2, cols: 2 } });
    await terverifikasiLokasi(setup, { name: "Makam Lain", city: "Kota Jakarta Barat" });

    const [grup] = await setup.pemesanan.pilihanSaatDuka({ lokasiId: fixture.lokasiMitra.id, jenisMakamId: fixture.jenisMakam.id });

    expect(grup.lokasi.id).toBe(fixture.lokasiMitra.id);
    expect(grup.pilihan).toHaveLength(1);
    expect(grup.pilihan[0].harga.total).toBe(9_650_000);
    expect(grup.konfirmasi.bukaSekarang).toBe(true);
    // A card that is not on the list is no card, not a fallback to another one.
    expect(await setup.pemesanan.pilihanSaatDuka({ lokasiId: fixture.lokasiMitra.id, jenisMakamId: "00000000-0000-4000-8000-000000000000" })).toEqual([]);
    expect(await setup.pemesanan.pilihanSaatDuka({ lokasiId: "00000000-0000-4000-8000-000000000000" })).toEqual([]);
  });

  it("starts on the Lokasi Mitra the visitor came from, and on the list's first card otherwise", () => {
    // The read's own order: cheapest all-in total first, Lokasi Mitra by Lokasi Mitra.
    const grup: GrupSaatDuka[] = [
      { lokasi: { id: "lokasi-murah", name: "Makam Murah", city: "Kota Jakarta Barat" }, konfirmasi: belum, pilihan: [kartu("jenis-murah-a", 9_650_000), kartu("jenis-murah-b", 9_700_000)] },
      { lokasi: { id: "lokasi-mahal", name: "Makam Mahal", city: "Kota Jakarta Timur" }, konfirmasi: belum, pilihan: [kartu("jenis-mahal", 9_900_000)] },
    ];

    // The deep link decides which Lokasi Mitra, and that one's cheapest card.
    expect(kartuAwal(grup, "lokasi-mahal")).toEqual({ lokasiId: "lokasi-mahal", jenisMakamId: "jenis-mahal" });
    // No Lokasi Mitra to preselect: the list's own order, never a second opinion of it.
    expect(kartuAwal(grup, null)).toEqual({ lokasiId: "lokasi-murah", jenisMakamId: "jenis-murah-a" });
    expect(kartuAwal(grup, "lokasi-yang-tidak-ada")).toEqual({ lokasiId: "lokasi-murah", jenisMakamId: "jenis-murah-a" });
    expect(kartuAwal([], "lokasi-murah")).toBeNull();
  });

  it("hides a Jenis Makam whose all-in total would pass the QRIS cap, because v1 takes no such order", async () => {
    const setup = pemesananOnTestDatabase(db);
    await terverifikasiLokasi(setup, { name: "Makam Mewah", hargaHakPakai: 9_950_000 });

    // 9.950.000 + 2.000.000 + 150.000 is above Rp 10.000.000.
    expect(await setup.pemesanan.pilihanSaatDuka()).toEqual([]);
  });

  it("inside Jam Operasional says it is open, and when it will confirm", async () => {
    const setup = pemesananOnTestDatabase(db);
    await terverifikasiLokasi(setup);

    // The fake Clock sits at Thursday 2026-10-01 09:00 WIB, inside 07:00–15:00.
    const [grup] = await setup.pemesanan.pilihanSaatDuka();

    expect(grup.konfirmasi.bukaSekarang).toBe(true);
    expect(grup.konfirmasi.batas).toEqual({ ok: true, at: wib("2026-10-01 11:00") });
    expect(grup.konfirmasi.kontakSiaga).toMatchObject({ accountId: expect.any(String), phoneNumber: expect.stringContaining("+6283") });
  });

  it("outside Jam Operasional says closed, still says when it will confirm, and names its Kontak Siaga", async () => {
    const setup = pemesananOnTestDatabase(db);
    await terverifikasiLokasi(setup);

    // 20:00 WIB is past the close, so the two service hours are counted from Friday 07:00.
    setup.clock.set(wib("2026-10-01 20:00"));

    const [grup] = await setup.pemesanan.pilihanSaatDuka();

    expect(grup.konfirmasi.bukaSekarang).toBe(false);
    expect(grup.konfirmasi.batas).toEqual({ ok: true, at: wib("2026-10-02 09:00") });
    expect(grup.konfirmasi.kontakSiaga).toMatchObject({ accountId: expect.any(String), phoneNumber: expect.stringContaining("+6283") });
  });

  it("names the Kontak Siaga once the wizard's Kode Masuk has learned the name it typed", async () => {
    const setup = pemesananOnTestDatabase(db);
    const lokasi = await terverifikasiLokasi(setup);
    // The Kontak Siaga is the Admin Lokasi of that Lokasi Mitra, the account the
    // fixture logs in as `lokasi.saat-duka-1@contoh.id`.
    expect((await setup.pemesanan.pilihanSaatDuka())[0].konfirmasi.kontakSiaga?.name).toBe("");

    await pemesanDenganEmail(setup, "lokasi.saat-duka-1@contoh.id", "Hajjah Siti Aminah");

    const [grup] = await setup.pemesanan.pilihanSaatDuka();
    expect(grup.konfirmasi.kontakSiaga).toMatchObject({ accountId: lokasi.adminLokasi.accountId, name: "Hajjah Siti Aminah" });

    // A second order through the same wizard never replaces a name the Akun has.
    await pemesanDenganEmail(setup, "lokasi.saat-duka-1@contoh.id", "Siti Aminah");
    expect((await setup.pemesanan.pilihanSaatDuka())[0].konfirmasi.kontakSiaga?.name).toBe("Hajjah Siti Aminah");
  });

  it("counts two hours of Jam Operasional, not two wall-clock hours, across a closing time", async () => {
    const setup = pemesananOnTestDatabase(db);
    await terverifikasiLokasi(setup);

    // 14:30 leaves half an hour before the 15:00 close, so the promise is Friday 08:30.
    setup.clock.set(wib("2026-10-01 14:30"));

    const [grup] = await setup.pemesanan.pilihanSaatDuka();
    const batas = grup.konfirmasi.batas;
    expect(batas).toEqual({ ok: true, at: wib("2026-10-02 08:30") });
    expect(batas.ok && batas.at.getTime() - wib("2026-10-01 14:30").getTime()).toBeGreaterThan(DUA_JAM_WIB);
  });

});

/** The Blok's Petak Makam, read through the Inventory module's own Denah. */
async function cellsOfPetak(setup: ReturnType<typeof pemesananOnTestDatabase>, lokasi: Awaited<ReturnType<typeof terverifikasiLokasi>>) {
  if (!lokasi.blok) throw new Error("the fixture has no Blok");
  const denah = await setup.inventory.asStaff(lokasi.adminLokasi).blok(lokasi.lokasiMitra.id, lokasi.blok.id);
  if (!denah) throw new Error("Blok not found");
  return denah.cells;
}

/** One group of the list a hand picks, so the cheapest-first order is the fixture's, not the read's. */
const belum = { bukaSekarang: true, batas: { ok: true as const, at: new Date(0) }, kontakSiaga: null };

function kartu(jenisMakamId: string, total: number): PilihanSaatDuka {
  return {
    jenisMakamId,
    jenisMakamName: jenisMakamId,
    tenure: { kind: "tahun", years: 5 },
    tersedia: 4,
    harga: { total, lines: [], inForceSince: "2026-10-01", scheduledChange: null },
  };
}
