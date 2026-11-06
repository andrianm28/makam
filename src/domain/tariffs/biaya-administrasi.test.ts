/**
 * The Biaya Layanan Platform split in two (rapat Ira, 6 Nov 2026: "Biaya
 * platform" Rp100.000 and "Biaya administrasi" Rp150.000, both set by Admin
 * Platform). The fee stays one Biaya Layanan Platform line, the Operator's,
 * so every Billing, Payouts and Refunds rule about the fee holds for both
 * parts; the line carries its two parts so a page or a Tagihan can show them.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { setLokasiMitraStatusForTest } from "../../../tests/support/lokasi";
import { newLokasiMitra, signedInAdminPlatform, tariffsOnTestDatabase, type TariffsSetup } from "../../../tests/support/tariffs";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

async function lokasiDenganTarif(setup: TariffsSetup) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const lokasiMitra = await newLokasiMitra(setup, admin);
  await setLokasiMitraStatusForTest(db, lokasiMitra.id, "terverifikasi");
  const jenis = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, {
    name: "Standar",
    description: "",
    tariff: { hargaHakPakai: 10_000_000, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
    reason: null,
  });
  if (!jenis.ok) throw new Error("Jenis Makam refused");
  await setup.tariffs.setBiayaPemakaman(admin, lokasiMitra.id, { biayaPemakaman: 2_000_000, biayaPemakamanTumpang: null, effectiveOn: "2026-10-01", reason: null });
  await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 100_000, effectiveOn: "2026-10-01", reason: null });
  const saatDuka = [
    { kind: "harga_hak_pakai", jenisMakamId: jenis.jenisMakam.id },
    { kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: false },
  ] as const;
  return { admin, saatDuka };
}

describe("the Biaya Administrasi beside the Biaya Platform", () => {
  it("without a Biaya Administrasi entered, the Biaya Layanan Platform is the platform part alone, as before", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { saatDuka } = await lokasiDenganTarif(setup);

    const quote = await setup.tariffs.quote(saatDuka, wib("2026-10-05 10:00"));

    expect(quote).toMatchObject({ ok: true, total: 12_100_000 });
    if (!quote.ok) return;
    const fee = quote.lines.find((line) => line.kind === "biaya_layanan_platform");
    expect(fee).toMatchObject({ amount: 100_000, bagian: { platform: 100_000, administrasi: 0 } });
  });

  it("Admin Platform enters Rp150.000 Biaya Administrasi: one fee line of Rp250.000, its two parts named, the total exact", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, saatDuka } = await lokasiDenganTarif(setup);
    const set = await setup.tariffs.setGlobalTariff(admin, { key: "biaya_administrasi", amount: 150_000, effectiveOn: "2026-10-01", reason: null });
    expect(set.ok).toBe(true);

    const quote = await setup.tariffs.quote(saatDuka, wib("2026-10-05 10:00"));

    if (!quote.ok) throw new Error(quote.reason);
    const fees = quote.lines.filter((line) => line.kind === "biaya_layanan_platform");
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({ amount: 250_000, provider: { kind: "operator" }, bagian: { platform: 100_000, administrasi: 150_000 } });
    expect(quote.total).toBe(12_250_000);
  });

  it("a scheduled change of either part shows on the fee line and in the quote's next total", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, saatDuka } = await lokasiDenganTarif(setup);
    setup.clock.set(wib("2026-10-20 10:00"));
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_administrasi", amount: 150_000, effectiveOn: "2026-10-20", reason: null });
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_administrasi", amount: 175_000, effectiveOn: "2026-12-01", reason: null });

    const quote = await setup.tariffs.quote(saatDuka, wib("2026-11-15 10:00"));

    expect(quote).toMatchObject({
      total: 12_250_000,
      inForceSince: "2026-10-20",
      scheduledChange: { effectiveOn: "2026-12-01", total: 12_275_000 },
    });
    if (!quote.ok) return;
    expect(quote.lines.find((line) => line.kind === "biaya_layanan_platform")).toMatchObject({
      amount: 250_000,
      inForceSince: "2026-10-20",
      scheduledChange: { effectiveOn: "2026-12-01", amount: 275_000 },
    });
  });
});
