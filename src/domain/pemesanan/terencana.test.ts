import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { pemesananOnTestDatabase, pemesan, unitIds, type PemesananSetup } from "../../../tests/support/pemesanan";
import { signedInAdminPlatform } from "../../../tests/support/publish";
import { terencanaLokasi } from "../../../tests/support/terencana";
import { DEFAULT_FLAGS, DEFAULT_POLICIES } from "@/domain/lokasi";
import { withinPaymentCap } from "@/domain/billing/batas";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const pemesanan = {
  pemesanName: "Rina Wulandari",
  phoneNumber: "081234567890",
  pemegangHak: { mode: "pemesan", name: "Rina Wulandari" },
  calonPenghuni: { mode: "saya" },
} as const;

/** A Terencana-ready Lokasi Mitra and a Pemesan with an Akun, the usual starting point of a placement. */
async function siap(setup: PemesananSetup, options?: Parameters<typeof terencanaLokasi>[2]) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const fixture = await terencanaLokasi(setup, admin, options);
  return { fixture, pemesan: await pemesan(setup) };
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

  it("filters by city, by the all-in price band and by facilities", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await terencanaLokasi(setup, admin);

    expect(await setup.pemesanan.pilihanTerencana({ city: "Kota Jakarta Timur" })).toHaveLength(1);
    expect(await setup.pemesanan.pilihanTerencana({ city: "Kota Bandung" })).toHaveLength(0);
    expect(await setup.pemesanan.pilihanTerencana({ harga: "hingga_10_juta" })).toHaveLength(1);
    expect(await setup.pemesanan.pilihanTerencana({ harga: "di_atas_25_juta" })).toHaveLength(0);
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
  it("prices every unit with quote(), adds the one Biaya Layanan Platform to the selection, and keeps the burial cost for later", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture } = await siap(setup);

    const denah = await setup.pemesanan.denahTerencana(fixture.lokasiMitra.id);

    // One Harga Hak Pakai of 2.500.000 and one Biaya Layanan Platform of 150.000, both from quote().
    expect(denah?.harga).toEqual([{ jenisMakamId: fixture.jenisMakam.id, jenisMakamName: "Reguler 2 × 1 m", hargaHakPakai: 2_500_000, biayaLayananPlatform: 150_000 }]);
    // The "Nanti" line: Biaya Pemakaman 2.000.000 + the same one Biaya Layanan Platform.
    expect(denah?.nanti?.total).toBe(2_150_000);
    expect(denah?.nanti?.lines.map((line) => line.kind)).toEqual(["biaya_pemakaman", "biaya_layanan_platform"]);
    expect(denah?.syarat).toEqual({ masaPembatalanDays: 7, refundAfterMasaPembatalanPercent: 0, hakDengan: "lokasi_mitra", lokasiNama: fixture.lokasiMitra.name });
    expect(denah?.kontakSiaga).not.toBeNull();
  });

  it("is no Denah at a Lokasi Mitra that does not take Terencana orders", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const tanpaTerencana = await terencanaLokasi(setup, admin, { terencana: false });

    expect(await setup.pemesanan.denahTerencana(tanpaTerencana.lokasiMitra.id)).toBeNull();
    expect(await setup.pemesanan.denahTerencana("00000000-0000-0000-0000-000000000000")).toBeNull();
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
      units: [{ petakId: a01 }, { petakId: a02 }],
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
    expect(setup.notifikasi.diumumkan).toEqual([{ nomor: "MKM-2026-000001", lokasiId: fixture.lokasiMitra.id, email: "kelarga@contoh.id" }]);
  });

  it("reads back the order with the Syarat it was placed under, whatever the Lokasi Mitra's policy says later", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup, { masaPembatalanDays: 14, refundPercent: 25 });
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01"]);
    const hasil = await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: [{ petakId: a01 }] });
    if (!hasil.ok) throw new Error(`placeTerencana refused: ${hasil.reason}`);

    // A later policy change: a shorter Masa Pembatalan and no refund, with Terencana still on.
    const diubah = await setup.lokasi.setPoliciesAndFlags(fixture.admin, fixture.lokasiMitra.id, {
      policies: { ...DEFAULT_POLICIES, masaPembatalanDays: 3, refundAfterMasaPembatalanPercent: 0 },
      flags: { ...DEFAULT_FLAGS, pemesananTerencanaAktif: true, tumpang: { allowed: true, minYears: 3, maxLayers: 2 }, tumpangOnReleasedPlots: true },
    });
    if (!diubah.ok) throw new Error(`kebijakan refused: ${diubah.reason}`);

    const order = await setup.pemesanan.terencanaOf(setup.db, pemesanAkun, hasil.pemesanan.nomor);
    const denah = await setup.pemesanan.denahTerencana(fixture.lokasiMitra.id);

    expect(order?.syarat).toEqual({ masaPembatalanDays: 14, refundAfterMasaPembatalanPercent: 25, hakDengan: "lokasi_mitra", lokasiNama: fixture.lokasiMitra.name });
    // The Lokasi page's own read does follow the new policy; the order does not.
    expect(denah?.syarat.masaPembatalanDays).toBe(3);
  });

  it("is nobody else's order to read", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01"]);
    const hasil = await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: [{ petakId: a01 }] });
    if (!hasil.ok) throw new Error(`placeTerencana refused: ${hasil.reason}`);
    setup.clock.advance({ minutes: 2 });
    const lain = await pemesan(setup, "lain@contoh.id");

    expect(await setup.pemesanan.terencanaOf(setup.db, pemesanAkun, hasil.pemesanan.nomor)).not.toBeNull();
    expect(await setup.pemesanan.terencanaOf(setup.db, lain, hasil.pemesanan.nomor)).toBeNull();
    expect(await setup.pemesanan.terencanaOf(setup.db, pemesanAkun, "MKM-2026-999999")).toBeNull();
  });

  it("refuses a second order for a plot someone else took meanwhile, and leaves no order behind", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const { "A-01": a01 } = await unitIds(setup, fixture, ["A-01"]);
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
    expect(await setup.pemesanan.terencanaOf(setup.db, pemesanAkun, "MKM-2026-000002")).toBeNull();
  });

  it("refuses a plot that is not pickable, and a Lokasi Mitra that takes no Terencana orders", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const { "A-03": terisi, "A-04": tidakTersedia } = await unitIds(setup, fixture, ["A-03", "A-04"]);

    expect(await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: [{ petakId: terisi }] })).toEqual({
      ok: false,
      reason: "unit_tidak_bisa_dipilih",
      nomor: "A-03",
      status: "terisi",
    });
    expect(await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: [{ petakId: tidakTersedia }] })).toMatchObject({
      ok: false,
      reason: "unit_tidak_bisa_dipilih",
      nomor: "A-04",
    });
    expect(await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: "00000000-0000-0000-0000-000000000000", units: [{ petakId: terisi }] })).toEqual({
      ok: false,
      reason: "lokasi_tidak_ada",
    });
    // A Petak that has been renumbered away since the link was shared.
    expect(await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: [{ petakId: "00000000-0000-0000-0000-000000000000" }] })).toEqual({
      ok: false,
      reason: "unit_tidak_ditemukan",
    });
    expect(setup.notifikasi.diumumkan).toEqual([]);
  });

  it("refuses a selection v1 cannot take, because its Tagihan would pass the Rp 10.000.000 QRIS cap", async () => {
    const setup = pemesananOnTestDatabase(db);
    // Four Petak Makam of 2.500.000 plus the one platform fee is Rp 10.150.000, a rupiah past the cap.
    const { fixture, pemesan: pemesanAkun } = await siap(setup);
    const semua = await unitIds(setup, fixture, ["A-01", "A-02", "A-07", "A-08"]);

    const hasil = await setup.pemesanan.placeTerencana({
      ...pemesanan,
      pemesan: pemesanAkun,
      lokasiId: fixture.lokasiMitra.id,
      units: [{ petakId: semua["A-01"] }, { petakId: semua["A-02"] }, { petakId: semua["A-07"] }, { petakId: semua["A-08"] }],
    });

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

    expect(await setup.pemesanan.placeTerencana({ ...pemesanan, pemesan: { accountId: pemesanAkun.accountId, email: "orang.lain@contoh.id" }, lokasiId: fixture.lokasiMitra.id, units: [{ petakId: a01 }] })).toEqual({
      ok: false,
      reason: "akun_tidak_cocok",
    });
    expect(await setup.pemesanan.placeTerencana({ ...pemesanan, phoneNumber: "+1 202 555 0143", pemesan: pemesanAkun, lokasiId: fixture.lokasiMitra.id, units: [{ petakId: a01 }] })).toEqual({
      ok: false,
      reason: "telepon_tidak_valid",
    });
    // The Pemegang Hak's own number is never quietly replaced by the Pemesan's.
    expect(
      await setup.pemesanan.placeTerencana({
        ...pemesanan,
        pemesan: pemesanAkun,
        lokasiId: fixture.lokasiMitra.id,
        units: [{ petakId: a01 }],
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
      units: [{ petakId: a01 }],
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
