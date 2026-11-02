/**
 * Pilih Tipe Kavling (owner, 2026-11-02): the Terencana wizard offers tipe kavling, not plots on the Denah,
 * and an order takes the next pickable unit of the chosen tipe.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { pemesanDenganEmail, pemesananOnTestDatabase, unitIds } from "../../../tests/support/pemesanan";
import { signedInAdminPlatform } from "../../../tests/support/publish";
import { terencanaLokasi } from "../../../tests/support/terencana";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("Pilih Tipe Kavling", () => {
  it("lists each tipe kavling a Terencana Lokasi Mitra sells with its all-in price, what is left, and the unit an order would take", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);

    const hasil = await setup.pemesanan.tipeKavlingTerencana(fixture.lokasiMitra.id);

    expect(hasil?.lokasi.id).toBe(fixture.lokasiMitra.id);
    expect(hasil?.tipe).toHaveLength(1);
    expect(hasil?.tipe[0]).toMatchObject({ jenisMakamId: fixture.jenisMakam.id, hargaAllIn: 2_650_000, tersedia: 5 });
    expect(hasil?.tipe[0].berikut).toEqual({ petak: ["A-01"], kavling: null });
  });

  it("moves on to the next unit of the tipe once the one it offered is ordered", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id");
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01"]);
    const dipesan = await setup.pemesanan.placeTerencana({
      pemesanName: "Rina Wulandari",
      phoneNumber: "081234567890",
      pemegangHak: { mode: "pemesan" },
      calonPenghuni: { mode: "saya" },
      pemesan,
      lokasiId: fixture.lokasiMitra.id,
      units: [{ petakId: a01 }],
    });
    expect(dipesan.ok).toBe(true);

    const [tipe] = (await setup.pemesanan.tipeKavlingTerencana(fixture.lokasiMitra.id))?.tipe ?? [];
    expect(tipe?.tersedia).toBe(4);
    expect(tipe?.berikut?.petak).not.toEqual(["A-01"]);
  });

  it("is null for a Lokasi Mitra that takes no Terencana order", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin, { terencana: false });

    expect(await setup.pemesanan.tipeKavlingTerencana(fixture.lokasiMitra.id)).toBeNull();
  });
});
