import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { newLokasiMitra, publishOnTestDatabase, publishedLokasiMitra, signedInAdminPlatform } from "../../../tests/support/publish";
import { releasedPetak, terencanaLokasi } from "../../../tests/support/terencana";
import type { PublicDenah } from "./picker";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

function semua(denah: PublicDenah) {
  return denah.bloks.flatMap((blok) => blok.cells);
}

function selof(denah: PublicDenah, nomor: string) {
  const cell = semua(denah).find((satu) => satu.nomorMakam === nomor);
  if (!cell) throw new Error(`no cell ${nomor}`);
  return cell;
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
    expect(semua(denah!).filter((cell) => cell.status === "perlu_verifikasi")).toHaveLength(4); // Blok B, still to clear
    expect(denah!.bloks[0].cells.filter((cell) => cell.kind === "jalan")).toMatchObject([{ row: 0, col: 5, nomorMakam: null, status: null }]);
    expect(denah!.bloks[0].cells.filter((cell) => cell.kind === "bukan_petak")).toMatchObject([{ row: 1, col: 5, nomorMakam: null, status: null }]);
    expect(denah!.bloks[0].kavling).toMatchObject([{ nomorKavling: "A-K01", status: "bisa_dipilih" }]);
    // A Kavling Keluarga is picked whole, so its member Petak carry no price of their own.
    expect(selof(denah!, "A-05")).toMatchObject({ jenisMakamId: null, kavlingId: denah!.bloks[0].kavling[0].id });
  });

  it("a Kavling Keluarga that is already Terisi is not pickable and is not counted among what a Pemesan may pick", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);
    const before = await setup.inventory.publicDenah(fixture.lokasiMitra.id);

    const blok = await setup.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, { name: "C", rows: 1, cols: 2, jenisMakamId: fixture.jenisMakam.id });
    if (!blok.ok) throw new Error(blok.reason);
    const cells = (await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blok.blok.id))!.cells;
    const kavling = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.blok.id, { cellIds: cells.map((cell) => cell.id), jenisMakamId: fixture.jenisMakam.id });
    if (!kavling.ok) throw new Error(kavling.reason);
    const terisi = await setup.inventory.clearKavling(fixture.adminLokasi, fixture.lokasiMitra.id, kavling.kavlingId, { mode: "terisi", dataMenyusul: true });
    expect(terisi.ok).toBe(true);

    const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
    const blokC = denah!.bloks.find((satu) => satu.name === "C")!;
    expect(blokC.kavling).toMatchObject([{ status: "terisi" }]);
    expect(blokC.tersedia).toBe(0);
    expect(denah!.tersedia).toBe(before!.tersedia);
  });

  it("counts, per Blok and for the whole Denah, how many units a Pemesan may pick", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);

    const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);

    // Blok A: A-01, A-02, A-07, A-08 and the one Kavling Keluarga; Blok B is still to clear.
    expect(denah?.bloks.map((blok) => [blok.name, blok.tersedia])).toEqual([
      ["A", 5],
      ["B", 0],
    ]);
    expect(denah?.tersedia).toBe(5);
  });

  it("says a Terisi Petak that can still take a tumpang is for the Admin Lokasi to arrange, not pickable", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);
    // Both plots were buried on 14 June 2026 and this Lokasi Mitra waits three years before a tumpang.
    setup.clock.set(new Date("2029-07-01T02:00:00.000Z"));

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

  it("a plot whose last burial is younger than the minimum years is not a tumpang yet, live or released", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    // Three years is this Lokasi Mitra's minimum since the last burial, and both plots were buried in June 2026.
    const fixture = await terencanaLokasi(setup, admin);
    await releasedPetak(setup, "A-10", fixture.sel);
    expect((await setup.clock.now()).toISOString()).toBe("2026-10-01T02:00:00.000Z");

    const terlaluSoon = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
    expect(selof(terlaluSoon!, "A-10")).toMatchObject({ status: "terisi", tumpangSaja: false });

    // Time moves on: three years after the burial (14 June 2026) the released plot may take a tumpang again.
    setup.clock.set(new Date("2029-07-01T02:00:00.000Z"));
    const cukup = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
    expect(selof(cukup!, "A-10")).toMatchObject({ status: "terisi", tumpangSaja: true });
    // A-09's own Hak Pakai is still live, so it is a tumpang all along.
    expect(selof(cukup!, "A-09")).toMatchObject({ status: "terisi", tumpangSaja: true });
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
