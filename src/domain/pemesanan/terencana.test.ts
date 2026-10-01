import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { refusable } from "@/db/unit-of-work";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { pemesananOnTestDatabase, pemesanDenganEmail, unitIds, type PemesananSetup } from "../../../tests/support/pemesanan";
import { signedInAdminPlatform } from "../../../tests/support/publish";
import { terencanaLokasi } from "../../../tests/support/terencana";
import { HARGA_BANDS } from "./terencana";
import { DEFAULT_FLAGS, DEFAULT_POLICIES } from "@/domain/lokasi";
import { QRIS_PAYMENT_CAP, withinPaymentCap } from "@/domain/billing";
import type { TerencanaOptions } from "../../../tests/support/terencana";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const pemesanan = {
  pemesanName: "Rina Wulandari",
  phoneNumber: "081234567890",
  pemegangHak: { mode: "pemesan" },
  calonPenghuni: { mode: "saya" },
} as const;

/** A Terencana-ready Lokasi Mitra and a Pemesan with an Akun, the usual starting point of a placement. */
async function siap(setup: PemesananSetup, options?: TerencanaOptions) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const fixture = await terencanaLokasi(setup, admin, options);
  return { fixture, pemesan: (await pemesanDenganEmail(setup, "kelarga@contoh.id")).pemesan };
}

/** What the picker sends the domain: the chosen plots as ids. */
function units(pilihan: { petak?: string[]; kavling?: string }) {
  return [...(pilihan.petak ?? []).map((petakId) => ({ petakId })), ...(pilihan.kavling ? [{ kavlingId: pilihan.kavling }] : [])];
}

describe("the Terencana wizard's Lokasi step", () => {
  it("lists only Lokasi Mitra that take Pemesanan Terencana, with their cheapest price and what may be picked", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);
    setup.clock.advance({ minutes: 2 });
    // Listed, but with "Pemesanan Terencana aktif" off, so it is no card here.
    const tanpaTerencana = await terencanaLokasi(setup, admin, { name: "Makam Tanpa Terencana", terencana: false });

    const pilihan = await setup.pemesanan.pilihanTerencana();

    expect(pilihan.map((satu) => satu.lokasi.name)).toEqual([fixture.lokasiMitra.name]);
    expect(pilihan.map((satu) => satu.lokasi.id)).not.toContain(tanpaTerencana.lokasiMitra.id);
    expect(pilihan[0]).toMatchObject({ mulaiDari: 2_650_000, tersedia: 5 });
    expect(pilihan[0].lokasi.kunjungan?.visitedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("names the price bands of the Lokasi step without overlap: each starts where the one before ends", () => {
    expect(HARGA_BANDS.map((band) => band.label)).toEqual(["Hingga Rp 3 jt", "Rp 3–6 jt", "Di atas Rp 6 jt sampai Rp 10 jt"]);
    expect(HARGA_BANDS.at(-1)?.until).toBe(QRIS_PAYMENT_CAP);
  });

  it("never shows a starting price v1 could not be paid for: a Jenis Makam above the QRIS cap is no card price at all", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    // Rp 12.000.000 all-in is past the cap, so this Lokasi Mitra has nothing a Pemesan can actually order.
    const mahal = await terencanaLokasi(setup, admin, { hargaHakPakai: 11_850_000 });

    const pilihan = await setup.pemesanan.pilihanTerencana();

    expect(pilihan.find((satu) => satu.lokasi.id === mahal.lokasiMitra.id)).toMatchObject({ mulaiDari: null, tersedia: 5 });
    // It is in no price band at all: nothing here is buyable, so no filter may claim it.
    expect(await setup.pemesanan.pilihanTerencana({ harga: "hingga_3_juta" })).toEqual([]);
    expect(await setup.pemesanan.pilihanTerencana({ harga: "3_sampai_6_juta" })).toEqual([]);
    expect(await setup.pemesanan.pilihanTerencana({ harga: "di_atas_6_juta" })).toEqual([]);
    expect(QRIS_PAYMENT_CAP).toBe(10_000_000);
  });

  it("filters by city, by the all-in price band and by facilities", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await terencanaLokasi(setup, admin);

    expect(await setup.pemesanan.pilihanTerencana({ city: "Kota Jakarta Timur" })).toHaveLength(1);
    expect(await setup.pemesanan.pilihanTerencana({ city: "Kota Bandung" })).toHaveLength(0);
    expect(await setup.pemesanan.pilihanTerencana({ harga: "hingga_3_juta" })).toHaveLength(1);
    expect(await setup.pemesanan.pilihanTerencana({ harga: "3_sampai_6_juta" })).toHaveLength(0);
    expect(await setup.pemesanan.pilihanTerencana({ harga: "di_atas_6_juta" })).toHaveLength(0);
    expect(await setup.pemesanan.pilihanTerencana({ facilities: ["parkir"] })).toHaveLength(1);
    expect(await setup.pemesanan.pilihanTerencana({ facilities: ["musala"] })).toHaveLength(0);
  });

  it("names the cities that have a Lokasi Mitra taking Terencana orders", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await terencanaLokasi(setup, admin);

    expect(await setup.pemesanan.kotaTerencana()).toEqual(["Kota Jakarta Timur"]);
  });
});

describe("the Terencana wizard's Petak step", () => {
  it("prices a selection with quote(): one Harga Hak Pakai per unit, one Biaya Layanan Platform, and the burial cost kept for later", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture } = await siap(setup);
    await unitIds(setup, fixture, ["A-01", "A-02"]);

    // The read takes the chosen plots as their Nomor Makam, the way the wizard's URL carries them.
    const denah = await setup.pemesanan.denahTerencana(fixture.lokasiMitra.id, { petak: ["A-01", "A-02"], kavling: null });

    // One Biaya Layanan Platform of 150.000 for the whole Tagihan, never one per plot.
    expect(denah?.total).toEqual({
      lines: [
        { kind: "harga_hak_pakai", nomor: "A-01", amount: 2_500_000 },
        { kind: "harga_hak_pakai", nomor: "A-02", amount: 2_500_000 },
        { kind: "biaya_layanan_platform", nomor: null, amount: 150_000 },
      ],
      total: 5_150_000,
      dalamBatas: true,
    });
    // The "Nanti" line: Biaya Pemakaman 2.000.000 plus the same one Biaya Layanan Platform.
    expect(denah?.nanti).toEqual({
      total: 2_150_000,
      lines: [
        { kind: "biaya_pemakaman", nomor: null, amount: 2_000_000 },
        { kind: "biaya_layanan_platform", nomor: null, amount: 150_000 },
      ],
    });
    expect(denah?.syarat).toEqual({ masaPembatalanDays: 7, refundAfterMasaPembatalanPercent: 0, hakDengan: "lokasi_mitra", lokasiNama: fixture.lokasiMitra.name });
    expect(denah?.kontakSiaga).not.toBeNull();
    expect(denah?.tersedia).toBe(5);
    expect(denah?.blok.map((satu) => [satu.name, satu.tersedia])).toEqual([
      ["A", 5],
      ["B", 0],
    ]);
  });

  it("says a selection v1 cannot take is over the Rp 10.000.000 QRIS cap, with the total that says why", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture } = await siap(setup);
    await unitIds(setup, fixture, ["A-01", "A-02", "A-07", "A-08", "A-K01"]);

    const denah = await setup.pemesanan.denahTerencana(fixture.lokasiMitra.id, { petak: [], kavling: "A-K01" });
    const empat = await setup.pemesanan.denahTerencana(fixture.lokasiMitra.id, { petak: ["A-01", "A-02", "A-07", "A-08"], kavling: null });

    // One Kavling Keluarga of 2.500.000 plus the platform fee: within the cap.
    expect(denah?.total).toMatchObject({ total: 2_650_000, dalamBatas: true });
    // Four Petak plus the one platform fee is Rp 10.150.000, a rupiah past it.
    expect(empat?.total).toMatchObject({ total: 10_150_000, dalamBatas: false });
  });

  it("is no Denah at a Lokasi Mitra that does not take Terencana orders", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const tanpaTerencana = await terencanaLokasi(setup, admin, { terencana: false });

    expect(await setup.pemesanan.denahTerencana(tanpaTerencana.lokasiMitra.id)).toBeNull();
    expect(await setup.pemesanan.denahTerencana("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("checking a selection before the family leaves the Denah", () => {
  it("accepts a selection that is still whole, and names the plots that went, keeping the rest", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const semua = await unitIds(setup, fixture, ["A-01", "A-02", "A-07"]);
    const hasil = await setup.pemesanan.periksaPilihanTerencana({ lokasiId: fixture.lokasiMitra.id, units: units({ petak: [semua["A-01"], semua["A-02"]] }) });

    expect(hasil).toEqual({ ok: true });

    // A-02 is taken by someone else in the meantime: the check says which, and offers the rest.
    const dipesan = await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: units({ petak: [semua["A-01"], semua["A-07"]] }) });
    if (!dipesan.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(dipesan)}`);
    const setelah = await setup.pemesanan.periksaPilihanTerencana({
      lokasiId: fixture.lokasiMitra.id,
      units: units({ petak: [semua["A-01"], semua["A-02"]] }),
    });

    // A-01 is the one that went; A-02, the other pick, is still good and is handed back.
    expect(setelah).toMatchObject({ ok: false, reason: "sudah_dipesan", nomor: "A-01", sisa: [{ jenis: "petak", nomor: "A-02" }] });
  });

  it("refuses a mixed selection and a plot named twice, naming the plot, before anything is held", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture } = await siap(setup);
    const semua = await unitIds(setup, fixture, ["A-01", "A-K01"]);

    expect(await setup.pemesanan.periksaPilihanTerencana({ lokasiId: fixture.lokasiMitra.id, units: units({ petak: [semua["A-01"]], kavling: semua["A-K01"] }) })).toEqual({
      ok: false,
      reason: "unit_campur",
      nomor: null,
      sisa: [],
    });
    expect(await setup.pemesanan.periksaPilihanTerencana({ lokasiId: fixture.lokasiMitra.id, units: units({ petak: [semua["A-01"], semua["A-01"]] }) })).toEqual({
      ok: false,
      reason: "unit_ganda",
      nomor: "A-01",
      sisa: [],
    });
  });
});

describe("placing a Pemesanan Terencana", () => {
  it("holds every chosen plot, comes back Diajukan with a Nomor Pemesanan, and announces the order", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const { "A-01": a01, "A-02": a02 } = await unitIds(setup, fixture, ["A-01", "A-02"]);

    const hasil = await setup.pemesanan.placeTerencana({
      ...pemesanan,
      pemesan: pemesanAkun,
      lokasiId: fixture.lokasiMitra.id,
      units: units({ petak: [a01, a02] }),
    });

    expect(hasil).toMatchObject({
      ok: true,
      pemesanan: {
        nomor: "MKM-2026-000001",
        status: "diajukan",
        lokasi: { id: fixture.lokasiMitra.id, name: fixture.lokasiMitra.name },
        pemesan: { name: "Rina Wulandari", email: "kelarga@contoh.id", phoneNumber: "+6281234567890" },
        calonPenghuni: { mode: "saya", name: null },
        unit: [
          { jenis: "petak", nomor: "A-01", jenisMakamName: "Reguler 2 × 1 m" },
          { jenis: "petak", nomor: "A-02", jenisMakamName: "Reguler 2 × 1 m" },
        ],
      },
    });
    // The plots are held, so the next family cannot pick them.
    const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
    const status = (nomor: string) => denah?.bloks.flatMap((blok) => blok.cells).find((cell) => cell.nomorMakam === nomor)?.status;
    expect([status("A-01"), status("A-02")]).toEqual(["sedang_dipesan", "sedang_dipesan"]);
    // The announcement carries what the Lokasi Mitra's staff need to confirm it: the
    // plots by the numbers the family knows, the Calon Penghuni and the Pemesan.
    expect(setup.terencana).toEqual([
      {
        id: expect.any(String),
        nomor: "MKM-2026-000001",
        lokasi: { id: fixture.lokasiMitra.id, name: fixture.lokasiMitra.name },
        unit: [
          { nomor: "A-01", jenisMakamName: "Reguler 2 \u00d7 1 m" },
          { nomor: "A-02", jenisMakamName: "Reguler 2 \u00d7 1 m" },
        ],
        calon: { name: "Rina Wulandari" },
        pemesan: { name: "Rina Wulandari", phoneNumber: "+6281234567890" },
        penerima: [{ accountId: fixture.adminLokasi.accountId }],
      },
    ]);
  });

  it("a declined or withdrawn order's plots are free for another family, which is what the hold's release is for", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01"]);
    const pesan = (pemesanOrder: typeof pemesanAkun) =>
      setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanOrder, lokasiId: fixture.lokasiMitra.id, units: units({ petak: [a01] }) });
    const placed = await pesan(pemesanAkun);
    if (!placed.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(placed)}`);

    // Ticket 37 declines the order and releases its hold in the same transaction as the status change.
    const dilepas = await refusable(setup.db, (tx) => setup.inventory.within(tx).lepasTahan(placed.pemesanan.nomor));
    setup.clock.advance({ minutes: 2 });
    const lagi = await pesan((await pemesanDenganEmail(setup, "kelarga.lain@contoh.id")).pemesan);

    expect(dilepas).toEqual({ ok: true, released: 1 });
    expect(lagi).toMatchObject({ ok: true, pemesanan: { nomor: "MKM-2026-000002" } });
  });

  it("reads back the order with the Syarat it was placed under, whatever the Lokasi Mitra's policy says later", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup, { masaPembatalanDays: 14, refundPercent: 25 });
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01"]);
    const hasil = await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: units({ petak: [a01] }) });
    if (!hasil.ok) throw new Error(`placeTerencana refused: ${hasil.reason}`);

    // A later policy change: a shorter Masa Pembatalan and no refund, with Terencana still on.
    const diubah = await setup.lokasi.setPoliciesAndFlags(fixture.admin, fixture.lokasiMitra.id, {
      policies: { ...DEFAULT_POLICIES, masaPembatalanDays: 3, refundAfterMasaPembatalanPercent: 0 },
      flags: { ...DEFAULT_FLAGS, pemesananTerencanaAktif: true, tumpang: { allowed: true, minYears: 3, maxLayers: 2 }, tumpangOnReleasedPlots: true },
    });
    if (!diubah.ok) throw new Error(`kebijakan refused: ${diubah.reason}`);

    const order = await setup.pemesanan.terencanaOf(hasil.pemesanan.nomor, pemesanAkun);
    const denah = await setup.pemesanan.denahTerencana(fixture.lokasiMitra.id);

    expect(order?.syarat).toEqual({ masaPembatalanDays: 14, refundAfterMasaPembatalanPercent: 25, hakDengan: "lokasi_mitra", lokasiNama: fixture.lokasiMitra.name });
    // The Lokasi page's own read does follow the new policy; the order does not.
    expect(denah?.syarat.masaPembatalanDays).toBe(3);
  });

  it("is nobody else's order to read", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01"]);
    const hasil = await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: units({ petak: [a01] }) });
    if (!hasil.ok) throw new Error(`placeTerencana refused: ${hasil.reason}`);
    setup.clock.advance({ minutes: 2 });
    const lain = (await pemesanDenganEmail(setup, "lain@contoh.id")).pemesan;

    expect(await setup.pemesanan.terencanaOf(hasil.pemesanan.nomor, pemesanAkun)).not.toBeNull();
    expect(await setup.pemesanan.terencanaOf(hasil.pemesanan.nomor, lain)).toBeNull();
    expect(await setup.pemesanan.terencanaOf("MKM-2026-999999", pemesanAkun)).toBeNull();
  });

  it("refuses a second order for a plot someone else took meanwhile, and leaves no order behind", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01", "A-02"]);
    const pesan = (units: { petakId?: string; kavlingId?: string }[], pemesanOrder: typeof pemesanAkun) =>
      setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanOrder, lokasiId: fixture.lokasiMitra.id, units });

    const [pertama, kedua] = await Promise.all([pesan([{ petakId: a01 }], pemesanAkun), pesan([{ petakId: a01 }], pemesanAkun)]);

    const refuses = [pertama, kedua].filter((hasil) => !hasil.ok);
    expect(pertama.ok !== kedua.ok).toBe(true);
    expect(refuses[0]).toMatchObject({ ok: false, reason: "sudah_dipesan", nomor: "A-01" });
    // The order that lost took nothing else with it: the second plot is free again.
    const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
    const status = (nomor: string) => denah?.bloks.flatMap((blok) => blok.cells).find((cell) => cell.nomorMakam === nomor)?.status;
    expect(status("A-02")).toBe("bisa_dipilih");
    expect(await setup.pemesanan.terencanaOf("MKM-2026-000002", pemesanAkun)).toBeNull();
  });

  it("refuses a plot that is not pickable, and a Lokasi Mitra that takes no Terencana orders", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const { "A-03": terisi, "A-04": tidakTersedia } = await unitIds(setup, fixture, ["A-03", "A-04"]);

    expect(await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: units({ petak: [terisi] }) })).toEqual({
      ok: false,
      reason: "unit_tidak_bisa_dipilih",
      nomor: "A-03",
      status: "terisi",
    });
    expect(await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: units({ petak: [tidakTersedia] }) })).toMatchObject({
      ok: false,
      reason: "unit_tidak_bisa_dipilih",
      nomor: "A-04",
    });
    expect(await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: "00000000-0000-0000-0000-000000000000", units: units({ petak: [terisi] }) })).toEqual({
      ok: false,
      reason: "lokasi_tidak_ada",
    });
    // A Petak that has been renumbered away since the link was shared.
    expect(await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: units({ petak: ["00000000-0000-0000-0000-000000000000"] }) })).toEqual({
      ok: false,
      reason: "unit_tidak_ditemukan",
    });
    expect(setup.terencana).toEqual([]);
  });

  it("refuses a crafted selection of a mixed or doubled kind by name, never with an empty plot number", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const semua = await unitIds(setup, fixture, ["A-01", "A-02", "A-K01"]);

    const campur = await setup.pemesanan.placeTerencana({
      ...pemesanan,
      pemesan: pemesanAkun,
      lokasiId: fixture.lokasiMitra.id,
      units: units({ petak: [semua["A-01"]], kavling: semua["A-K01"] }),
    });
    const ganda = await setup.pemesanan.placeTerencana({
      ...pemesanan,
      pemesan: pemesanAkun,
      lokasiId: fixture.lokasiMitra.id,
      units: units({ petak: [semua["A-02"], semua["A-02"]] }),
    });

    expect(campur).toEqual({ ok: false, reason: "unit_campur" });
    expect(ganda).toEqual({ ok: false, reason: "unit_ganda", nomor: "A-02" });
    expect(setup.terencana).toEqual([]);
  });

  it("refuses an id that is no plot here as unknown, doubled or not, and never answers with an empty number", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const semua = await unitIds(setup, fixture, ["A-01"]);
    const asing = "00000000-0000-0000-0000-000000000000";
    const pesan = (units: { petakId?: string; kavlingId?: string }[]) =>
      setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units });

    // The names are resolved against the Denah before any rule about their shape or
    // state is read, so a doubled id that names nothing at all is refused as unknown:
    // the module has no Nomor Makam to name, and no screen is shown an empty one.
    const doubled = await pesan([{ petakId: semua["A-01"] }, { petakId: asing }, { petakId: asing }]);
    const campur = await pesan([{ petakId: semua["A-01"] }, { kavlingId: asing }]);
    const satu = await pesan([{ petakId: asing }]);

    expect(doubled).toEqual({ ok: false, reason: "unit_tidak_ditemukan" });
    expect(campur).toEqual({ ok: false, reason: "unit_tidak_ditemukan" });
    expect(satu).toEqual({ ok: false, reason: "unit_tidak_ditemukan" });
    // Nothing was held and no order was written, so the real plot is still free.
    const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
    expect(denah?.bloks.flatMap((blok) => blok.cells).find((cell) => cell.nomorMakam === "A-01")?.status).toBe("bisa_dipilih");
    expect(setup.terencana).toEqual([]);
  });

  it("refuses a selection v1 cannot take, because its Tagihan would pass the Rp 10.000.000 QRIS cap", async () => {
    const setup = pemesananOnTestDatabase(db);
    // Four Petak Makam of 2.500.000 plus the one platform fee is Rp 10.150.000, a rupiah past the cap.
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const semua = await unitIds(setup, fixture, ["A-01", "A-02", "A-07", "A-08"]);

    const hasil = await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: units({ petak: [semua["A-01"], semua["A-02"], semua["A-07"], semua["A-08"]] }) });

    expect(withinPaymentCap(3 * 2_500_000 + 150_000)).toBe(true);
    expect(hasil).toEqual({ ok: false, reason: "melebihi_batas_qris", total: 4 * 2_500_000 + 150_000 });
    // Nothing was held, so the plots are still there for a smaller order.
    const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
    expect(denah?.bloks.flatMap((blok) => blok.cells).filter((cell) => cell.status === "sedang_dipesan")).toHaveLength(0);
  });

  it("refuses a Kode Masuk email that is not the Akun's own, and a phone number that is not Indonesian", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01"]);

    expect(await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: { accountId: pemesanAkun.accountId, email: "orang.lain@contoh.id" }, lokasiId: fixture.lokasiMitra.id, units: units({ petak: [a01] }) })).toEqual({
      ok: false,
      reason: "akun_tidak_cocok",
    });
    expect(await setup.pemesanan.placeTerencana({ ...pemesanan, phoneNumber: "+1 202 555 0143", pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: units({ petak: [a01] }) })).toEqual({
      ok: false,
      reason: "telepon_tidak_valid",
    });
    // The Pemegang Hak's own number is never quietly replaced by the Pemesan's.
    expect(
      await setup.pemesanan.placeTerencana({
        ...pemesanan,
        pemesan: pemesanAkun,
        lokasiId: fixture.lokasiMitra.id,
        units: units({ petak: [a01] }),
        pemegangHak: { mode: "lain", name: "Bapak Sutrisno", phoneNumber: "+1 202 555 0143", email: "" },
      }),
    ).toEqual({ ok: false, reason: "telepon_pemegang_hak_tidak_valid" });
  });

  it("records the Pemegang Hak the Pemesan named, with their own contact", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01"]);

    const hasil = await setup.pemesanan.placeTerencana({
      ...pemesanan,
      pemesan: pemesanAkun,
      lokasiId: fixture.lokasiMitra.id,
      units: units({ petak: [a01] }),
      pemegangHak: { mode: "lain", name: "Bapak Sutrisno", phoneNumber: "081298765432", email: "Sutrisno@Contoh.ID" },
      calonPenghuni: { mode: "lain", name: "Neneng Sutrisno" },
    });

    expect(hasil).toMatchObject({
      ok: true,
      pemesanan: {
        pemegangHak: { mode: "lain", name: "Bapak Sutrisno", phoneNumber: "+6281298765432", email: "sutrisno@contoh.id" },
        calonPenghuni: { mode: "lain", name: "Neneng Sutrisno" },
      },
    });
  });
});
