/**
 * Data Contoh (ticket 109): the registry of the example records a beta shows on
 * a stack, and the retiring of all of them at once. Driven only through the
 * module's public functions and read back through the neighbours' own public
 * reads (the public listing, the staff accounts, the tariff in force).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pesananBerjalanDiLokasi } from "@/domain/pemesanan";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { adminPlatformOf } from "../../../tests/support/identity";
import { pemesananOnTestDatabase, pemesanDenganEmail, siapkanOperatorPemesanan, unitIds } from "../../../tests/support/pemesanan";
import { newLokasiMitra, publishedLokasiMitra, signedInAdminLokasi, type PublishSetup } from "../../../tests/support/publish";
import { terencanaLokasi } from "../../../tests/support/terencana";
import { createDataContoh, type DataContoh } from ".";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The module composed on the test Postgres, with its neighbours' real public functions. */
function dataContohOn(setup: PublishSetup): DataContoh {
  return createDataContoh({
    db,
    clock: setup.clock,
    audit: setup.audit,
    lokasi: setup.lokasi,
    identity: setup.identity,
    tariffs: setup.tariffs,
    pemesanan: { pesananBerjalanDiLokasi: (lokasiId) => pesananBerjalanDiLokasi({ db }, lokasiId) },
  });
}

async function setupDenganAdmin() {
  const setup = pemesananOnTestDatabase(db);
  const { actor: admin } = await adminPlatformOf(setup);
  return { setup, admin, dataContoh: dataContohOn(setup) };
}

const ALASAN = "data-contoh tanam (test)";

describe("the Data Contoh registry", () => {
  it("records a fixture code once: recording it again for the same entity changes nothing", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const lokasiMitra = await newLokasiMitra(setup, admin, "Taman Contoh (Contoh)");
    const entri = { kode: "rilis1/lokasi/taman-contoh", himpunan: "rilis1" as const, jenis: "lokasi_mitra" as const, entitasId: lokasiMitra.id, reason: ALASAN };

    const pertama = await dataContoh.catat(admin, entri);
    const kedua = await dataContoh.catat(admin, entri);

    expect(pertama).toMatchObject({ ok: true, baru: true });
    expect(kedua).toMatchObject({ ok: true, baru: false });
    expect((await dataContoh.status()).aktif).toHaveLength(1);
  });

  it("refuses to give one fixture code to a second entity while the first is still active", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const satu = await newLokasiMitra(setup, admin, "Satu (Contoh)");
    const dua = await newLokasiMitra(setup, admin, "Dua (Contoh)");
    const dasar = { kode: "rilis1/lokasi/satu", himpunan: "rilis1" as const, jenis: "lokasi_mitra" as const, reason: ALASAN };
    await dataContoh.catat(admin, { ...dasar, entitasId: satu.id });

    const hasil = await dataContoh.catat(admin, { ...dasar, entitasId: dua.id });

    expect(hasil).toMatchObject({ ok: false, reason: "kode_dipakai_entitas_lain" });
    expect((await dataContoh.status()).aktif.map((one) => one.entitasId)).toEqual([satu.id]);
  });

  it("is written only by Admin Platform", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);

    const hasil = await dataContoh.catat(adminLokasi, { kode: "rilis1/lokasi/x", himpunan: "rilis1", jenis: "lokasi_mitra", entitasId: lokasiMitra.id, reason: ALASAN });

    expect(hasil).toMatchObject({ ok: false, reason: "tidak_berwenang" });
    expect((await dataContoh.status()).aktif).toEqual([]);
  });

  it("says Data Contoh is active from the first entry until nothing active is left", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    expect(await dataContoh.aktif()).toBe(false);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await dataContoh.catat(admin, { kode: "rilis1/lokasi/x", himpunan: "rilis1", jenis: "lokasi_mitra", entitasId: lokasiMitra.id, reason: ALASAN });
    expect(await dataContoh.aktif()).toBe(true);

    const dicabut = await dataContoh.cabut(admin, { reason: "cabut (test)" });

    expect(dicabut.ok).toBe(true);
    expect(await dataContoh.aktif()).toBe(false);
  });
});

describe("tanam", () => {
  /** A one-Lokasi plan, built the way the command builds a fixture: the Lokasi first, then a child under it. */
  function rencanaLokasi(setup: PublishSetup, admin: Parameters<DataContoh["tanam"]>[0], hitung: { dibuat: number }, gagalSetelahDibuat = false) {
    return [
      {
        kode: "rilis1/lokasi/taman-contoh",
        jenis: "lokasi_mitra" as const,
        buat: async (ctx: Parameters<Parameters<DataContoh["tanam"]>[1]["rencana"][number]["buat"]>[0]) => {
          hitung.dibuat += 1;
          const dibuat = await setup.lokasi.createLokasiMitra(admin, { name: "Taman Contoh (Contoh)", pengelolaName: "Pengelola (Contoh)", address: "Jl. Contoh 1", city: "Bogor" });
          if (!dibuat.ok) return { ok: false as const, reason: dibuat.reason };
          await ctx.catatInduk(dibuat.lokasiMitra.id);
          if (gagalSetelahDibuat) return { ok: false as const, reason: "putus di tengah" };
          const jenisMakam = await setup.tariffs.createJenisMakam(admin, dibuat.lokasiMitra.id, {
            name: "Makam Standar (Contoh)",
            description: "Contoh",
            tariff: { hargaHakPakai: 5_000_000, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
            reason: ALASAN,
          });
          if (!jenisMakam.ok) return { ok: false as const, reason: jenisMakam.reason };
          await ctx.catatAnak({ kode: "rilis1/jenis-makam/taman-contoh/standar", jenis: "jenis_makam", entitasId: jenisMakam.jenisMakam.id });
          return { ok: true as const };
        },
      },
    ];
  }

  it("planting twice creates every fixture once: the second run finds each code active and creates nothing", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const hitung = { dibuat: 0 };

    const pertama = await dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana: rencanaLokasi(setup, admin, hitung) });
    const kedua = await dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana: rencanaLokasi(setup, admin, hitung) });

    expect(pertama).toMatchObject({ ok: true, dibuat: ["rilis1/lokasi/taman-contoh"], sudahAda: [] });
    expect(kedua).toMatchObject({ ok: true, dibuat: [], sudahAda: ["rilis1/lokasi/taman-contoh"] });
    expect(hitung.dibuat).toBe(1);
    const semua = await setup.lokasi.allLokasiMitra(admin);
    expect(semua.map((one) => one.name)).toEqual(["Taman Contoh (Contoh)"]);
    expect((await dataContoh.status()).aktif.map((one) => [one.jenis, one.lengkap]).sort()).toEqual([
      ["jenis_makam", true],
      ["lokasi_mitra", true],
    ]);
  });

  it("records nothing for a fixture whose build finds nothing to plant, and says so instead of counting it planted", async () => {
    const { admin, dataContoh } = await setupDenganAdmin();
    const rencana = [{ kode: "rilis1/tarif/biaya-layanan-platform", jenis: "tarif_global" as const, buat: async () => ({ ok: true as const }) }];

    const pertama = await dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana });
    const kedua = await dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana });

    for (const hasil of [pertama, kedua]) expect(hasil).toMatchObject({ ok: true, dibuat: [], sudahAda: [], dilewati: ["rilis1/tarif/biaya-layanan-platform"] });
    expect((await dataContoh.status()).aktif).toEqual([]);
    expect(await dataContoh.aktif()).toBe(false);
  });

  it("retires what a failed build had already created, so nothing half-built stays active", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const hitung = { dibuat: 0 };

    const hasil = await dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana: rencanaLokasi(setup, admin, hitung, true) });

    expect(hasil).toMatchObject({ ok: false, reason: "gagal", kode: "rilis1/lokasi/taman-contoh", alasan: "putus di tengah" });
    expect((await dataContoh.status()).aktif).toEqual([]);
    const [sisa] = await setup.lokasi.allLokasiMitra(admin);
    const profil = await setup.lokasi.lokasiMitra(admin, sisa.id);
    expect(profil.ok && profil.lokasiMitra.dataContoh).toBe(true);
  });

  it("plants a code again after a cabut, as a new entity, and leaves the retired one retired", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const hitung = { dibuat: 0 };
    await dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana: rencanaLokasi(setup, admin, hitung) });
    expect((await dataContoh.cabut(admin, { reason: "cabut (test)" })).ok).toBe(true);

    const lagi = await dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana: rencanaLokasi(setup, admin, hitung) });

    expect(lagi).toMatchObject({ ok: true, dibuat: ["rilis1/lokasi/taman-contoh"] });
    expect((await dataContoh.status()).aktif.filter((one) => one.jenis === "lokasi_mitra")).toHaveLength(1);
    expect(hitung.dibuat).toBe(2);
  });
});

describe("cabut", () => {
  it("hides every Lokasi Mitra it holds from the public listing, marks it data contoh and Dinonaktifkan its staff", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const { lokasiMitra, adminLokasi } = await publishedLokasiMitra(setup, admin, "Taman Contoh (Contoh)");
    expect((await setup.lokasi.publicLokasiMitraList()).map((one) => one.name)).toEqual(["Taman Contoh (Contoh)"]);
    const dasar = { himpunan: "rilis1" as const, reason: ALASAN };
    await dataContoh.catat(admin, { ...dasar, kode: "rilis1/lokasi/taman-contoh", jenis: "lokasi_mitra", entitasId: lokasiMitra.id });
    await dataContoh.catat(admin, { ...dasar, kode: "rilis1/akun/taman-contoh", jenis: "akun_staf", entitasId: adminLokasi.accountId, indukKode: "rilis1/lokasi/taman-contoh" });

    const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

    expect(hasil).toMatchObject({ ok: true, pesananTerbuka: [] });
    expect(await setup.lokasi.publicLokasiMitraList()).toEqual([]);
    expect(await setup.lokasi.publicLokasiMitra(lokasiMitra.id)).toBeNull();
    const profil = await setup.lokasi.lokasiMitra(admin, lokasiMitra.id);
    expect(profil.ok && profil.lokasiMitra.dataContoh).toBe(true);
    // A Lokasi Mitra marked data contoh can no longer be published again.
    const akun = (await setup.identity.staffAccounts()).find((one) => one.accountId === adminLokasi.accountId);
    expect(akun?.deactivated).toBe(true);
    expect((await dataContoh.status()).aktif).toEqual([]);
  });

  it("is idempotent: cabut again changes nothing and still succeeds", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin);
    await dataContoh.catat(admin, { kode: "rilis1/lokasi/x", himpunan: "rilis1", jenis: "lokasi_mitra", entitasId: lokasiMitra.id, reason: ALASAN });
    await dataContoh.cabut(admin, { reason: "cabut (test)" });

    const lagi = await dataContoh.cabut(admin, { reason: "cabut (test)" });

    expect(lagi).toMatchObject({ ok: true });
  });

  it("refuses while a contoh price is still in force, retires nothing and lists the price", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin, "Taman Contoh (Contoh)", { biayaLayananPlatform: 250_000 });
    const berlaku = await setup.tariffs.globalTariff("biaya_layanan_platform", setup.clock.now());
    const dasar = { himpunan: "rilis1" as const, reason: ALASAN };
    await dataContoh.catat(admin, { ...dasar, kode: "rilis1/lokasi/taman-contoh", jenis: "lokasi_mitra", entitasId: lokasiMitra.id });
    await dataContoh.catat(admin, { ...dasar, kode: "rilis1/tarif/biaya-layanan-platform", jenis: "tarif_global", entitasId: `biaya_layanan_platform:${berlaku!.seq}` });

    const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

    expect(hasil).toMatchObject({
      ok: false,
      reason: "harga_contoh_masih_berlaku",
      diblokir: [{ kode: "rilis1/tarif/biaya-layanan-platform", key: "biaya_layanan_platform", amount: 250_000 }],
    });
    // Nothing was retired: the Lokasi Mitra is still listed and both entries are still active.
    expect((await setup.lokasi.publicLokasiMitraList()).map((one) => one.name)).toEqual(["Taman Contoh (Contoh)"]);
    expect((await dataContoh.status()).aktif).toHaveLength(2);
    expect(await dataContoh.aktif()).toBe(true);
  });

  it("goes ahead once a real price version has superseded the contoh one", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin, "Taman Contoh (Contoh)", { biayaLayananPlatform: 250_000 });
    const berlaku = await setup.tariffs.globalTariff("biaya_layanan_platform", setup.clock.now());
    const dasar = { himpunan: "rilis1" as const, reason: ALASAN };
    await dataContoh.catat(admin, { ...dasar, kode: "rilis1/lokasi/taman-contoh", jenis: "lokasi_mitra", entitasId: lokasiMitra.id });
    await dataContoh.catat(admin, { ...dasar, kode: "rilis1/tarif/biaya-layanan-platform", jenis: "tarif_global", entitasId: `biaya_layanan_platform:${berlaku!.seq}` });
    // The Operator enters the real fee, in force from today.
    const asli = await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 125_000, effectiveOn: "2026-10-01", reason: "harga asli" });
    expect(asli.ok).toBe(true);

    const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

    expect(hasil).toMatchObject({ ok: true });
    expect(await setup.lokasi.publicLokasiMitraList()).toEqual([]);
    // The real version is untouched and now the only one in force.
    expect((await setup.tariffs.globalTariff("biaya_layanan_platform", setup.clock.now()))?.amount).toBe(125_000);
    expect(await dataContoh.aktif()).toBe(false);
  });

  it("reports the orders a Lokasi Mitra still has running when it is retired", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await adminPlatformOf(setup);
    const dataContoh = dataContohOn(setup);
    await siapkanOperatorPemesanan(setup);
    const fixture = await terencanaLokasi(setup, admin);
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id");
    const id = await unitIds(setup, fixture, ["A-01"]);
    const pesanan = await setup.pemesanan.placeTerencana({
      pemesanName: "Rina Wulandari",
      phoneNumber: "081234567890",
      pemegangHak: { mode: "pemesan" },
      calonPenghuni: { mode: "saya" },
      pemesan,
      lokasiId: fixture.lokasiMitra.id,
      units: [{ petakId: id["A-01"] }],
    });
    if (!pesanan.ok) throw new Error("placeTerencana refused");
    await dataContoh.catat(admin, { kode: "rilis1/lokasi/terencana", himpunan: "rilis1", jenis: "lokasi_mitra", entitasId: fixture.lokasiMitra.id, reason: ALASAN });

    const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

    expect(hasil).toMatchObject({
      ok: true,
      pesananTerbuka: [{ lokasiKode: "rilis1/lokasi/terencana", lokasiId: fixture.lokasiMitra.id, nomor: pesanan.pemesanan.nomor, kind: "terencana", status: "diajukan" }],
    });
  });

  it("only plans in a dry run: rencanaCabut says what cabut would do and writes nothing", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin, "Taman Contoh (Contoh)");
    await dataContoh.catat(admin, { kode: "rilis1/lokasi/x", himpunan: "rilis1", jenis: "lokasi_mitra", entitasId: lokasiMitra.id, reason: ALASAN });

    const rencana = await dataContoh.rencanaCabut();

    expect(rencana.aktif.map((one) => one.kode)).toEqual(["rilis1/lokasi/x"]);
    expect(rencana.diblokir).toEqual([]);
    expect((await setup.lokasi.publicLokasiMitraList()).map((one) => one.name)).toEqual(["Taman Contoh (Contoh)"]);
    expect(await dataContoh.aktif()).toBe(true);
  });
});
