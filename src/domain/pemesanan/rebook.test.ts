/**
 * The way back into Pilih makam after a Tolak (spec, Public site: "**After a
 * Tolak**, the Pilih makam list opens with a banner, the rejecting Lokasi removed
 * and the family's data prefilled"; story 32; ticket 24's AC 3 and 7).
 *
 * The AC is easy to half build — a banner over a list that still shows the Lokasi
 * that just refused, with empty fields. So this test asserts all three as
 * outcomes of the module's own reads, and the exclusion in particular is proved
 * on the **list** rather than on a screen: the group for the rejecting Lokasi
 * Mitra is not in `pilihanSaatDuka`'s answer at all, so no page can show it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { setLokasiMitraStatusForTest } from "../../../tests/support/lokasi";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, terverifikasiLokasi, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** One order placed at the fixture's Lokasi Mitra and then declined, with another Lokasi in the same city. */
async function pesananDitolak(setup: PemesananSetup) {
  const fixture = await saatDukaFixture(setup);
  const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const ditolak = await setup.pemesanan.tolakSaatDuka(fixture.adminLokasi, { nomor: placed.pemesanan.nomor, alasan: "kapasitas_penuh" });
  if (!ditolak.ok) throw new Error(`Tolak refused: ${ditolak.reason}`);
  const lain = await terverifikasiLokasi(setup, { name: "Makam Sawah Indah", city: "Kota Jakarta Timur", hargaHakPakai: 7_750_000 });
  return { ...fixture, lain, nomor: placed.pemesanan.nomor };
}

describe("the rebook link of a declined Saat Duka order", () => {
  it("hands the family its own data back, the Lokasi that refused, and the city to look in", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDitolak(setup);

    const rebook = await setup.pemesanan.rebook(fixture.nomor, fixture.pemesan);

    expect(rebook).toMatchObject({
      nomor: fixture.nomor,
      banner: { lokasi: { id: fixture.lokasiMitra.id, name: "Makam Wakaf Al-Ikhlas" }, alasan: "Kapasitas blok ini sudah penuh" },
      kota: "Kota Jakarta Timur",
      kecualiLokasiId: fixture.lokasiMitra.id,
      isi: {
        pemesanName: "Budi Santoso",
        email: "pemesan@contoh.id",
        phoneNumber: "+6281234567890",
        almarhumName: "Siti Aminah",
        tanggalWafat: "2026-09-30",
        rencanaPemakamanAt: wib("2026-10-02 10:00"),
        pemegangHak: { mode: "pemesan", name: "Budi Santoso" },
      },
    });
  });

  it("still names the city to look in when the Lokasi that refused is Ditangguhkan or Berhenti by the time the family follows the link", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDitolak(setup);

    for (const status of ["ditangguhkan", "berhenti"] as const) {
      await setLokasiMitraStatusForTest(db, fixture.lokasiMitra.id, status);
      expect((await setup.pemesanan.rebook(fixture.nomor, fixture.pemesan))?.kota, status).toBe("Kota Jakarta Timur");
    }
  });

  it("leaves the Lokasi that refused out of the list it opens, as the list itself answers it", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDitolak(setup);

    // Without the exclusion both are offered: the Lokasi that refused is still listed.
    expect((await setup.pemesanan.pilihanSaatDuka({ city: "Kota Jakarta Timur" })).map((grup) => grup.lokasi.name)).toEqual([
      "Makam Wakaf Al-Ikhlas",
      "Makam Sawah Indah",
    ]);
    // With it — the query the rebook screen makes — the refusing Lokasi is gone from
    // the answer itself, so a screen cannot offer it and no UI is asked to hide it.
    const rebook = await setup.pemesanan.rebook(fixture.nomor, fixture.pemesan);
    const daftar = await setup.pemesanan.pilihanSaatDuka({ city: rebook?.kota ?? undefined, kecualiLokasiId: rebook?.kecualiLokasiId });

    expect(daftar.map((grup) => grup.lokasi.name)).toEqual(["Makam Sawah Indah"]);
    expect(daftar.map((grup) => grup.lokasi.id)).not.toContain(fixture.lokasiMitra.id);
    // The other Lokasi is untouched: the exclusion is one Lokasi, not the city.
    expect(daftar[0]?.pilihan[0]?.harga.total).toBe(9_900_000);
  });

  it("belongs to that family alone, and only to an order that was declined", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDitolak(setup);
    const lain = await saatDukaFixture(setup, { email: "keluarga.lain@contoh.id" });
    const masihMenunggu = await setup.pemesanan.placeSaatDuka(orderSaatDuka(lain));
    if (!masihMenunggu.ok) throw new Error(`order refused: ${masihMenunggu.reason}`);

    // Another Akun's number is nothing found, and an unknown number likewise.
    expect(await setup.pemesanan.rebook(fixture.nomor, lain.pemesan)).toBeNull();
    expect(await setup.pemesanan.rebook("MKM-2026-999999", fixture.pemesan)).toBeNull();
    // A cancellation is not a Tolak: there is nothing to be sent back from, and
    // the order page's own "cancelled" text is where that family reads it.
    const dibatalkan = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
    if (!dibatalkan.ok) throw new Error(`order refused: ${dibatalkan.reason}`);
    expect((await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: dibatalkan.pemesanan.nomor, alasan: "Batal" })).ok).toBe(true);
    expect(await setup.pemesanan.rebook(dibatalkan.pemesanan.nomor, fixture.pemesan)).toBeNull();
    // An order still waiting is not one to rebook either.
    expect(await setup.pemesanan.rebook(masihMenunggu.pemesanan.nomor, lain.pemesan)).toBeNull();
  });
});
