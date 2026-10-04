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
import type { Actor } from "@/domain/identity";
import { createDataContoh, type DataContoh, type RencanaTanam } from ".";

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

  it("a tanam cut short after the platform fee was entered finishes the fee on the next run instead of letting it go, so cabut still refuses while the fee is in force", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const kode = "rilis1/tarif/biaya-layanan-platform";
    const rencanaFee = (putusSetelahDicatat: boolean) => [
      {
        kode,
        jenis: "tarif_global" as const,
        buat: async (ctx: Parameters<Parameters<DataContoh["tanam"]>[1]["rencana"][number]["buat"]>[0]) => {
          if (await setup.tariffs.globalTariff("biaya_layanan_platform", setup.clock.now())) return { ok: true as const };
          const dibuat = await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 100_000, effectiveOn: "2026-10-01", reason: ALASAN });
          if (!dibuat.ok) return { ok: false as const, reason: dibuat.reason };
          await ctx.catatInduk(`biaya_layanan_platform:${dibuat.version.seq}`);
          if (putusSetelahDicatat) throw new Error("proses dimatikan");
          return { ok: true as const };
        },
      },
    ];

    await expect(dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana: rencanaFee(true) })).rejects.toThrow("proses dimatikan");
    // The price is in force, so the registry keeps holding it (unfinished) rather than cleaning it up.
    expect((await dataContoh.rencanaCabut()).diblokir.map((one) => one.kode)).toEqual([kode]);

    const lagi = await dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana: rencanaFee(false) });

    expect(lagi).toMatchObject({ ok: true, dibuat: [], sudahAda: [kode], dilewati: [] });
    expect((await dataContoh.status()).aktif.map((one) => [one.kode, one.lengkap])).toEqual([[kode, true]]);
    expect(await dataContoh.cabut(admin, { reason: "cabut (test)" })).toMatchObject({ ok: false, reason: "harga_contoh_masih_berlaku" });
    expect(await setup.tariffs.globalTariffHistory("biaya_layanan_platform")).toHaveLength(1);
  });

  it("retires a cut-short fixture whose price a real version has since superseded, and builds it afresh", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const kode = "rilis1/tarif/biaya-layanan-platform";
    const contoh = await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 100_000, effectiveOn: "2026-10-01", reason: ALASAN });
    if (!contoh.ok) throw new Error("setGlobalTariff refused");
    // The row was recorded unfinished (a build cut short) and the process died; then the Operator entered the real fee.
    const terputus = {
      kode,
      jenis: "tarif_global" as const,
      buat: async (ctx: Parameters<Parameters<DataContoh["tanam"]>[1]["rencana"][number]["buat"]>[0]) => {
        await ctx.catatInduk(`biaya_layanan_platform:${contoh.version.seq}`);
        throw new Error("dimatikan");
      },
    };
    await expect(dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana: [terputus] })).rejects.toThrow("dimatikan");
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 125_000, effectiveOn: "2026-10-01", reason: "harga asli" });

    const lagi = await dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana: [{ kode, jenis: "tarif_global", buat: async () => ({ ok: true }) }] });

    expect(lagi).toMatchObject({ ok: true, dibuat: [], sudahAda: [], dilewati: [kode] });
    expect((await dataContoh.status()).aktif).toEqual([]);
    expect((await setup.tariffs.globalTariff("biaya_layanan_platform", setup.clock.now()))?.amount).toBe(125_000);
  });

  it("records the finishing of each fixture in the Audit Log, with the reason of the run", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();

    await dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana: rencanaLokasi(setup, admin, { dibuat: 0 }) });

    const [lokasi] = await setup.lokasi.allLokasiMitra(admin);
    const entri = (await setup.audit.allEntriesForLokasi(lokasi.id)).filter((satu) => satu.entity.kind === "lokasi_mitra" && satu.action.startsWith("data_contoh."));
    expect(entri.map((satu) => [satu.action, satu.reason])).toEqual([
      ["data_contoh.tanam", ALASAN],
      ["data_contoh.selesai", ALASAN],
    ]);
  });

  it("refuses a blank reason, as cabut does, and says a fixture code that is not one is a bug in the plan", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const rencana = [{ kode: "rilis1/lokasi/x", jenis: "lokasi_mitra" as const, buat: async () => ({ ok: true as const }) }];

    expect(await dataContoh.tanam(admin, { himpunan: "rilis1", reason: "  ", rencana })).toMatchObject({ ok: false, reason: "alasan_wajib" });
    expect(await dataContoh.catat(admin, { kode: "rilis1/lokasi/x", himpunan: "rilis1", jenis: "lokasi_mitra", entitasId: lokasiMitra.id, reason: "" })).toMatchObject({ ok: false, reason: "alasan_wajib" });
    await expect(dataContoh.catat(admin, { kode: "  ", himpunan: "rilis1", jenis: "lokasi_mitra", entitasId: lokasiMitra.id, reason: ALASAN })).rejects.toThrow("Data Contoh: kode tidak valid");
    await expect(dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana: [{ ...rencana[0], kode: "" }] })).rejects.toThrow("Data Contoh: kode tidak valid");
    // A global price is named `<tariff key>:<version>`; a name that is not one would break every later cabut, so it is never recorded.
    await expect(dataContoh.catat(admin, { kode: "rilis1/tarif/x", himpunan: "rilis1", jenis: "tarif_global", entitasId: "bukan-versi", reason: ALASAN })).rejects.toThrow("Data Contoh: tarif global harus");
    expect((await dataContoh.status()).aktif).toEqual([]);
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
    const akun = (await setup.identity.staffAccounts()).find((one) => one.accountId === adminLokasi.accountId);
    expect(akun?.deactivated).toBe(true);
    expect((await dataContoh.status()).aktif).toEqual([]);
  });

  it("leaves a Lokasi Mitra it has retired unpublishable: the publish gate refuses it as data contoh", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const belumTayang = await newLokasiMitra(setup, admin, "Taman Contoh (Contoh)");
    await dataContoh.catat(admin, { kode: "rilis1/lokasi/x", himpunan: "rilis1", jenis: "lokasi_mitra", entitasId: belumTayang.id, reason: ALASAN });
    await dataContoh.cabut(admin, { reason: "cabut (test)" });

    const terbit = await setup.lokasi.publish(admin, belumTayang.id, { tariffsChecked: null });

    expect(terbit).toMatchObject({ ok: false, reason: "data_contoh_tidak_bisa_diterbitkan" });
    expect(await setup.lokasi.publicLokasiMitraList()).toEqual([]);
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

  it("refuses while a contoh price dated for the future has no real successor, because it will be the price in force then", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 125_000, effectiveOn: "2026-10-01", reason: "harga asli" });
    const terjadwal = await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 100_000, effectiveOn: "2026-12-01", reason: ALASAN });
    if (!terjadwal.ok) throw new Error("setGlobalTariff refused");
    await dataContoh.catat(admin, { kode: "rilis1/tarif/biaya-layanan-platform", himpunan: "rilis1", jenis: "tarif_global", entitasId: `biaya_layanan_platform:${terjadwal.version.seq}`, reason: ALASAN });

    const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

    expect(hasil).toMatchObject({
      ok: false,
      reason: "harga_contoh_masih_berlaku",
      diblokir: [{ kode: "rilis1/tarif/biaya-layanan-platform", key: "biaya_layanan_platform", amount: 100_000 }],
    });
    expect(await dataContoh.aktif()).toBe(true);

    // A real version for the same day, entered after it, takes the day over: the contoh one is never in force.
    const asli = await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 150_000, effectiveOn: "2026-12-01", reason: "harga asli" });
    expect(asli.ok).toBe(true);
    expect(await dataContoh.cabut(admin, { reason: "cabut (test)" })).toMatchObject({ ok: true });
    expect(await dataContoh.aktif()).toBe(false);
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

describe("a contoh price a tanam entered and died before recording", () => {
  const KODE_BIAYA = "rilis1/tarif/biaya-layanan-platform";

  /** What a tanam killed between entering the Biaya Layanan Platform and recording it leaves behind: the example price in force, under the run's reason, and no registry row. */
  async function hargaContohTanpaCatatan(setup: PublishSetup, admin: Actor, amount = 100_000) {
    const dibuat = await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount, effectiveOn: "2026-10-01", reason: ALASAN });
    if (!dibuat.ok) throw new Error("setGlobalTariff refused");
    return dibuat.version;
  }

  /** The Operator's own fee, entered through the Tarif screen: no reason of a tanam. */
  const hargaAsli = (setup: PublishSetup, admin: Actor, amount = 125_000) =>
    setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount, effectiveOn: "2026-10-01", reason: "harga asli" });

  const kunciBiaya = "biaya_layanan_platform" as const;

  it("is held against cabut, which refuses and retires nothing while it is the price in force", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const lokasi = await newLokasiMitra(setup, admin, "Taman Contoh (Contoh)");
    await dataContoh.catat(admin, { kode: "rilis1/lokasi/taman-contoh", himpunan: "rilis1", jenis: "lokasi_mitra", entitasId: lokasi.id, reason: ALASAN });
    await hargaContohTanpaCatatan(setup, admin);

    const rencana = await dataContoh.rencanaCabut();
    const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

    expect(rencana.diblokir).toMatchObject([{ kode: null, key: kunciBiaya, amount: 100_000 }]);
    expect(hasil).toMatchObject({ ok: false, reason: "harga_contoh_masih_berlaku", diblokir: [{ kode: null, key: kunciBiaya, amount: 100_000 }] });
    const profil = await setup.lokasi.lokasiMitra(admin, lokasi.id);
    expect(profil.ok && profil.lokasiMitra.dataContoh).toBe(false);
    expect((await dataContoh.status()).aktif).toHaveLength(1);
  });

  it("lets cabut go ahead once a real version has superseded it", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    await hargaContohTanpaCatatan(setup, admin);
    await hargaAsli(setup, admin);

    expect(await dataContoh.cabut(admin, { reason: "cabut (test)" })).toMatchObject({ ok: true });
    expect(await dataContoh.aktif()).toBe(false);
  });

  it("counts as Data Contoh being active although the registry holds no entry, and status lists it, until a real version supersedes it", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    await hargaContohTanpaCatatan(setup, admin);

    expect(await dataContoh.aktif()).toBe(true);
    const sebelum = await dataContoh.status();
    expect(sebelum.aktif).toEqual([]);
    expect(sebelum.takTercatat).toMatchObject([{ kode: null, key: kunciBiaya, amount: 100_000 }]);

    await hargaAsli(setup, admin);

    expect(await dataContoh.aktif()).toBe(false);
    expect((await dataContoh.status()).takTercatat).toEqual([]);
  });

  it("never counts an Operator's own fee, even one of the same amount: only a version a tanam entered is contoh", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    await hargaAsli(setup, admin, 100_000);

    expect(await dataContoh.aktif()).toBe(false);
    expect((await dataContoh.rencanaCabut()).diblokir).toEqual([]);
    expect((await dataContoh.status()).takTercatat).toEqual([]);
    expect(await dataContoh.cabut(admin, { reason: "cabut (test)" })).toMatchObject({ ok: true });
  });

  it("is recorded by the next tanam when the fixture names its tariff key: no second price is entered, and cabut still refuses", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const contoh = await hargaContohTanpaCatatan(setup, admin);
    const rencana: RencanaTanam[] = [
      {
        kode: KODE_BIAYA,
        jenis: "tarif_global",
        kunciTarif: kunciBiaya,
        buat: async () => {
          throw new Error("tidak boleh memasukkan harga kedua");
        },
      },
    ];

    const hasil = await dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana });

    expect(hasil).toMatchObject({ ok: true, dibuat: [KODE_BIAYA], sudahAda: [], dilewati: [] });
    expect((await dataContoh.status()).aktif.map((one) => [one.kode, one.entitasId, one.lengkap])).toEqual([[KODE_BIAYA, `biaya_layanan_platform:${contoh.seq}`, true]]);
    expect(await setup.tariffs.globalTariffHistory(kunciBiaya)).toHaveLength(1);
    expect(await dataContoh.cabut(admin, { reason: "cabut (test)" })).toMatchObject({ ok: false, reason: "harga_contoh_masih_berlaku", diblokir: [{ kode: KODE_BIAYA }] });
    expect((await dataContoh.status()).takTercatat).toEqual([]);
  });

  it("is never recorded in place of an Operator's own fee: the fixture is skipped and the registry stays empty", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    await hargaAsli(setup, admin, 100_000);
    const rencana: RencanaTanam[] = [{ kode: KODE_BIAYA, jenis: "tarif_global", kunciTarif: kunciBiaya, buat: async () => ({ ok: true }) }];

    const hasil = await dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana });

    expect(hasil).toMatchObject({ ok: true, dibuat: [], sudahAda: [], dilewati: [KODE_BIAYA] });
    expect((await dataContoh.status()).aktif).toEqual([]);
  });

  it("is no real successor to a recorded contoh price: a second contoh version over it keeps cabut refusing", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const pertama = await hargaContohTanpaCatatan(setup, admin, 100_000);
    await dataContoh.catat(admin, { kode: KODE_BIAYA, himpunan: "rilis1", jenis: "tarif_global", entitasId: `biaya_layanan_platform:${pertama.seq}`, reason: ALASAN });
    // A second run entered its own example version over the first and died: the recorded price is superseded, but by another example price.
    await hargaContohTanpaCatatan(setup, admin, 110_000);

    const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

    expect(hasil).toMatchObject({ ok: false, reason: "harga_contoh_masih_berlaku", diblokir: [{ kode: null, amount: 110_000 }] });
    expect((await dataContoh.status()).aktif).toHaveLength(1);

    // A real version is the successor that lets both go.
    await hargaAsli(setup, admin);
    expect(await dataContoh.cabut(admin, { reason: "cabut (test)" })).toMatchObject({ ok: true });
    expect(await dataContoh.aktif()).toBe(false);
  });

  it("cannot leave a tanam's own fixture to another run's cleanup: a run that could not record its fixture retires nothing of the run that did", async () => {
    const { setup, admin, dataContoh } = await setupDenganAdmin();
    const lain = await hargaContohTanpaCatatan(setup, admin, 100_000);
    const rencana: RencanaTanam[] = [
      {
        kode: KODE_BIAYA,
        jenis: "tarif_global",
        buat: async (ctx) => {
          // The other run records its price under the code while this one is still building.
          await dataContoh.catat(admin, { kode: KODE_BIAYA, himpunan: "rilis1", jenis: "tarif_global", entitasId: `biaya_layanan_platform:${lain.seq}`, reason: ALASAN });
          const sendiri = await hargaContohTanpaCatatan(setup, admin, 100_000);
          await ctx.catatInduk(`biaya_layanan_platform:${sendiri.seq}`);
          return { ok: true };
        },
      },
    ];

    await expect(dataContoh.tanam(admin, { himpunan: "rilis1", reason: ALASAN, rencana })).rejects.toThrow("kode_dipakai_entitas_lain");

    // The other run's row is still active: this run recorded nothing under the code, so it retires nothing.
    expect((await dataContoh.status()).aktif.map((one) => [one.kode, one.entitasId])).toEqual([[KODE_BIAYA, `biaya_layanan_platform:${lain.seq}`]]);
    // The example price this run entered is in force over it, and is held against cabut like any other.
    expect(await dataContoh.cabut(admin, { reason: "cabut (test)" })).toMatchObject({ ok: false, reason: "harga_contoh_masih_berlaku" });
  });

  it("refuses a tanam whose reason does not start with the command's name, because the Audit Log could not then tell its prices from an Operator's", async () => {
    const { admin, dataContoh } = await setupDenganAdmin();

    await expect(dataContoh.tanam(admin, { himpunan: "rilis1", reason: "seed biasa", rencana: [] })).rejects.toThrow("Data Contoh: alasan tanam");
  });
});
