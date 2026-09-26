import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  newLokasiMitra,
  signedInAdminPlatform,
  tariffsOnTestDatabase,
  type TariffsSetup,
} from "../../../tests/support/tariffs";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/**
 * A Lokasi Mitra with one fixed-term and one perpetual Jenis Makam, its Biaya
 * Pemakaman, and the Biaya Layanan Platform, all in force from 1 October 2026.
 * Odd amounts, so a wrong sum cannot hide behind round numbers.
 */
async function pricedLokasiMitra(setup: TariffsSetup, name = "Makam Wakaf Al-Ikhlas") {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const lokasiMitra = await newLokasiMitra(setup, admin, name);
  const reguler = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, {
    name: "Reguler",
    description: "",
    tariff: { hargaHakPakai: 7_512_345, tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 3_000_001, effectiveOn: "2026-10-01" },
    reason: null,
  });
  const selamanya = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, {
    name: "Keluarga Selamanya",
    description: "",
    tariff: { hargaHakPakai: 25_000_000, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
    reason: null,
  });
  if (!reguler.ok || !selamanya.ok) throw new Error("Jenis Makam refused");
  await setup.tariffs.setBiayaPemakaman(admin, lokasiMitra.id, {
    biayaPemakaman: 1_987_655,
    biayaPemakamanTumpang: 1_250_003,
    effectiveOn: "2026-10-01",
    reason: null,
  });
  await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 150_001, effectiveOn: "2026-10-01", reason: null });
  return { admin, lokasiMitra, reguler: reguler.jenisMakam, selamanya: selamanya.jenisMakam };
}

describe("the all-in quote", () => {
  it("a Saat Duka order at a Lokasi Mitra: Harga Hak Pakai + Biaya Pemakaman + one Biaya Layanan Platform, each with its provider, and the exact total", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { lokasiMitra, reguler } = await pricedLokasiMitra(setup);

    const quote = await setup.tariffs.quote(
      [
        { kind: "harga_hak_pakai", jenisMakamId: reguler.id },
        { kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: false },
      ],
      wib("2026-10-05 10:00"),
    );

    expect(quote).toMatchObject({
      ok: true,
      lines: [
        {
          kind: "harga_hak_pakai",
          label: "Harga Hak Pakai – Reguler",
          amount: 7_512_345,
          provider: { kind: "lokasi_mitra", lokasiId: lokasiMitra.id },
          tenure: { kind: "tahun", years: 5 },
        },
        {
          kind: "biaya_pemakaman",
          label: "Biaya Pemakaman",
          amount: 1_987_655,
          provider: { kind: "lokasi_mitra", lokasiId: lokasiMitra.id },
        },
        {
          kind: "biaya_layanan_platform",
          label: "Biaya Layanan Platform",
          amount: 150_001,
          provider: { kind: "operator" },
        },
      ],
      total: 9_650_001,
    });
  });
});
