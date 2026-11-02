/**
 * Two ways to order at a Lokasi Mitra (owner, 2026-11-02): one whose prices are shown (Harga Tampil on) takes its
 * orders on the platform; one whose prices are not shown is ordered through the CS on WhatsApp, and Admin Platform
 * enters the order, so the self-serve wizards neither list nor place it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FLAGS, DEFAULT_POLICIES } from "@/domain/lokasi";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { orderSaatDuka, pemesanDenganEmail, pemesananOnTestDatabase, saatDukaFixture, terverifikasiLokasi, unitIds } from "../../../tests/support/pemesanan";
import { signedInAdminPlatform } from "../../../tests/support/publish";
import { terencanaLokasi } from "../../../tests/support/terencana";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

type Setup = ReturnType<typeof pemesananOnTestDatabase>;
type Lokasi = Awaited<ReturnType<typeof terverifikasiLokasi>>;

async function hargaTampil(setup: Setup, lokasi: Lokasi, value: boolean) {
  const saved = await setup.lokasi.setPoliciesAndFlags(lokasi.admin, lokasi.lokasiMitra.id, {
    policies: DEFAULT_POLICIES,
    flags: { ...DEFAULT_FLAGS, hargaTampil: value },
  });
  if (!saved.ok) throw new Error(`kebijakan refused: ${saved.reason}`);
}

describe("Harga Tampil of a Lokasi Mitra", () => {
  it("is on for a Lokasi Mitra that never set it, which is listed and ordered on the platform as before", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);

    expect((await setup.lokasi.publicLokasiMitra(fixture.lokasiMitra.id))?.hargaTampil).toBe(true);
    expect((await setup.pemesanan.pilihanSaatDuka()).map((grup) => grup.lokasi.name)).toEqual(["Makam Wakaf Al-Ikhlas"]);
    expect((await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture))).ok).toBe(true);
  });

  it("off, the Lokasi Mitra stays listed in the directory with the flag, but the Saat Duka wizard neither offers nor places an order there", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    const lain = await terverifikasiLokasi(setup, { name: "Makam Harga Terbuka" });
    await hargaTampil(setup, fixture, false);

    const kartu = await setup.lokasi.publicLokasiMitraList();
    expect(kartu.map((satu) => [satu.name, satu.hargaTampil])).toEqual([
      ["Makam Harga Terbuka", true],
      ["Makam Wakaf Al-Ikhlas", false],
    ]);
    expect((await setup.pemesanan.pilihanSaatDuka()).map((grup) => grup.lokasi.id)).toEqual([lain.lokasiMitra.id]);
    expect(await setup.pemesanan.pilihanSaatDuka({ lokasiId: fixture.lokasiMitra.id })).toEqual([]);
    expect(await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture))).toEqual({ ok: false, reason: "lokasi_tidak_terbuka" });
  });

  it("switched back on, the Lokasi Mitra takes self-serve orders again", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    await hargaTampil(setup, fixture, false);
    await hargaTampil(setup, fixture, true);

    expect((await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture))).ok).toBe(true);
  });

  it("off, the Terencana wizard neither lists the Lokasi Mitra, nor shows its Denah, nor places an order there", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin, { tumpang: false });
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id");
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01"]);
    expect((await setup.pemesanan.pilihanTerencana()).map((satu) => satu.lokasi.id)).toEqual([fixture.lokasiMitra.id]);

    const saved = await setup.lokasi.setPoliciesAndFlags(admin, fixture.lokasiMitra.id, {
      policies: DEFAULT_POLICIES,
      flags: { ...DEFAULT_FLAGS, pemesananTerencanaAktif: true, hargaTampil: false },
    });
    if (!saved.ok) throw new Error(`kebijakan refused: ${saved.reason}`);

    expect(await setup.pemesanan.pilihanTerencana()).toEqual([]);
    expect(await setup.pemesanan.kotaTerencana()).toEqual([]);
    expect(await setup.pemesanan.denahTerencana(fixture.lokasiMitra.id)).toBeNull();
    const dipesan = await setup.pemesanan.placeTerencana({
      pemesanName: "Rina Wulandari",
      phoneNumber: "081234567890",
      pemegangHak: { mode: "pemesan" },
      calonPenghuni: { mode: "saya" },
      pemesan,
      lokasiId: fixture.lokasiMitra.id,
      units: [{ petakId: a01 }],
    });
    expect(dipesan).toEqual({ ok: false, reason: "lokasi_tidak_ada" });
  });
});
