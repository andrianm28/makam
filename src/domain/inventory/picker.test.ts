import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { newLokasiMitra, publishOnTestDatabase, publishedLokasiMitra, signedInAdminPlatform } from "../../../tests/support/publish";
import { releasedPetak, terencanaLokasi } from "../../../tests/support/terencana";
import type { PublicDenah } from "./picker";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

function selof(denah: PublicDenah, nomor: string) {
  const cell = semua(denah).find((satu) => satu.nomorMakam === nomor);
  if (!cell) throw new Error(`no cell ${nomor}`);
  return cell;
}

/** A cell by its place on the Denah, for a Jalan or Bukan Petak, which carry no Nomor Makam. */
function di(denah: PublicDenah, row: number, col: number) {
  const cell = semua(denah).find((satu) => satu.row === row && satu.col === col);
  if (!cell) throw new Error(`no cell ${row}-${col}`);
  return cell;
}

function semua(denah: PublicDenah) {
  return denah.bloks.flatMap((blok) => blok.cells);
}

describe("the Denah a Pemesan picks plots on", () => {
  it("offers only cleared Tersedia Petak and a whole Tersedia Kavling Keluarga; a Jalan, Bukan Petak and a Petak that still needs clearing are not pickable", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);

    const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);

    expect(denah?.bloks.map((blok) => blok.name)).toEqual(["A", "B"]);
    expect(selof(denah!, "A-01").status).toBe("bisa_dipilih");
    expect(selof(denah!, "A-02").status).toBe("bisa_dipilih");
    expect(selof(denah!, "A-03").status).toBe("terisi");
    expect(selof(denah!, "A-04").status).toBe("tidak_tersedia");
    expect(denah!.bloks.flatMap((blok) => blok.cells).filter((cell) => cell.status === "perlu_verifikasi")).toHaveLength(4); // Blok B, still to clear
    expect(di(denah!, 0, 5)).toMatchObject({ kind: "jalan", nomorMakam: null, status: null });
    expect(di(denah!, 1, 5)).toMatchObject({ kind: "bukan_petak", nomorMakam: null, status: null });
    expect(denah!.bloks[0].kavling).toMatchObject([{ nomorKavling: "A-K01", status: "bisa_dipilih" }]);
    // A Kavling Keluarga is picked whole, so its member Petak carry no price of their own.
    expect(selof(denah!, "A-05")).toMatchObject({ jenisMakamId: null, kavlingId: denah!.bloks[0].kavling[0].id });
  });

  it("says a Terisi Petak that can still take a tumpang is for the Admin Lokasi to arrange, not pickable", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);

    // A-09 sits under a live Hak Pakai with one layer and room for a second.
    const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
    expect(selof(denah!, "A-09")).toMatchObject({ status: "terisi", tumpangSaja: true });

    await releasedPetak(setup, "A-10", fixture.sel);
    // A-10's Hak Pakai has ended but the plot is not cleared, so it can only be a tumpang.
    const setelahRilis = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
    expect(selof(setelahRilis!, "A-10")).toMatchObject({ status: "terisi", tumpangSaja: true });
  });

  it("names no plot as a tumpang when this Lokasi Mitra does not allow it", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin, { tumpang: false });
    await releasedPetak(setup, "A-10", fixture.sel);

    const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);

    expect(selof(denah!, "A-09")).toMatchObject({ status: "terisi", tumpangSaja: false });
    expect(selof(denah!, "A-10")).toMatchObject({ status: "terisi", tumpangSaja: false });
  });

  it("is no Denah at a Lokasi Mitra that is not listed for Terencana", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const belum = await newLokasiMitra(setup, admin);
    // Published, but with "Pemesanan Terencana aktif" still off.
    const terverifikasi = await publishedLokasiMitra(setup, admin);

    expect(await setup.inventory.publicDenah(terverifikasi.lokasiMitra.id)).toBeNull();
    expect(await setup.inventory.publicDenah(belum.id)).toBeNull();
    expect(await setup.inventory.publicDenah("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("counts the Petak and Kavling Keluarga a Pemesan may pick at each Lokasi Mitra", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);
    setup.clock.advance({ minutes: 2 });
    // Listed, but with "Pemesanan Terencana aktif" off, so nothing of it is pickable.
    const tanpaTerencana = await publishedLokasiMitra(setup, admin, "Makamukah Naga");

    const tersedia = await setup.inventory.tersediaUntukTerencana([fixture.lokasiMitra.id, tanpaTerencana.lokasiMitra.id]);

    // A-01, A-02, A-07 and A-08 are cleared, A-05+A-11 are one Kavling Keluarga; Blok B still needs clearing.
    expect(tersedia[fixture.lokasiMitra.id]).toBe(5);
    expect(tersedia[tanpaTerencana.lokasiMitra.id]).toBe(0);
  });
});
