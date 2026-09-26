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
          jenisMakamName: "Reguler",
          amount: 7_512_345,
          provider: { kind: "lokasi_mitra", lokasiId: lokasiMitra.id },
          tenure: { kind: "tahun", years: 5 },
        },
        {
          kind: "biaya_pemakaman",
          amount: 1_987_655,
          provider: { kind: "lokasi_mitra", lokasiId: lokasiMitra.id },
        },
        {
          kind: "biaya_layanan_platform",
          amount: 150_001,
          provider: { kind: "operator" },
        },
      ],
      total: 9_650_001,
    });
    // Line names are worded outside the domain (quoteLineLabel); a quote carries facts only.
    if (quote.ok) for (const line of quote.lines) expect(line).not.toHaveProperty("label");
  });

  it("exactly one Biaya Layanan Platform per quote, however many Lokasi Mitra lines it has; the total is the exact sum", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { lokasiMitra, reguler, selamanya } = await pricedLokasiMitra(setup);

    const quote = await setup.tariffs.quote(
      [
        { kind: "harga_hak_pakai", jenisMakamId: reguler.id },
        { kind: "harga_hak_pakai", jenisMakamId: selamanya.id },
        { kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: false },
        { kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: true },
      ],
      wib("2026-10-05 10:00"),
    );

    if (!quote.ok) throw new Error(quote.reason);
    expect(quote.lines.filter((line) => line.kind === "biaya_layanan_platform")).toHaveLength(1);
    expect(quote.lines.map((line) => line.amount)).toEqual([7_512_345, 25_000_000, 1_987_655, 1_250_003, 150_001]);
    expect(quote.total).toBe(35_900_004);
  });

  it("shows the scheduled change: each line's next version and date, and the quote's next total from the first such date ('Harga baru mulai'), and since when its total holds ('Harga berlaku sejak')", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra, reguler } = await pricedLokasiMitra(setup);
    setup.clock.set(wib("2026-10-20 10:00"));
    await setup.tariffs.setJenisMakamTariff(admin, reguler.id, {
      hargaHakPakai: 8_000_000,
      tenure: { kind: "tahun", years: 5 },
      hargaPerpanjangan: 3_250_000,
      effectiveOn: "2027-01-01",
      reason: null,
    });
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 175_000, effectiveOn: "2026-12-01", reason: null });
    const saatDuka = [
      { kind: "harga_hak_pakai", jenisMakamId: reguler.id },
      { kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: false },
    ] as const;

    expect(await setup.tariffs.quote(saatDuka, wib("2026-11-15 10:00"))).toMatchObject({
      lines: [
        { amount: 7_512_345, inForceSince: "2026-10-01", scheduledChange: { effectiveOn: "2027-01-01", amount: 8_000_000 } },
        { amount: 1_987_655, inForceSince: "2026-10-01", scheduledChange: null },
        { amount: 150_001, inForceSince: "2026-10-01", scheduledChange: { effectiveOn: "2026-12-01", amount: 175_000 } },
      ],
      total: 9_650_001,
      inForceSince: "2026-10-01",
      scheduledChange: { effectiveOn: "2026-12-01", total: 9_675_000 },
    });
    expect(await setup.tariffs.quote(saatDuka, wib("2026-12-15 10:00"))).toMatchObject({
      total: 9_675_000,
      inForceSince: "2026-12-01",
      scheduledChange: { effectiveOn: "2027-01-01", total: 10_162_655 },
    });
    expect(await setup.tariffs.quote(saatDuka, wib("2027-01-01 00:00"))).toMatchObject({
      total: 10_162_655,
      inForceSince: "2027-01-01",
      scheduledChange: null,
    });
  });

  it("a tumpang under an existing Hak Pakai: the tumpang Biaya Pemakaman + one Biaya Layanan Platform; without a tumpang amount, the Biaya Pemakaman", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra } = await pricedLokasiMitra(setup);
    const tumpang = [{ kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: true }] as const;

    expect(await setup.tariffs.quote(tumpang, wib("2026-10-05 10:00"))).toMatchObject({
      lines: [
        { kind: "biaya_pemakaman", amount: 1_250_003, tumpang: true },
        { kind: "biaya_layanan_platform", amount: 150_001 },
      ],
      total: 1_400_004,
    });

    await setup.tariffs.setBiayaPemakaman(admin, lokasiMitra.id, {
      biayaPemakaman: 1_987_655,
      biayaPemakamanTumpang: null,
      effectiveOn: "2026-11-01",
      reason: null,
    });
    expect(await setup.tariffs.quote(tumpang, wib("2026-11-01 10:00"))).toMatchObject({
      lines: [{ amount: 1_987_655 }, { amount: 150_001 }],
      total: 2_137_656,
    });
  });

  it("a Perpanjangan Makam of 2 terms: the Perpanjangan price per term × 2 + one Biaya Layanan Platform", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { lokasiMitra, reguler } = await pricedLokasiMitra(setup);

    expect(
      await setup.tariffs.quote(
        [{ kind: "perpanjangan", jenisMakamId: reguler.id, tenure: { kind: "tahun", years: 5 }, terms: 2 }],
        wib("2026-10-05 10:00"),
      ),
    ).toMatchObject({
      ok: true,
      lines: [
        {
          kind: "perpanjangan",
          jenisMakamName: "Reguler",
          amount: 6_000_002,
          terms: 2,
          provider: { kind: "lokasi_mitra", lokasiId: lokasiMitra.id },
        },
        { kind: "biaya_layanan_platform", amount: 150_001, provider: { kind: "operator" } },
      ],
      total: 6_150_003,
    });
  });

  it("TPU-only lines carry no Biaya Layanan Platform: a Saat Duka Pengurusan at a DKI TPU is the burial Biaya Pengurusan + the Retribusi Pemda (Rp 0)", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin } = await pricedLokasiMitra(setup);
    const at = { effectiveOn: "2026-10-01", reason: null };
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_pengurusan_pemakaman", amount: 1_500_007, ...at });
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_pengurusan_berkas", amount: 750_003, ...at });
    await setup.tariffs.setGlobalTariff(admin, { key: "retribusi_pemda_iptm", amount: 0, ...at });

    expect(
      await setup.tariffs.quote(
        [
          { kind: "biaya_pengurusan", pengurusan: "pemakaman" },
          { kind: "retribusi_pemda", retribusi: "iptm" },
        ],
        wib("2026-10-05 10:00"),
      ),
    ).toEqual({
      ok: true,
      at: wib("2026-10-05 10:00"),
      lines: [
        expect.objectContaining({ kind: "biaya_pengurusan", pengurusan: "pemakaman", amount: 1_500_007, provider: { kind: "operator" } }),
        expect.objectContaining({ kind: "retribusi_pemda", retribusi: "iptm", amount: 0, provider: { kind: "pemda" }, setorRetribusi: false }),
      ],
      total: 1_500_007,
      inForceSince: "2026-10-01",
      scheduledChange: null,
    });
    expect(
      await setup.tariffs.quote([{ kind: "biaya_pengurusan", pengurusan: "berkas" }], wib("2026-10-05 10:00")),
    ).toMatchObject({ lines: [{ kind: "biaya_pengurusan", pengurusan: "berkas", amount: 750_003 }], total: 750_003 });
  });

  it("is refused when a line has no tariff in force at that instant: a future first version, or no Biaya Layanan Platform yet", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const created = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, {
      name: "Reguler",
      description: "",
      tariff: { hargaHakPakai: 7_500_000, tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 3_000_000, effectiveOn: "2026-11-01" },
      reason: null,
    });
    if (!created.ok) throw new Error(created.reason);
    const hakPakai = [{ kind: "harga_hak_pakai", jenisMakamId: created.jenisMakam.id }] as const;

    expect(await setup.tariffs.quote(hakPakai, wib("2026-10-31 23:59"))).toEqual({
      ok: false,
      reason: "tarif_belum_ada",
      kind: "harga_hak_pakai",
    });
    expect(await setup.tariffs.quote(hakPakai, wib("2026-11-01 00:00"))).toEqual({
      ok: false,
      reason: "tarif_belum_ada",
      kind: "biaya_layanan_platform",
    });
    expect(
      await setup.tariffs.quote([{ kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: false }], wib("2026-11-01 00:00")),
    ).toEqual({ ok: false, reason: "tarif_belum_ada", kind: "biaya_pemakaman" });
  });

  it("is refused for no lines, an unknown Jenis Makam, a Jenis Makam id that is no id, a Perpanjangan of a Selamanya Jenis Makam, or a number of terms that is not a whole number from 1", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { reguler, selamanya } = await pricedLokasiMitra(setup);
    const at = wib("2026-10-05 10:00");

    expect(await setup.tariffs.quote([], at)).toEqual({ ok: false, reason: "tanpa_baris" });
    expect(
      await setup.tariffs.quote([{ kind: "harga_hak_pakai", jenisMakamId: "5d1f4c2e-0000-4000-8000-00000000abcd" }], at),
    ).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect(
      await setup.tariffs.quote([{ kind: "perpanjangan", jenisMakamId: selamanya.id, tenure: { kind: "selamanya" }, terms: 1 }], at),
    ).toEqual({ ok: false, reason: "tidak_bisa_diperpanjang" });
    expect(await setup.tariffs.quote([{ kind: "harga_hak_pakai", jenisMakamId: "reguler" }], at)).toEqual({
      ok: false,
      reason: "baris_tidak_valid",
    });
    for (const terms of [0, 1.5, -1]) {
      expect(
        await setup.tariffs.quote([{ kind: "perpanjangan", jenisMakamId: reguler.id, tenure: { kind: "tahun", years: 5 }, terms }], at),
      ).toEqual({
        ok: false,
        reason: "baris_tidak_valid",
      });
    }
  });

  it("is refused when its lines belong to more than one place: two Lokasi Mitra, or a Lokasi Mitra and a TPU (one Tagihan, one place)", async () => {
    const setup = tariffsOnTestDatabase(db);
    const first = await pricedLokasiMitra(setup);
    const { actor: admin } = { actor: first.admin };
    const second = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    await setup.tariffs.setBiayaPemakaman(admin, second.id, {
      biayaPemakaman: 1_000_000,
      biayaPemakamanTumpang: null,
      effectiveOn: "2026-10-01",
      reason: null,
    });
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_pengurusan_pemakaman", amount: 1_500_000, effectiveOn: "2026-10-01", reason: null });
    const at = wib("2026-10-05 10:00");

    expect(
      await setup.tariffs.quote(
        [
          { kind: "harga_hak_pakai", jenisMakamId: first.reguler.id },
          { kind: "biaya_pemakaman", lokasiId: second.id, tumpang: false },
        ],
        at,
      ),
    ).toEqual({ ok: false, reason: "lokasi_campur" });
    expect(
      await setup.tariffs.quote(
        [
          { kind: "harga_hak_pakai", jenisMakamId: first.reguler.id },
          { kind: "biaya_pengurusan", pengurusan: "pemakaman" },
        ],
        at,
      ),
    ).toEqual({ ok: false, reason: "lokasi_campur" });
  });

  it("a non-zero Retribusi Pemda is collected at cost as its own line and marked for a Setor Retribusi", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin } = await pricedLokasiMitra(setup);
    await setup.tariffs.setGlobalTariff(admin, { key: "retribusi_pemda_iptm", amount: 0, effectiveOn: "2026-10-01", reason: null });
    await setup.tariffs.setGlobalTariff(admin, { key: "retribusi_pemda_iptm", amount: 125_000, effectiveOn: "2027-01-01", reason: "Perda baru" });

    expect(await setup.tariffs.quote([{ kind: "retribusi_pemda", retribusi: "iptm" }], wib("2027-01-02 10:00"))).toMatchObject({
      lines: [{ kind: "retribusi_pemda", amount: 125_000, setorRetribusi: true }],
      total: 125_000,
    });
  });

  it("is refused rather than rounded when its total would pass Rp 100.000.000.000 (jumlah_terlalu_besar); exactly that much is quoted", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra } = await pricedLokasiMitra(setup);
    const created = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, {
      name: "Mausoleum",
      description: "",
      tariff: { hargaHakPakai: 99_999_849_999, tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 50_000_000_000, effectiveOn: "2026-10-01" },
      reason: null,
    });
    if (!created.ok) throw new Error(created.reason);
    const at = wib("2026-10-05 10:00");
    const mausoleum = created.jenisMakam.id;

    expect(await setup.tariffs.quote([{ kind: "harga_hak_pakai", jenisMakamId: mausoleum }], at)).toMatchObject({
      ok: true,
      total: 100_000_000_000,
    });
    expect(
      await setup.tariffs.quote(
        [
          { kind: "harga_hak_pakai", jenisMakamId: mausoleum },
          { kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: false },
        ],
        at,
      ),
    ).toEqual({ ok: false, reason: "jumlah_terlalu_besar" });
    expect(
      await setup.tariffs.quote([{ kind: "perpanjangan", jenisMakamId: mausoleum, tenure: { kind: "tahun", years: 5 }, terms: 2 }], at),
    ).toEqual({ ok: false, reason: "jumlah_terlalu_besar" });
  });

  describe("a Perpanjangan Makam: the term from the Hak Pakai as bought, the price per term in force now", () => {
    const fiveYears = { kind: "tahun", years: 5 } as const;

    it("the Jenis Makam later becomes 10 years: an existing 5-year Hak Pakai is still extended per 5-year term, at the Perpanjangan price in force now", async () => {
      const setup = tariffsOnTestDatabase(db);
      const { admin, reguler } = await pricedLokasiMitra(setup);
      await setup.tariffs.setJenisMakamTariff(admin, reguler.id, {
        hargaHakPakai: 12_000_000,
        tenure: { kind: "tahun", years: 10 },
        hargaPerpanjangan: 4_000_003,
        effectiveOn: "2026-11-01",
        reason: null,
      });

      expect(
        await setup.tariffs.quote([{ kind: "perpanjangan", jenisMakamId: reguler.id, tenure: fiveYears, terms: 2 }], wib("2026-11-05 10:00")),
      ).toMatchObject({
        ok: true,
        lines: [
          { kind: "perpanjangan", tenure: fiveYears, terms: 2, amount: 8_000_006, inForceSince: "2026-11-01" },
          { kind: "biaya_layanan_platform", amount: 150_001 },
        ],
        total: 8_150_007,
      });
    });

    it("the Jenis Makam later becomes Selamanya: an existing 5-year Hak Pakai is still extended per 5-year term, at the Perpanjangan price in force now", async () => {
      const setup = tariffsOnTestDatabase(db);
      const { admin, reguler } = await pricedLokasiMitra(setup);
      await setup.tariffs.setJenisMakamTariff(admin, reguler.id, {
        hargaHakPakai: 30_000_000,
        tenure: { kind: "selamanya" },
        hargaPerpanjangan: 3_500_000,
        effectiveOn: "2026-11-01",
        reason: null,
      });

      expect(
        await setup.tariffs.quote([{ kind: "perpanjangan", jenisMakamId: reguler.id, tenure: fiveYears, terms: 1 }], wib("2026-11-05 10:00")),
      ).toMatchObject({
        ok: true,
        lines: [{ kind: "perpanjangan", tenure: fiveYears, terms: 1, amount: 3_500_000 }, { kind: "biaya_layanan_platform" }],
        total: 3_650_001,
      });
    });

    it("the scheduled change of a Perpanjangan is the next Perpanjangan price, whatever tenure the Jenis Makam takes then", async () => {
      const setup = tariffsOnTestDatabase(db);
      const { admin, reguler } = await pricedLokasiMitra(setup);
      await setup.tariffs.setJenisMakamTariff(admin, reguler.id, {
        hargaHakPakai: 30_000_000,
        tenure: { kind: "selamanya" },
        hargaPerpanjangan: 3_500_000,
        effectiveOn: "2026-11-01",
        reason: null,
      });

      expect(
        await setup.tariffs.quote([{ kind: "perpanjangan", jenisMakamId: reguler.id, tenure: fiveYears, terms: 1 }], wib("2026-10-05 10:00")),
      ).toMatchObject({
        lines: [{ amount: 3_000_001, scheduledChange: { effectiveOn: "2026-11-01", amount: 3_500_000 } }, {}],
        scheduledChange: { effectiveOn: "2026-11-01", total: 3_650_001 },
      });
    });

    it("is refused only when the Hak Pakai itself is Selamanya, even when its Jenis Makam is N years now", async () => {
      const setup = tariffsOnTestDatabase(db);
      const { reguler } = await pricedLokasiMitra(setup);

      expect(
        await setup.tariffs.quote(
          [{ kind: "perpanjangan", jenisMakamId: reguler.id, tenure: { kind: "selamanya" }, terms: 1 }],
          wib("2026-10-05 10:00"),
        ),
      ).toEqual({ ok: false, reason: "tidak_bisa_diperpanjang" });
    });

    it("has no price when the Jenis Makam in force has no Perpanjangan price (Selamanya without one): tarif_belum_ada", async () => {
      const setup = tariffsOnTestDatabase(db);
      const { reguler, admin } = await pricedLokasiMitra(setup);
      await setup.tariffs.setJenisMakamTariff(admin, reguler.id, {
        hargaHakPakai: 30_000_000,
        tenure: { kind: "selamanya" },
        hargaPerpanjangan: null,
        effectiveOn: "2026-11-01",
        reason: null,
      });

      expect(
        await setup.tariffs.quote([{ kind: "perpanjangan", jenisMakamId: reguler.id, tenure: fiveYears, terms: 1 }], wib("2026-11-05 10:00")),
      ).toEqual({ ok: false, reason: "tarif_belum_ada", kind: "perpanjangan" });
    });
  });
});
