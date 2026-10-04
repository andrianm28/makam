/**
 * Data Contoh (ticket 109): the registry of the example records a beta shows on
 * a stack, and the retiring of all of them at once. Driven only through the
 * module's public functions and read back through the neighbours' own public
 * reads (the public listing, the staff accounts, the tariff in force).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createMitraJasaDaftar, createPenawaranLayanan } from "@/domain/layanan";
import { pesananBerjalanDiLokasi } from "@/domain/pemesanan";
import { createNazhirList } from "@/domain/wakaf";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { adminPlatformOf } from "../../../tests/support/identity";
import { pemesananOnTestDatabase, pemesanDenganEmail, siapkanOperatorPemesanan, unitIds } from "../../../tests/support/pemesanan";
import { catalogFixture, layananOnTestDatabase, newLayananFor, newMitraJasaInput, type LayananSetup } from "../../../tests/support/layanan";
import { newTpuDki } from "../../../tests/support/lokasi";
import { newLokasiMitra, publishedLokasiMitra, signedInAdminLokasi, type PublishSetup } from "../../../tests/support/publish";
import { terencanaLokasi } from "../../../tests/support/terencana";
import type { Actor } from "@/domain/identity";
import { createDataContoh, type DataContoh, type DataContohDeps, type KonteksTanam, type RencanaTanam } from ".";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The module composed on the test Postgres, with its neighbours' real public functions. */
function dataContohOn(setup: PublishSetup, ganti: Partial<DataContohDeps> = {}): DataContoh {
  const komposisi = { db, clock: setup.clock, audit: setup.audit };
  return createDataContoh({
    ...komposisi,
    lokasi: setup.lokasi,
    identity: setup.identity,
    tariffs: setup.tariffs,
    layanan: { ...createPenawaranLayanan({ ...komposisi, tariffs: setup.tariffs }), ...createMitraJasaDaftar(komposisi) },
    wakaf: createNazhirList(komposisi),
    pemesanan: { pesananBerjalanDiLokasi: (lokasiId) => pesananBerjalanDiLokasi({ db }, lokasiId) },
    ...ganti,
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
    expect((await dataContoh.rencanaCabut(admin)).diblokir.map((one) => one.kode)).toEqual([kode]);

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

    const rencana = await dataContoh.rencanaCabut(admin);

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

    const rencana = await dataContoh.rencanaCabut(admin);
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
    expect((await dataContoh.rencanaCabut(admin)).diblokir).toEqual([]);
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

describe("Rilis 3: TPU prices, Mitra Jasa and Nazhir of a set (ticket 111)", () => {
  /** The three fixtures the Rilis 3 set plants for one Layanan variant, built the way the command builds them: its DKI price, its Mitra Jasa rate, its "boleh di TPU DKI" mark. */
  function rencanaVarian(setup: LayananSetup, admin: Actor, varianId: string, kode = "v", jumlah = { dki: 150_000, tarif: 100_000 }): RencanaTanam[] {
    const harga = (jenis: "harga_layanan_dki" | "tarif_mitra_jasa", awal: string): RencanaTanam => ({
      kode: `rilis3/${awal}/${kode}`,
      jenis,
      layananVariantId: varianId,
      async buat(ctx: KonteksTanam) {
        const masuk = { amount: jenis === "harga_layanan_dki" ? jumlah.dki : jumlah.tarif, effectiveOn: "2026-10-01", reason: ALASAN };
        const dibuat = jenis === "harga_layanan_dki" ? await setup.tariffs.setHargaLayananDki(admin, varianId, masuk) : await setup.tariffs.setTarifMitraJasa(admin, varianId, masuk);
        if (!dibuat.ok) return { ok: false as const, reason: dibuat.reason };
        await ctx.catatInduk(`${varianId}:${dibuat.version.seq}`);
        return { ok: true as const };
      },
    });
    return [
      harga("harga_layanan_dki", "harga-dki"),
      harga("tarif_mitra_jasa", "tarif-mitra-jasa"),
      {
        kode: `rilis3/tanda-tpu/${kode}`,
        jenis: "tanda_tpu_dki",
        async buat(ctx: KonteksTanam) {
          const tanda = await setup.layanan.tandaiBolehDiTpu(admin, varianId, { boleh: true, reason: ALASAN });
          if (!tanda.ok) return { ok: false as const, reason: tanda.reason };
          await ctx.catatInduk(varianId);
          return { ok: true as const };
        },
      },
    ];
  }

  const tanamRilis3 = (dataContoh: DataContoh, admin: Actor, rencana: RencanaTanam[]) => dataContoh.tanam(admin, { himpunan: "rilis3", reason: ALASAN, rencana });
  /** What a TPU shows: every offered variant with the price a family pays there. */
  const diTpu = async (setup: LayananSetup) => (await setup.layanan.penawaranTpu(setup.clock.now())).flatMap((layanan) => layanan.varian.map((varian) => [varian.id, varian.harga.total]));
  const hargaAsli = (setup: LayananSetup, admin: Actor, varianId: string, jumlah = { dki: 175_000, tarif: 120_000 }) =>
    Promise.all([
      setup.tariffs.setHargaLayananDki(admin, varianId, { amount: jumlah.dki, effectiveOn: "2026-10-01", reason: "harga asli" }),
      setup.tariffs.setTarifMitraJasa(admin, varianId, { amount: jumlah.tarif, effectiveOn: "2026-10-01", reason: "tarif asli" }),
    ]);

  describe("a TPU price with no real successor version", () => {
    it("is planted with its mark, so the variant is offered at a TPU; cabut then stops offering it and leaves nothing active", async () => {
      const setup = layananOnTestDatabase(db);
      const { admin, varian } = await catalogFixture(setup);
      const dataContoh = dataContohOn(setup);

      const ditanam = await tanamRilis3(dataContoh, admin, rencanaVarian(setup, admin, varian.id));

      expect(ditanam).toMatchObject({ ok: true, dibuat: ["rilis3/harga-dki/v", "rilis3/tarif-mitra-jasa/v", "rilis3/tanda-tpu/v"], sudahAda: [], dilewati: [] });
      expect(await diTpu(setup)).toEqual([[varian.id, 150_000]]);
      expect((await dataContoh.status()).aktif.map((one) => [one.jenis, one.lengkap]).sort()).toEqual([
        ["harga_layanan_dki", true],
        ["tanda_tpu_dki", true],
        ["tarif_mitra_jasa", true],
      ]);

      const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

      expect(hasil).toMatchObject({ ok: true, tidakDitawarkan: [{ layananVariantId: varian.id, hargaDki: true, tarifMitraJasa: true }] });
      expect(await diTpu(setup)).toEqual([]);
      expect((await dataContoh.status()).aktif).toEqual([]);
      expect(await dataContoh.aktif()).toBe(false);
      // Tariffs never erases a version: the example price is still in its book, it is only no longer offered anywhere.
      expect(await setup.tariffs.hargaLayananDkiHistory(varian.id)).toHaveLength(1);
      const katalog = await setup.layanan.katalog();
      expect(katalog.flatMap((layanan) => layanan.varian).find((satu) => satu.id === varian.id)?.bolehDiTpu).toBe(false);
    });

    it("lets a variant stay offered at a TPU once a real DKI price and a real Mitra Jasa rate have superseded the contoh versions", async () => {
      const setup = layananOnTestDatabase(db);
      const { admin, varian } = await catalogFixture(setup);
      const dataContoh = dataContohOn(setup);
      await tanamRilis3(dataContoh, admin, rencanaVarian(setup, admin, varian.id));
      for (const hasil of await hargaAsli(setup, admin, varian.id)) expect(hasil.ok).toBe(true);

      const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

      expect(hasil).toMatchObject({ ok: true, tidakDitawarkan: [], dicabut: { harga_layanan_dki: 1, tarif_mitra_jasa: 1, tanda_tpu_dki: 1 } });
      expect(await diTpu(setup)).toEqual([[varian.id, 175_000]]);
      expect((await dataContoh.status()).aktif).toEqual([]);
      expect(await dataContoh.aktif()).toBe(false);
    });

    it("stops offering a variant whose DKI price is real but whose Mitra Jasa rate is still a contoh version, because a job would pay a Mitra Jasa an example amount", async () => {
      const setup = layananOnTestDatabase(db);
      const { admin, varian } = await catalogFixture(setup);
      const dataContoh = dataContohOn(setup);
      await tanamRilis3(dataContoh, admin, rencanaVarian(setup, admin, varian.id));
      const dki = await setup.tariffs.setHargaLayananDki(admin, varian.id, { amount: 175_000, effectiveOn: "2026-10-01", reason: "harga asli" });
      expect(dki.ok).toBe(true);

      const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

      expect(hasil).toMatchObject({ ok: true, tidakDitawarkan: [{ layananVariantId: varian.id, hargaDki: false, tarifMitraJasa: true }] });
      expect(await diTpu(setup)).toEqual([]);
      // The real DKI price is untouched and still the one in force.
      expect((await setup.tariffs.hargaLayananDki(varian.id, setup.clock.now()))?.amount).toBe(175_000);
    });

    it("keeps the rows of a variant active and fails when its mark cannot be taken off, because the variant would still be offered at an example price", async () => {
      const setup = layananOnTestDatabase(db);
      const { admin, varian } = await catalogFixture(setup);
      await tanamRilis3(dataContohOn(setup), admin, rencanaVarian(setup, admin, varian.id));
      // The Layanan module refuses to take the mark off.
      const menolak = dataContohOn(setup, { layanan: { ...setup.layanan, tandaiBolehDiTpu: async () => ({ ok: false as const, reason: "tidak_berwenang" as const }) } });

      const hasil = await menolak.cabut(admin, { reason: "cabut (test)" });

      expect(hasil).toMatchObject({ ok: false, reason: "masih_aktif", gagal: [{ kode: `varian ${varian.id}` }] });
      expect(await diTpu(setup)).toEqual([[varian.id, 150_000]]);
      expect((await menolak.status()).aktif.map((one) => one.jenis).sort()).toEqual(["harga_layanan_dki", "tanda_tpu_dki", "tarif_mitra_jasa"]);
      expect(await menolak.aktif()).toBe(true);
    });

    it("is listed by the dry run, which writes nothing: rencanaCabut names the variants cabut would stop offering", async () => {
      const setup = layananOnTestDatabase(db);
      const { admin, varian } = await catalogFixture(setup);
      const dataContoh = dataContohOn(setup);
      await tanamRilis3(dataContoh, admin, rencanaVarian(setup, admin, varian.id));
      const entriSebelum = (await setup.audit.allEntries()).length;

      const rencana = await dataContoh.rencanaCabut(admin);

      expect(rencana.tidakDitawarkan).toEqual([{ layananVariantId: varian.id, hargaDki: true, tarifMitraJasa: true }]);
      expect(rencana.diblokir).toEqual([]);
      expect(await diTpu(setup)).toEqual([[varian.id, 150_000]]);
      expect((await setup.audit.allEntries()).length).toBe(entriSebelum);
    });

    it("never stops offering a variant the registry holds no price of: an Operator's own variant stays offered", async () => {
      const setup = layananOnTestDatabase(db);
      const { admin, varian } = await catalogFixture(setup);
      const milikOperator = (await newLayananFor(setup, admin, { name: "Bunga Tabur", jenis: "bunga", bukti: "foto_sesudah", varian: ["Reguler"] })).varian;
      for (const hasil of await hargaAsli(setup, admin, milikOperator.id)) expect(hasil.ok).toBe(true);
      expect((await setup.layanan.tandaiBolehDiTpu(admin, milikOperator.id, { boleh: true, reason: null })).ok).toBe(true);
      const dataContoh = dataContohOn(setup);
      await tanamRilis3(dataContoh, admin, rencanaVarian(setup, admin, varian.id));
      expect((await diTpu(setup)).map(([id]) => id).sort()).toEqual([milikOperator.id, varian.id].sort());

      const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

      expect(hasil).toMatchObject({ ok: true, tidakDitawarkan: [{ layananVariantId: varian.id }] });
      expect(await diTpu(setup)).toEqual([[milikOperator.id, 175_000]]);
    });

    it.each(["harga_layanan_dki", "tarif_mitra_jasa"] as const)("records a contoh %s a killed tanam entered and never recorded, instead of entering a second version", async (jenis) => {
      const setup = layananOnTestDatabase(db);
      const { admin, varian } = await catalogFixture(setup);
      const dataContoh = dataContohOn(setup);
      const rencana = rencanaVarian(setup, admin, varian.id);
      const [harga] = rencana.filter((satu) => satu.jenis === jenis);
      // A run killed between entering the price and recording it: the price is in force, under the run's reason, and no row names it.
      const terputus: RencanaTanam = {
        ...harga,
        async buat() {
          const masuk = { amount: 150_000, effectiveOn: "2026-10-01", reason: ALASAN };
          await (jenis === "harga_layanan_dki" ? setup.tariffs.setHargaLayananDki(admin, varian.id, masuk) : setup.tariffs.setTarifMitraJasa(admin, varian.id, masuk));
          throw new Error("proses dimatikan");
        },
      } as RencanaTanam;
      await expect(tanamRilis3(dataContoh, admin, [terputus])).rejects.toThrow("proses dimatikan");
      expect((await dataContoh.status()).aktif).toEqual([]);

      const lagi = await tanamRilis3(dataContoh, admin, rencana);

      // The price a killed run left is recorded in place of entering a second one: it counts as planted, once.
      expect(lagi).toMatchObject({ ok: true, dibuat: ["rilis3/harga-dki/v", "rilis3/tarif-mitra-jasa/v", "rilis3/tanda-tpu/v"], sudahAda: [], dilewati: [] });
      const riwayat = jenis === "harga_layanan_dki" ? await setup.tariffs.hargaLayananDkiHistory(varian.id) : await setup.tariffs.mitraJasaRateHistory(admin, varian.id);
      expect(riwayat).toHaveLength(1);
      expect((await dataContoh.status()).aktif.map((one) => one.jenis)).toContain(jenis);
    });

    it("names a price version <variant id>:<version>: a name that is not one is never recorded, because it would break every later cabut", async () => {
      const setup = layananOnTestDatabase(db);
      const { admin, varian } = await catalogFixture(setup);
      const dataContoh = dataContohOn(setup);

      for (const jenis of ["harga_layanan_dki", "tarif_mitra_jasa"] as const) {
        await expect(dataContoh.catat(admin, { kode: `rilis3/x/${jenis}`, himpunan: "rilis3", jenis, entitasId: varian.id, reason: ALASAN })).rejects.toThrow("Data Contoh: harga layanan harus");
      }
      expect((await dataContoh.status()).aktif).toEqual([]);
    });
  });

  describe("Mitra Jasa (Contoh)", () => {
    it("is set to Berhenti by cabut with the reason of the run, so the assignment picker no longer offers it, and its record stays readable", async () => {
      const setup = layananOnTestDatabase(db);
      const { admin, varian } = await catalogFixture(setup);
      const tpu = await newTpuDki(setup, admin);
      const dataContoh = dataContohOn(setup);
      const dibuat = await setup.layanan.buatMitraJasa(admin, "agus.pratama@contoh.makam.invalid", newMitraJasaInput({ namaLengkap: "Agus Pratama (Contoh)" }));
      if (!dibuat.ok) throw new Error(`Mitra Jasa refused: ${dibuat.reason}`);
      expect((await setup.layanan.ubahCoverage(admin, dibuat.mitraJasaId, { tpuDkiIds: [tpu.id], layananVariantIds: [varian.id] })).ok).toBe(true);
      expect(await dataContoh.catat(admin, { kode: "rilis3/mitra-jasa/agus-pratama", himpunan: "rilis3", jenis: "mitra_jasa", entitasId: dibuat.mitraJasaId, reason: ALASAN })).toMatchObject({ ok: true });
      const kebutuhan = { tpuDkiId: tpu.id, layananVariantId: varian.id, tanggal: "2026-10-10" };
      expect((await setup.layanan.mitraJasaTersedia(admin, kebutuhan)).map((satu) => satu.namaLengkap)).toEqual(["Agus Pratama (Contoh)"]);

      const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

      expect(hasil).toMatchObject({ ok: true, dicabut: { mitra_jasa: 1 } });
      expect(await setup.layanan.mitraJasaTersedia(admin, kebutuhan)).toEqual([]);
      expect(await setup.layanan.bacaMitraJasa(admin, dibuat.mitraJasaId)).toMatchObject({
        ok: true,
        mitraJasa: { status: "berhenti", statusAlasan: "cabut (test)", coverage: { layananVariantIds: [varian.id] } },
      });
      expect((await dataContoh.status()).aktif).toEqual([]);
    });

    it("goes ahead for one Admin Platform has already ended, without changing its status or reason", async () => {
      const setup = layananOnTestDatabase(db);
      const { admin } = await catalogFixture(setup);
      const dataContoh = dataContohOn(setup);
      const dibuat = await setup.layanan.buatMitraJasa(admin, "siti.rahayu@contoh.makam.invalid", newMitraJasaInput({ namaLengkap: "Siti Rahayu (Contoh)" }));
      if (!dibuat.ok) throw new Error(`Mitra Jasa refused: ${dibuat.reason}`);
      await dataContoh.catat(admin, { kode: "rilis3/mitra-jasa/siti-rahayu", himpunan: "rilis3", jenis: "mitra_jasa", entitasId: dibuat.mitraJasaId, reason: ALASAN });
      expect((await setup.layanan.ubahStatus(admin, dibuat.mitraJasaId, { status: "berhenti", alasan: "berhenti oleh Admin Platform" })).ok).toBe(true);

      const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

      expect(hasil).toMatchObject({ ok: true });
      expect(await setup.layanan.bacaMitraJasa(admin, dibuat.mitraJasaId)).toMatchObject({ ok: true, mitraJasa: { status: "berhenti", statusAlasan: "berhenti oleh Admin Platform" } });
      expect((await dataContoh.status()).aktif).toEqual([]);
    });
  });

  describe("Nazhir (Contoh)", () => {
    const nazhirContoh = { nama: "Nazhir Wakaf Sejahtera (Contoh)", jenis: "badan_hukum", kabKota: "Kota Jakarta Selatan", kontak: "021-5550101", nomorBwi: "BWI-CONTOH-001" };

    it("is removed from the list by cabut, and goes ahead for one Admin Platform has already removed", async () => {
      const setup = layananOnTestDatabase(db);
      const { admin } = await catalogFixture(setup);
      const dataContoh = dataContohOn(setup);
      const daftar = createNazhirList({ db, clock: setup.clock, audit: setup.audit });
      const satu = await daftar.tambahNazhir(admin, nazhirContoh);
      const dua = await daftar.tambahNazhir(admin, { ...nazhirContoh, nama: "Nazhir Amanah Umat (Contoh)", nomorBwi: "BWI-CONTOH-002" });
      if (!satu.ok || !dua.ok) throw new Error("tambahNazhir refused");
      const sendiri = await daftar.tambahNazhir(admin, { ...nazhirContoh, nama: "Nazhir Asli", nomorBwi: "BWI-123" });
      if (!sendiri.ok) throw new Error("tambahNazhir refused");
      for (const [kode, nazhir] of [["satu", satu.nazhir], ["dua", dua.nazhir]] as const) {
        await dataContoh.catat(admin, { kode: `rilis3/nazhir/${kode}`, himpunan: "rilis3", jenis: "nazhir", entitasId: nazhir.id, reason: ALASAN });
      }
      expect((await daftar.hapusNazhir(admin, { nazhirId: dua.nazhir.id })).ok).toBe(true);

      const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

      expect(hasil).toMatchObject({ ok: true, dicabut: { nazhir: 2 } });
      // Only the ones the registry held are gone: the Operator's own Nazhir stays.
      expect((await daftar.daftarNazhir(admin)).map((one) => one.nama)).toEqual(["Nazhir Asli"]);
      expect((await dataContoh.status()).aktif).toEqual([]);
    });
  });

  describe("Rilis 2 rules on a contoh Lokasi", () => {
    it("are recorded under the Lokasi, and cabut retires the row while the Lokasi is hidden with its rules", async () => {
      const setup = layananOnTestDatabase(db);
      const { admin } = await catalogFixture(setup);
      const dataContoh = dataContohOn(setup);
      const { lokasiMitra } = await publishedLokasiMitra(setup, admin, "Taman Contoh (Contoh)");
      const dasar = { himpunan: "rilis3" as const, reason: ALASAN };
      await dataContoh.catat(admin, { ...dasar, himpunan: "rilis1", kode: "rilis1/lokasi/taman-contoh", jenis: "lokasi_mitra", entitasId: lokasiMitra.id });
      await dataContoh.catat(admin, { ...dasar, kode: "rilis3/aturan/taman-contoh", jenis: "aturan_lokasi", entitasId: lokasiMitra.id, indukKode: "rilis1/lokasi/taman-contoh" });

      const hasil = await dataContoh.cabut(admin, { reason: "cabut (test)" });

      expect(hasil).toMatchObject({ ok: true, dicabut: { lokasi_mitra: 1, aturan_lokasi: 1 } });
      expect(await setup.lokasi.publicLokasiMitraList()).toEqual([]);
      expect((await dataContoh.status()).aktif).toEqual([]);
    });
  });
});
