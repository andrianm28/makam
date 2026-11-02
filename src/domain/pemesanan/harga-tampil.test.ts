/**
 * Harga Tampil of a Lokasi Mitra (owner, 2026-11-02, ADR 0011): a partner may keep its prices off the
 * site's front (Daftar Lokasi, its own Lokasi page), but every order is still placed on the platform,
 * where the wizard shows the price. WhatsApp is only the CS for questions.
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

async function hargaTampil(setup: Setup, admin: Parameters<Setup["lokasi"]["setPoliciesAndFlags"]>[0], lokasiId: string, value: boolean, terencana = false) {
  const saved = await setup.lokasi.setPoliciesAndFlags(admin, lokasiId, {
    policies: DEFAULT_POLICIES,
    flags: { ...DEFAULT_FLAGS, pemesananTerencanaAktif: terencana, hargaTampil: value },
  });
  if (!saved.ok) throw new Error(`kebijakan refused: ${saved.reason}`);
}

describe("Harga Tampil of a Lokasi Mitra", () => {
  it("is on for a Lokasi Mitra that never set it", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);

    expect((await setup.lokasi.publicLokasiMitra(fixture.lokasiMitra.id))?.hargaTampil).toBe(true);
  });

  it("off, the Lokasi Mitra is still listed, marked so its price stays off the front, and the Saat Duka wizard still offers it, priced, and places the order", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    await terverifikasiLokasi(setup, { name: "Makam Harga Terbuka" });
    await hargaTampil(setup, fixture.admin, fixture.lokasiMitra.id, false);

    const kartu = await setup.lokasi.publicLokasiMitraList();
    expect(kartu.map((satu) => [satu.name, satu.hargaTampil])).toEqual([
      ["Makam Harga Terbuka", true],
      ["Makam Wakaf Al-Ikhlas", false],
    ]);
    const [grup] = await setup.pemesanan.pilihanSaatDuka({ lokasiId: fixture.lokasiMitra.id });
    expect(grup?.lokasi.id).toBe(fixture.lokasiMitra.id);
    expect((await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture))).ok).toBe(true);
  });

  it("off, the Terencana wizard still lists the Lokasi Mitra, shows its Denah and places the order", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin, { tumpang: false });
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id");
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01"]);
    await hargaTampil(setup, admin, fixture.lokasiMitra.id, false, true);

    expect((await setup.pemesanan.pilihanTerencana()).map((satu) => satu.lokasi.id)).toEqual([fixture.lokasiMitra.id]);
    expect(await setup.pemesanan.denahTerencana(fixture.lokasiMitra.id)).not.toBeNull();
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
  });
});
