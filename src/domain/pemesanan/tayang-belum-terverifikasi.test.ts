/**
 * A Lokasi Mitra listed without verification (owner, 2026-11-05) is shown, never ordered from: no Pemesanan of any
 * kind, no price quote, no Tagihan, until it is fully Terverifikasi.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { setLokasiMitraStatusForTest } from "../../../tests/support/lokasi";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("ordering at a Lokasi Mitra listed without verification", () => {
  it("is refused for a Saat Duka order, which the same Lokasi takes while Terverifikasi", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    await siapkanOperatorPemesanan(setup);
    setup.clock.set(wib("2026-10-01 09:00"));
    expect((await setup.pemesanan.pilihanSaatDuka()).map((satu) => satu.lokasi.id)).toEqual([fixture.lokasiMitra.id]);

    await setLokasiMitraStatusForTest(db, fixture.lokasiMitra.id, "tayang_belum_terverifikasi");

    expect(await setup.pemesanan.pilihanSaatDuka()).toEqual([]);
    const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
    expect(placed.ok).toBe(false);
  });

  it("offers no Terencana choice, no tipe kavling, no denah and no price quote", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    setup.clock.set(wib("2026-10-01 09:00"));
    await setLokasiMitraStatusForTest(db, fixture.lokasiMitra.id, "tayang_belum_terverifikasi");

    expect(await setup.pemesanan.pilihanTerencana()).toEqual([]);
    expect(await setup.pemesanan.kotaTerencana()).toEqual([]);
    expect(await setup.pemesanan.tipeKavlingTerencana(fixture.lokasiMitra.id)).toBeNull();
    expect(await setup.pemesanan.denahTerencana(fixture.lokasiMitra.id)).toBeNull();
    expect((await setup.tariffs.lokasiPricing(fixture.lokasiMitra.id, setup.clock.now())).jenisMakam).toEqual([]);
    expect(await setup.tariffs.quote([{ kind: "harga_hak_pakai", jenisMakamId: fixture.jenisMakam.id }], setup.clock.now())).toMatchObject({
      ok: false,
    });
  });
});
