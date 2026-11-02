/**
 * The Saat Duka form's Data Mendiang and Layanan Tambahan (dri, 2026-11-02): the mendiang's sex and where the body lies
 * reach the Lokasi Mitra's staff with the order, and a Lokasi Mitra whose burial is already a complete package (paket
 * lengkap) takes no Layanan Tambahan. Through the modules' public functions only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FLAGS, DEFAULT_POLICIES } from "@/domain/lokasi";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, tawarkanLayananDi } from "../../../tests/support/pemesanan";
import { adminPlatformOf } from "../../../tests/support/identity";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("Data Mendiang on a Pemesanan Saat Duka", () => {
  it("gives the Lokasi Mitra's staff the mendiang's sex and the address of the rumah duka", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);

    const placed = await setup.pemesanan.placeSaatDuka({
      ...orderSaatDuka(fixture),
      jenisKelaminAlmarhum: "perempuan",
      alamatRumahDuka: "  Rumah Duka RS Fatmawati, Ruang Melati  ",
    });
    if (!placed.ok) throw new Error(placed.reason);

    const order = await setup.pemesanan.orderUntukStaf(fixture.adminLokasi, placed.pemesanan.nomor);
    expect(order?.almarhum).toMatchObject({ jenisKelamin: "perempuan", alamatRumahDuka: "Rumah Duka RS Fatmawati, Ruang Melati" });
  });

  it("keeps an empty rumah duka address as none", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);

    const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), jenisKelaminAlmarhum: "laki_laki", alamatRumahDuka: " " });
    if (!placed.ok) throw new Error(placed.reason);

    const order = await setup.pemesanan.orderUntukStaf(fixture.adminLokasi, placed.pemesanan.nomor);
    expect(order?.almarhum).toMatchObject({ jenisKelamin: "laki_laki", alamatRumahDuka: null });
  });
});

describe("Layanan Tambahan at a Lokasi Mitra with a complete package", () => {
  it("refuses Layanan Tambahan once Admin Platform marks the Lokasi Mitra paket lengkap, and takes the order without them", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    const { varian } = await tawarkanLayananDi(setup, fixture.lokasiMitra.id);
    const { actor: admin } = await adminPlatformOf(setup);
    const disimpan = await setup.lokasi.setPoliciesAndFlags(admin, fixture.lokasiMitra.id, {
      policies: DEFAULT_POLICIES,
      flags: { ...DEFAULT_FLAGS, paketLengkap: true },
    });
    expect(disimpan.ok).toBe(true);
    expect((await setup.lokasi.publicLokasiMitra(fixture.lokasiMitra.id))?.paketLengkap).toBe(true);

    const denganLayanan = await setup.pemesanan.placeSaatDuka({
      ...orderSaatDuka(fixture),
      rencanaPemakamanAt: "2026-10-02T10:00",
      layananHariH: [{ layananVariantId: varian.id, teks: null }],
    });
    expect(denganLayanan).toEqual({ ok: false, reason: "layanan_tidak_tersedia" });
    expect((await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture))).ok).toBe(true);
  });
});
