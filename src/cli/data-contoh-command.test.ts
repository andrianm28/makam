/**
 * Data Contoh, the command (ticket 109): plants the marked "(Contoh)" set of Rilis 1, lists
 * what is active and retires all of it. Driven only through the command and read back through
 * the owning modules' own public reads, the way the public site and the staff screens read them.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { FakeClock } from "@/adapters/memory";
import { createDataContoh } from "@/domain/data-contoh";
import { buktiOf, createKatalogLayanan, createMitraJasaDaftar, createPenawaranLayanan } from "@/domain/layanan";
import { DEFAULT_FLAGS, DEFAULT_POLICIES } from "@/domain/lokasi";
import { pesananBerjalanDiLokasi } from "@/domain/pemesanan";
import { createNazhirList } from "@/domain/wakaf";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { adminPlatformOf } from "../../tests/support/identity";
import { layananOnTestDatabase, signedInMitraJasa, siapkanOperatorLayanan, type LayananSetup } from "../../tests/support/layanan";
import { orderTpu } from "../../tests/support/layanan-tpu";
import { pemesananOnTestDatabase, pemesanDenganEmail } from "../../tests/support/pemesanan";
import { newLokasiMitra, newTpuDki } from "../../tests/support/publish";
import { dataContohCommand } from "./data-contoh-command";
import { olahKatalog } from "./import-data-peluncuran-command";
import { LOKASI_RILIS1, sebagaiDataContoh, slug, tandaContoh } from "./data-contoh/rilis1";
import {
  ATURAN_RILIS2_DATA_CONTOH,
  HARGA_DKI_DATA_CONTOH,
  MITRA_JASA_DATA_CONTOH,
  NAZHIR_DATA_CONTOH,
  TARIF_MITRA_JASA_DATA_CONTOH,
} from "./data-contoh/rilis3";
import { CONTOH_LOKASI } from "./seed-contoh-publik-command";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const env = (APP_ENV = "test") => ({ APP_ENV, DATABASE_URL: inject("databaseUrl") });
/** The same instant the test support reads back through, so a version entered "today" is in force (ticket 100). */
const clock = () => new FakeClock(wib("2026-10-01 09:00"));
const SET = ["tanam", "--set", "rilis1"];
const SET3 = ["tanam", "--set", "rilis3"];

/** One small example Lokasi Mitra (Bukit Sejuk's, with three Tersedia Petak and one photo), so a case does not build five full Denah. */
const kecil = [
  sebagaiDataContoh(
    { ...CONTOH_LOKASI[4], photos: ["lokasi-blok.jpg"], jenisMakam: [{ ...CONTOH_LOKASI[4].jenisMakam[0], tersedia: 3 }] },
    5,
  ),
];

const jalan = (argv: string[], source: Record<string, string | undefined> = env(), lokasi = kecil) =>
  dataContohCommand(argv, source, { clock: clock(), lokasi });

/** A command that exits non-zero fails with its own output in the message, not only `expected 1 to be 0`. */
const berhasil = (hasil: { exitCode: number; output: string }) =>
  expect(hasil.exitCode, `data-contoh keluar dengan kode ${hasil.exitCode}:\n${hasil.output}`).toBe(0);

/** A temporary directory for the staging test's live FileStore; removed after the suite. */
const sementara: string[] = [];
afterAll(() => {
  for (const path of sementara) rmSync(path, { recursive: true, force: true });
});

/** Everything `readRuntimeEnv` requires on staging, plus a real (temporary) `FILES_ROOT` for the photos and the agreement scan. */
const stagingEnv = () => {
  const folder = mkdtempSync(join(tmpdir(), "makam-data-contoh-"));
  sementara.push(folder);
  return {
    ...env("staging"),
    AUTH_SECRET: "s".repeat(32),
    APP_BASE_URL: "https://makam.co.id",
    TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    SMTP_USER: "v1-user",
    SMTP_PASSWORD: "v1-password",
    EMAIL_FROM: "no-reply@makam.co.id",
    SUMOPOD_API_KEY: "sumopod-key",
    SUMOPOD_WEBHOOK_SECRET: "whsec_c3Vtb3BvZC10ZXN0LXNlY3JldA==",
    VAPID_PUBLIC_KEY: "BI9GUoKHw9z_J777Fi5TjIhzfL2qIT1Mwt43yL-4ClEIJe4nqMPuqV6N4fhPf0H0HElivGiE4yiJ63gf5uyry40",
    VAPID_PRIVATE_KEY: "Xpgeqwz12bqNco2x4H5dpW57Hqrr1zVY6ift2jx5YYc",
    VAPID_SUBJECT: "mailto:ops@makam.co.id",
    FILES_ROOT: folder,
  } as Record<string, string>;
};

async function stackDenganAdmin() {
  const setup = pemesananOnTestDatabase(db);
  const { actor: admin } = await adminPlatformOf(setup);
  return { setup, admin };
}

describe("the Rilis 1 set's names", () => {
  it("marks every name it seeds with (Contoh): Lokasi Mitra, pengelola, Kontak Siaga, Jenis Makam and the Blok of a Denah", () => {
    expect(LOKASI_RILIS1).toHaveLength(5);
    for (const lokasi of LOKASI_RILIS1) {
      const nama = [lokasi.name, lokasi.pengelolaName, lokasi.kontakSiagaName, ...lokasi.jenisMakam.map((jm) => jm.name), ...(lokasi.denahPrototipe ?? []).map((blok) => blok.nama)];
      for (const satu of nama) expect(satu, lokasi.name).toMatch(/\(Contoh\)$/);
    }
    expect(LOKASI_RILIS1.flatMap((lokasi) => lokasi.denahPrototipe ?? []).length).toBeGreaterThan(0);
  });
});

describe("data-contoh: where it may run", () => {
  it("refuses production without --izinkan-production, and staging without --izinkan-staging, before any database is touched", async () => {
    const production = await dataContohCommand([...SET, "--tulis"], { APP_ENV: "production" });
    expect(production).toMatchObject({ exitCode: 1 });
    expect(production.output).toContain("di production perlu --izinkan-production");
    // The Rilis 3 set (TPU prices, Mitra Jasa) is no way round it.
    for (const argv of [[...SET3, "--tulis"], SET3, ["cabut", "--tulis"]]) {
      expect((await dataContohCommand(argv, { APP_ENV: "production" })).output, argv.join(" ")).toContain("di production perlu --izinkan-production");
      expect((await dataContohCommand(argv, { APP_ENV: "staging" })).output, argv.join(" ")).toContain("di staging perlu --izinkan-staging");
    }

    const staging = await dataContohCommand(["status"], { APP_ENV: "staging" });
    expect(staging).toMatchObject({ exitCode: 1 });
    expect(staging.output).toContain("di staging perlu --izinkan-staging");

    // Each is named by its own flag: the other's does not stand in.
    const salahBendera = await dataContohCommand(["status", "--izinkan-staging"], { APP_ENV: "production" });
    expect(salahBendera.output).toContain("di production perlu --izinkan-production");
  });

  it("plants nothing on a production that pays through live SumoPod, even with its flag: example records never sit beside real operation", async () => {
    const live = await dataContohCommand([...SET, "--tulis", "--izinkan-production"], { APP_ENV: "production" });
    expect(live).toMatchObject({ exitCode: 1 });
    expect(live.output).toContain("tidak membayar lewat sandbox SumoPod");
    const sandbox = await dataContohCommand([...SET, "--izinkan-production"], {
      APP_ENV: "production",
      SUMOPOD_BASE_URL: "https://api-pay-sandbox.sumopod.com",
    });
    // Past the sandbox rule it goes on to read the environment, which this bare one does not complete.
    expect(sandbox.output).not.toContain("tidak membayar lewat sandbox SumoPod");
  });

  it("on production, with its flag and the SumoPod sandbox, plants the set but never enters Pengaturan Operator, and names the environment in every write", async () => {
    const { setup } = await stackDenganAdmin();
    const sebelum = (await setup.audit.allEntries()).length;
    const produksi = { ...stagingEnv(), APP_ENV: "production", SUMOPOD_BASE_URL: "https://api-pay-sandbox.sumopod.com" };

    berhasil(await jalan([...SET, "--tulis", "--izinkan-production"], produksi));

    expect((await setup.lokasi.publicLokasiMitraList()).map((one) => one.name)).toEqual([tandaContoh("Pemakaman Bukit Sejuk")]);
    // The Operator's own to fill in on production: the example values are never entered there.
    expect(await setup.operatorSettings.current()).toBeNull();
    const baru = (await setup.audit.allEntries()).slice(sebelum);
    expect(baru.length).toBeGreaterThan(10);
    expect(baru.filter((satu) => satu.reason !== "data-contoh tanam (production, --izinkan-production)").map((satu) => satu.action)).toEqual([]);
  });

  it("says how to use it for an unknown subcommand, a missing or unknown --set, or --set on another subcommand (exit 2)", async () => {
    for (const argv of [[], ["hapus"], ["tanam"], ["tanam", "--set", "rilis9"], ["cabut", "--set", "rilis1"], ["status", "ekstra"]]) {
      const hasil = await jalan(argv);
      expect(hasil.exitCode, argv.join(" ")).toBe(2);
      expect(hasil.output).toContain("Pakai: data-contoh");
    }
  });

  it("asks for seed:admin first when the stack has no Admin Platform", async () => {
    const hasil = await jalan([...SET, "--tulis"]);
    expect(hasil).toMatchObject({ exitCode: 1 });
    expect(hasil.output).toContain("Jalankan seed:admin dulu");
  });

  it("asks for seed:admin first for the dry run of cabut too, because the Mitra Jasa rates it checks are read as Admin Platform", async () => {
    for (const argv of [["cabut"], ["cabut", "--tulis"]]) {
      const hasil = await jalan(argv);
      expect(hasil, argv.join(" ")).toMatchObject({ exitCode: 1 });
      expect(hasil.output, argv.join(" ")).toContain("Jalankan seed:admin dulu");
    }
  });
});

describe("data-contoh tanam --set rilis1", () => {
  it("is a dry run without --tulis: it says what it would plant and writes nothing", async () => {
    const { setup } = await stackDenganAdmin();

    const hasil = await jalan(SET);

    berhasil(hasil);
    expect(hasil.output).toContain("Mode dry-run");
    expect(hasil.output).toContain("1 akan ditanam");
    expect(await setup.lokasi.publicLokasiMitraList()).toEqual([]);
    expect(await setup.tariffs.globalTariff("biaya_layanan_platform", setup.clock.now())).toBeNull();
    expect(await setup.operatorSettings.current()).toBeNull();
    expect(((await jalan(["status"])).output)).toContain("Tidak ada Data Contoh yang aktif");
  });

  it("plants a Lokasi Mitra named (Contoh) through the real publish gate, with example prices, a contoh Biaya Layanan Platform and staff on .invalid", async () => {
    const { setup, admin } = await stackDenganAdmin();

    berhasil(await jalan(SET.concat("--tulis")));

    const listed = await setup.lokasi.publicLokasiMitraList();
    expect(listed.map((one) => one.name)).toEqual([tandaContoh("Pemakaman Bukit Sejuk")]);
    const lokasiId = listed[0].id;
    const { jenisMakam } = await setup.tariffs.asStaff(admin).lokasiTariffs(lokasiId, setup.clock.now());
    expect(jenisMakam.map((one) => [one.name, one.inForce?.hargaHakPakai])).toEqual([[tandaContoh("Makam Standar"), 4_000_000]]);
    expect((await setup.tariffs.globalTariff("biaya_layanan_platform", setup.clock.now()))?.amount).toBe(100_000);
    // Its three Petak are Tersedia, open for booking.
    expect(await setup.inventory.tersediaPerJenisMakam(lokasiId)).toEqual([expect.objectContaining({ count: 3 })]);
    const staf = (await setup.identity.staffAccounts()).filter((akun) => !akun.roles.includes("admin_platform"));
    expect(staf.length).toBeGreaterThanOrEqual(2);
    for (const akun of staf) expect(akun.email).toMatch(/\.invalid$/);
    // On a stack that is not production the example Pengaturan Operator is entered when empty.
    expect(await setup.operatorSettings.current()).not.toBeNull();
    // Every write that can carry a reason names the command, so the Audit Log says where a row came from.
    const entri = await setup.audit.allEntriesForLokasi(lokasiId);
    expect(entri.filter((satu) => satu.action === "lokasi.buat").map((satu) => satu.reason)).toEqual(["data-contoh tanam"]);
    expect(entri.filter((satu) => satu.action === "data_contoh.tanam").map((satu) => satu.reason)).toEqual(["data-contoh tanam"]);
    expect(entri.filter((satu) => satu.action === "tarif.buat_jenis_makam").every((satu) => satu.reason === "data-contoh tanam")).toBe(true);
  });

  it("on staging, only with its flag, names the environment and the allowance in the reason of every write", async () => {
    const { setup } = await stackDenganAdmin();

    berhasil(await jalan([...SET, "--tulis", "--izinkan-staging"], stagingEnv()));

    const [lokasi] = await setup.lokasi.publicLokasiMitraList();
    const entri = await setup.audit.allEntriesForLokasi(lokasi.id);
    expect(entri.filter((satu) => satu.action === "lokasi.buat").map((satu) => satu.reason)).toEqual(["data-contoh tanam (staging, --izinkan-staging)"]);
    expect(entri.filter((satu) => satu.action === "data_contoh.tanam").map((satu) => satu.reason)).toEqual(["data-contoh tanam (staging, --izinkan-staging)"]);
  });

  it("every Entri Audit a tanam writes, in whichever module, carries a reason naming the command and the environment", async () => {
    const { setup } = await stackDenganAdmin();
    const sebelum = (await setup.audit.allEntries()).length;

    berhasil(await jalan([...SET, "--tulis", "--izinkan-staging"], stagingEnv()));

    const baru = (await setup.audit.allEntries()).slice(sebelum);
    expect(baru.length).toBeGreaterThan(10);
    expect(baru.filter((satu) => satu.reason !== "data-contoh tanam (staging, --izinkan-staging)").map((satu) => satu.action)).toEqual([]);
  });

  it("retires a Lokasi Mitra whose build failed, with its staff, and plants the same fixture again afterwards", async () => {
    const { setup, admin } = await stackDenganAdmin();
    // Two Jenis Makam of one name: the second is refused after the Lokasi Mitra and its Admin Lokasi exist.
    const rusak = [{ ...kecil[0], jenisMakam: [kecil[0].jenisMakam[0], kecil[0].jenisMakam[0]] }];

    const gagal = await jalan(SET.concat("--tulis"), env(), rusak);

    expect(gagal.exitCode).toBe(1);
    expect(gagal.output).toContain("gagal ditanam");
    // The failed fixture's whole tree is retired (its Lokasi Mitra, its Admin Lokasi's Akun, the Jenis Makam it had made);
    // the fixtures that were built before it (the platform fee, the Petugas Lapangan) stay.
    const sesudahGagal = (await jalan(["status"])).output;
    expect(sesudahGagal).not.toContain("lokasi_mitra");
    expect(sesudahGagal).not.toContain("jenis_makam");
    expect(sesudahGagal).toContain("akun_staf: 1");
    expect(sesudahGagal).toContain("tarif_global: 1");
    expect(await setup.lokasi.publicLokasiMitraList()).toEqual([]);
    const [sisa] = await setup.lokasi.allLokasiMitra(admin);
    const profil = await setup.lokasi.lokasiMitra(admin, sisa.id);
    expect(profil.ok && profil.lokasiMitra.dataContoh).toBe(true);

    // Identity lets one email ask for a new Kode Masuk once a minute, so the run that follows waits that long.
    const semenit = new FakeClock(wib("2026-10-01 09:05"));
    berhasil(await dataContohCommand(SET.concat("--tulis"), env(), { clock: semenit, lokasi: kecil }));

    expect((await setup.lokasi.publicLokasiMitraList()).map((one) => one.name)).toEqual([tandaContoh("Pemakaman Bukit Sejuk")]);
    expect((await jalan(["status"])).output).toContain("lokasi_mitra: 1");
    expect(await setup.lokasi.allLokasiMitra(admin)).toHaveLength(2);
  });

  it("records every entity it created and lists what is active per kind", async () => {
    await stackDenganAdmin();
    berhasil(await jalan(SET.concat("--tulis")));

    const status = await jalan(["status"]);

    berhasil(status);
    for (const baris of ["lokasi_mitra: 1", "jenis_makam: 1", "akun_staf: 2", "tarif_global: 1"]) expect(status.output).toContain(baris);
    expect(status.output).toContain("rilis1/lokasi/pemakaman-bukit-sejuk-contoh");
  });

  it("switches the catalog's Layanan on at each Lokasi with the example Lokasi price, and never touches a variant a Lokasi already prices", async () => {
    const { setup, admin } = await stackDenganAdmin();
    const katalog = createKatalogLayanan({ db, clock: setup.clock, audit: setup.audit });
    const dibuat = await katalog.createLayanan(admin, {
      name: "Karangan Bunga Papan",
      description: "Contoh",
      jenis: "bunga",
      bukti: buktiOf("bunga"),
      leadTimeDays: 1,
      bisaHariH: true,
      adaDiPetakKosong: false,
      teksLabel: null,
      varian: ["Standar"],
      reason: null,
    });
    if (!dibuat.ok) throw new Error("createLayanan refused");

    berhasil(await jalan(SET.concat("--tulis")));

    const [lokasi] = await setup.lokasi.publicLokasiMitraList();
    const harga = await setup.tariffs.hargaLayananLokasiSemua(lokasi.id, setup.clock.now());
    expect([...harga.values()].map((satu) => satu.amount)).toEqual([100_000]);
    expect((await jalan(["status"])).output).toContain("penawaran_layanan: 1");
    // Another run offers nothing again, so a price the Operator has since changed is never overwritten.
    const lagi = await jalan(SET.concat("--tulis"));
    berhasil(lagi);
    expect([...(await setup.tariffs.hargaLayananLokasiSemua(lokasi.id, setup.clock.now())).values()]).toHaveLength(1);
  });

  it("planting twice changes nothing", async () => {
    const { setup, admin } = await stackDenganAdmin();
    berhasil(await jalan(SET.concat("--tulis")));
    const sebelum = (await jalan(["status"])).output;

    const lagi = await jalan(SET.concat("--tulis"));

    berhasil(lagi);
    expect(lagi.output).toContain("tidak mengubah apa pun");
    expect((await jalan(["status"])).output).toBe(sebelum);
    expect(await setup.lokasi.allLokasiMitra(admin)).toHaveLength(1);
    expect(await setup.tariffs.globalTariffHistory("biaya_layanan_platform")).toHaveLength(1);
  });

  it("records the contoh Biaya Layanan Platform a killed tanam left unrecorded, so cabut still refuses while it is in force", async () => {
    const { setup, admin } = await stackDenganAdmin();
    // What a run killed between the price and its registry row leaves behind: the price, entered under this command's own reason, no row.
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 100_000, effectiveOn: "2026-10-01", reason: "data-contoh tanam" });
    expect((await jalan(["status"])).output).not.toContain("tarif_global");
    const uji = await jalan(SET);
    berhasil(uji);
    expect(uji.output).toContain("akan dicatat di registri");

    berhasil(await jalan(SET.concat("--tulis")));

    expect(await setup.tariffs.globalTariffHistory("biaya_layanan_platform")).toHaveLength(1);
    expect((await jalan(["status"])).output).toContain("tarif_global: 1");
    const hasil = await jalan(["cabut", "--tulis"]);
    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain("biaya_layanan_platform Rp 100.000");
    expect((await setup.lokasi.publicLokasiMitraList()).map((one) => one.name)).toEqual([tandaContoh("Pemakaman Bukit Sejuk")]);
  });

  it("does not enter the contoh Biaya Layanan Platform when a version of it is already set", async () => {
    const { setup, admin } = await stackDenganAdmin();
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 125_000, effectiveOn: "2026-10-01", reason: "harga asli" });

    berhasil(await jalan(SET.concat("--tulis")));

    expect(await setup.tariffs.globalTariffHistory("biaya_layanan_platform")).toHaveLength(1);
    expect((await jalan(["status"])).output).not.toContain("tarif_global");
    // Nothing of it is the set's to retire, and planting again still changes nothing.
    expect((await jalan(SET.concat("--tulis"))).output).toContain("tidak mengubah apa pun");
  });

  it("plants the five Lokasi Mitra of the set, each named (Contoh), two with Pemesanan Terencana on", { timeout: 120_000 }, async () => {
    const { setup } = await stackDenganAdmin();

    berhasil(await dataContohCommand(SET.concat("--tulis"), env(), { clock: clock() }));

    const listed = await setup.lokasi.publicLokasiMitraList();
    expect(listed).toHaveLength(5);
    expect(listed.map((one) => one.name).sort()).toEqual(LOKASI_RILIS1.map((one) => one.name).sort());
    for (const one of listed) expect(one.name).toMatch(/\(Contoh\)$/);
    expect(listed.filter((one) => one.terencanaAktif)).toHaveLength(2);
  });
});

describe("data-contoh cabut", () => {
  it("refuses, writing nothing, while the contoh Biaya Layanan Platform is still in force, and lists it", async () => {
    const { setup } = await stackDenganAdmin();
    berhasil(await jalan(SET.concat("--tulis")));

    const dryRun = await jalan(["cabut"]);
    const hasil = await jalan(["cabut", "--tulis"]);

    expect(dryRun.exitCode).toBe(1);
    expect(hasil).toMatchObject({ exitCode: 1 });
    expect(hasil.output).toContain("biaya_layanan_platform Rp 100.000");
    expect((await setup.lokasi.publicLokasiMitraList()).map((one) => one.name)).toEqual([tandaContoh("Pemakaman Bukit Sejuk")]);
    expect((await jalan(["status"])).output).toContain("tarif_global: 1");
  });

  it("refuses, writing nothing, while a contoh Biaya Layanan Platform a killed tanam entered and never recorded is still in force, and says the registry does not hold it", async () => {
    const { setup, admin } = await stackDenganAdmin();
    // What a tanam killed between entering the fee and recording it leaves: the price, entered under this command's own reason, and an empty registry.
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 100_000, effectiveOn: "2026-10-01", reason: "data-contoh tanam" });
    const entriSebelum = (await setup.audit.allEntries()).length;

    const dryRun = await jalan(["cabut"]);
    const hasil = await jalan(["cabut", "--tulis"]);
    const status = await jalan(["status"]);

    for (const satu of [dryRun, hasil]) {
      expect(satu.exitCode).toBe(1);
      expect(satu.output).toContain("biaya_layanan_platform Rp 100.000");
      expect(satu.output).toContain("tidak tercatat di registri");
    }
    expect(dryRun.output).not.toContain("Tidak ada Data Contoh yang aktif");
    berhasil(status);
    expect(status.output).toContain("biaya_layanan_platform Rp 100.000");
    expect(status.output).toContain("tidak tercatat di registri");
    expect(await setup.tariffs.globalTariffHistory("biaya_layanan_platform")).toHaveLength(1);
    expect((await setup.tariffs.globalTariff("biaya_layanan_platform", setup.clock.now()))?.amount).toBe(100_000);
    // The refused cabut and the status wrote nothing at all, not even an Entri Audit.
    expect((await setup.audit.allEntries()).length).toBe(entriSebelum);

    // The Operator's real fee supersedes it: cabut then has nothing left to refuse.
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 125_000, effectiveOn: "2026-10-01", reason: "harga asli" });
    const sesudah = await jalan(["cabut", "--tulis"]);
    berhasil(sesudah);
    expect((await jalan(["status"])).output).toContain("Tidak ada Data Contoh yang aktif");
  });

  it("is a dry run without --tulis once the price is superseded: it lists what it would retire and writes nothing", async () => {
    const { setup, admin } = await stackDenganAdmin();
    berhasil(await jalan(SET.concat("--tulis")));
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 125_000, effectiveOn: "2026-10-01", reason: "harga asli" });

    const hasil = await jalan(["cabut"]);

    berhasil(hasil);
    expect(hasil.output).toContain("Mode dry-run");
    expect(hasil.output).toContain("akan dicabut");
    expect((await setup.lokasi.publicLokasiMitraList()).map((one) => one.name)).toEqual([tandaContoh("Pemakaman Bukit Sejuk")]);
  });

  it("retires everything once a real price has superseded the contoh one, and exits 0 only when nothing contoh is left active", async () => {
    const { setup, admin } = await stackDenganAdmin();
    berhasil(await jalan(SET.concat("--tulis")));
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 125_000, effectiveOn: "2026-10-01", reason: "harga asli" });

    const hasil = await jalan(["cabut", "--tulis"]);

    berhasil(hasil);
    expect(hasil.output).toContain("Tidak ada yang aktif lagi");
    expect(await setup.lokasi.publicLokasiMitraList()).toEqual([]);
    const staf = (await setup.identity.staffAccounts()).filter((akun) => akun.email?.endsWith(".invalid"));
    expect(staf.length).toBeGreaterThanOrEqual(2);
    for (const akun of staf) expect(akun.deactivated).toBe(true);
    expect((await jalan(["status"])).output).toContain("Tidak ada Data Contoh yang aktif");
    // The real price is untouched and the only one in force.
    expect((await setup.tariffs.globalTariff("biaya_layanan_platform", setup.clock.now()))?.amount).toBe(125_000);
  });
});

/* The Rilis 2/3 set (ticket 111) */

const sekarang = () => wib("2026-10-01 09:00");

/** One example Lokasi Mitra of the Rilis 1 set cut down (one Jenis Makam, three Tersedia Petak, one photo), so a case does not build a full Denah. */
const lokasiKecil = (indeks: number) =>
  sebagaiDataContoh({ ...CONTOH_LOKASI[indeks], photos: ["lokasi-blok.jpg"], jenisMakam: [{ ...CONTOH_LOKASI[indeks].jenisMakam[0], tersedia: 3 }] }, indeks + 1);

/** The two Lokasi (Contoh) of the Rilis 1 set the Rilis 2 rules go on: Taman Makam Firdaus and Makam Masjid Nurul Huda. */
const NAMA_ATURAN = ATURAN_RILIS2_DATA_CONTOH.map((aturan) => tandaContoh(aturan.lokasi));

/** What a Rilis 3 run builds on: the launch data (DKI TPU and a catalog of Layanan) and the Lokasi (Contoh) the Rilis 2 rules go on, entered in the registry as `tanam --set rilis1` would. */
async function stackDenganDataPeluncuran(options: { lokasi?: boolean; katalog?: boolean; tpu?: boolean } = {}) {
  const setup: LayananSetup = layananOnTestDatabase(db);
  const { actor: admin } = await adminPlatformOf(setup);
  const komposisi = { db, clock: setup.clock, audit: setup.audit };
  const dataContoh = createDataContoh({
    ...komposisi,
    lokasi: setup.lokasi,
    identity: setup.identity,
    tariffs: setup.tariffs,
    layanan: { ...createPenawaranLayanan({ ...komposisi, tariffs: setup.tariffs }), ...createMitraJasaDaftar(komposisi) },
    wakaf: createNazhirList(komposisi),
    pemesanan: { pesananBerjalanDiLokasi: (lokasiId) => pesananBerjalanDiLokasi({ db }, lokasiId) },
  });
  let tpu: Awaited<ReturnType<typeof newTpuDki>> | null = null;
  if (options.tpu !== false) {
    tpu = await newTpuDki(setup, admin, "TPU Contoh Satu");
    await newTpuDki(setup, admin, "TPU Contoh Dua", false);
  }
  const varian: { id: string; jenis: "bunga" | "nisan"; nama: string }[] = [];
  if (options.katalog !== false) {
    const katalog = createKatalogLayanan(komposisi);
    const dasar = { description: "Contoh", teksLabel: null, adaDiPetakKosong: false, reason: null };
    const bunga = await katalog.createLayanan(admin, { ...dasar, name: "Karangan Bunga Papan", jenis: "bunga", bukti: buktiOf("bunga"), leadTimeDays: 1, bisaHariH: true, varian: ["Standar"] });
    const nisan = await katalog.createLayanan(admin, {
      ...dasar,
      name: "Batu Nisan",
      jenis: "nisan",
      bukti: buktiOf("nisan"),
      leadTimeDays: 14,
      bisaHariH: false,
      teksLabel: "Tulisan pada nisan",
      varian: ["Granit Hitam 60 x 80 cm", "Marmer Putih 60 x 80 cm"],
    });
    if (!bunga.ok || !nisan.ok) throw new Error("createLayanan refused");
    for (const layanan of [bunga.layanan, nisan.layanan]) for (const satu of layanan.varian) varian.push({ id: satu.id, jenis: layanan.jenis as "bunga" | "nisan", nama: `${layanan.name} / ${satu.name}` });
  }
  /** The two Lokasi (Contoh) the Rilis 2 rules go on, entered in the registry as the Rilis 1 set enters them: what a Rilis 3 run needs there before it plants. */
  const tanamLokasi = async () => {
    const tertanam: { id: string; nama: string }[] = [];
    for (const nama of NAMA_ATURAN) {
      const dibuat = await newLokasiMitra(setup, admin, nama);
      const dicatat = await dataContoh.catat(admin, { kode: `rilis1/lokasi/${slug(nama)}`, himpunan: "rilis1", jenis: "lokasi_mitra", entitasId: dibuat.id, reason: "data-contoh tanam (test)" });
      if (!dicatat.ok) throw new Error(`catat refused: ${dicatat.reason}`);
      tertanam.push({ id: dibuat.id, nama });
    }
    return tertanam;
  };
  const lokasi = options.lokasi !== false ? await tanamLokasi() : [];
  return { setup, admin, varian, lokasi, tpu, tanamLokasi };
}

/** What a TPU shows a family: the price of every variant offered there, by variant id. */
const hargaDiTpu = async (setup: LayananSetup) =>
  Object.fromEntries((await setup.layanan.penawaranTpu(setup.clock.now())).flatMap((layanan) => layanan.varian.map((satu) => [satu.id, satu.harga.total])));

describe("the Rilis 3 set's amounts", () => {
  it("are clearly round example amounts, and a Mitra Jasa is paid less than a family pays at a TPU", () => {
    for (const jenis of ["bunga", "nisan", "pembersihan", "perawatan", "laporan"] as const) {
      expect(HARGA_DKI_DATA_CONTOH[jenis] % 25_000, jenis).toBe(0);
      expect(TARIF_MITRA_JASA_DATA_CONTOH[jenis] % 25_000, jenis).toBe(0);
      expect(TARIF_MITRA_JASA_DATA_CONTOH[jenis], jenis).toBeLessThan(HARGA_DKI_DATA_CONTOH[jenis]);
    }
    expect(MITRA_JASA_DATA_CONTOH).toHaveLength(3);
    expect(NAZHIR_DATA_CONTOH).toHaveLength(2);
    expect(ATURAN_RILIS2_DATA_CONTOH).toHaveLength(2);
    for (const nama of [...MITRA_JASA_DATA_CONTOH.map((satu) => satu.namaLengkap), ...NAZHIR_DATA_CONTOH.map((satu) => satu.nama)]) expect(nama).toMatch(/\(Contoh\)$/);
    for (const satu of MITRA_JASA_DATA_CONTOH) expect(satu.email).toMatch(/\.invalid$/);
  });
});

describe("data-contoh tanam --set rilis3", () => {
  it("refuses, writing nothing, until the launch data and the Rilis 1 Lokasi (Contoh) are there, and says what is missing", async () => {
    const { setup } = await stackDenganDataPeluncuran({ lokasi: false, katalog: false, tpu: false });
    const entriSebelum = (await setup.audit.allEntries()).length;

    const hasil = await jalan([...SET3, "--tulis"]);

    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain("katalog Layanan kosong");
    expect(hasil.output).toContain("belum ada TPU DKI");
    expect(hasil.output).toContain("tanam --set rilis1");
    // Nothing was written, not even the Retribusi Pemda.
    expect(await setup.tariffs.globalTariff("retribusi_pemda_iptm", sekarang())).toBeNull();
    expect((await setup.audit.allEntries()).length).toBe(entriSebelum);
    // The dry run says the same.
    expect((await jalan(SET3)).exitCode).toBe(1);
  });

  it("asks for seed:admin first when the stack has no Admin Platform, for the dry run too (it reads the Mitra Jasa rates as Admin Platform)", async () => {
    for (const argv of [[...SET3, "--tulis"], SET3]) {
      const hasil = await jalan(argv);
      expect(hasil, argv.join(" ")).toMatchObject({ exitCode: 1 });
      expect(hasil.output, argv.join(" ")).toContain("Jalankan seed:admin dulu");
    }
  });

  it("names only what is missing: with the launch data there and the Rilis 1 Lokasi (Contoh) not, it does not blame both", async () => {
    await stackDenganDataPeluncuran({ lokasi: false });

    const hasil = await jalan([...SET3, "--tulis"]);

    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain("tanam --set rilis1");
    expect(hasil.output).not.toContain("katalog Layanan kosong");
    expect(hasil.output).not.toContain("belum ada TPU DKI");
    expect(hasil.output).not.toContain("keduanya");
  });

  it("says the Retribusi Pemda it entered stays when a later fixture fails, because it is a real value and no registry row holds it", async () => {
    const { setup, admin } = await stackDenganDataPeluncuran();
    const mitra = MITRA_JASA_DATA_CONTOH[0];
    // Somebody else already has this NIK: the Mitra Jasa (Contoh) cannot be created.
    const lain = await createMitraJasaDaftar({ db, clock: setup.clock, audit: setup.audit }).buatMitraJasa(admin, "orang.lain@contoh.makam.invalid", { namaLengkap: "Orang Lain", nik: mitra.nik, area: mitra.area });
    if (!lain.ok) throw new Error(`buatMitraJasa refused: ${lain.reason}`);

    const hasil = await jalan([...SET3, "--tulis"]);

    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain(`rilis3/mitra-jasa/${mitra.slug} gagal ditanam`);
    expect(hasil.output).toContain("Retribusi Pemda IPTM Rp 0");
    expect(hasil.output).toContain("tetap berlaku");
    expect((await setup.tariffs.globalTariff("retribusi_pemda_iptm", sekarang()))?.amount).toBe(0);
  });

  it("is a dry run without --tulis: it says what it would plant and writes nothing", async () => {
    const { setup, varian } = await stackDenganDataPeluncuran();
    const entriSebelum = (await setup.audit.allEntries()).length;

    const hasil = await jalan(SET3);

    berhasil(hasil);
    expect(hasil.output).toContain("Mode dry-run");
    expect(hasil.output).toContain(`Varian Layanan di katalog: ${varian.length}`);
    expect(hasil.output).toContain("Mitra Jasa (Contoh): 3 akan ditanam");
    expect(hasil.output).toContain("Nazhir (Contoh): 2 akan ditanam");
    expect(hasil.output).toContain("Aturan Rilis 2");
    expect(hasil.output).toContain("Retribusi Pemda IPTM: Rp 0 akan dimasukkan sebagai nilai asli");
    expect((await setup.audit.allEntries()).length).toBe(entriSebelum);
    expect(await hargaDiTpu(setup)).toEqual({});
    expect(await setup.tariffs.globalTariff("retribusi_pemda_iptm", sekarang())).toBeNull();
  });

  it("plants the TPU prices with their marks, 3 Mitra Jasa (Contoh), 2 Nazhir (Contoh), the Rilis 2 rules on 2 Lokasi and the Retribusi Pemda as a real value, all recorded in the registry", async () => {
    const { setup, admin, varian, lokasi } = await stackDenganDataPeluncuran();
    const entriSebelum = (await setup.audit.allEntries()).length;

    const hasil = await jalan([...SET3, "--tulis", "--izinkan-staging"], stagingEnv());

    berhasil(hasil);
    // DKI price per kind of Layanan, offered at a TPU: the family pays that alone.
    expect(await hargaDiTpu(setup)).toEqual(Object.fromEntries(varian.map((satu) => [satu.id, HARGA_DKI_DATA_CONTOH[satu.jenis]])));
    for (const satu of varian) {
      expect((await setup.tariffs.hargaLayananDki(satu.id, sekarang()))?.amount).toBe(HARGA_DKI_DATA_CONTOH[satu.jenis]);
      expect((await setup.tariffs.mitraJasaRate(admin, satu.id, sekarang()))?.amount).toBe(TARIF_MITRA_JASA_DATA_CONTOH[satu.jenis]);
    }
    expect(await setup.layanan.hargaPesananTpu(varian.map((satu) => satu.id))).toMatchObject({ total: varian.reduce((jumlah, satu) => jumlah + HARGA_DKI_DATA_CONTOH[satu.jenis], 0) });
    // The three Mitra Jasa (Contoh): Aktif, each with coverage, and offered by the assignment picker for a TPU job.
    const mitra = await setup.layanan.semuaMitraJasa(admin);
    expect(mitra.map((satu) => satu.namaLengkap).sort()).toEqual(MITRA_JASA_DATA_CONTOH.map((satu) => satu.namaLengkap).sort());
    for (const satu of mitra) {
      expect(satu.status).toBe("aktif");
      expect(satu.coverage.tpuDkiIds.length).toBeGreaterThan(0);
      expect(satu.coverage.layananVariantIds.length).toBeGreaterThan(0);
    }
    const [tpuSatu] = await setup.lokasi.tpuDkiList(admin);
    const tersedia = await setup.layanan.mitraJasaTersedia(admin, { tpuDkiId: tpuSatu.id, layananVariantId: varian[0].id, tanggal: "2026-10-10" });
    expect(tersedia.length).toBeGreaterThan(0);
    // The two Nazhir (Contoh).
    expect((await createNazhirList({ db, clock: setup.clock, audit: setup.audit }).daftarNazhir(admin)).map((satu) => satu.nama).sort()).toEqual(NAZHIR_DATA_CONTOH.map((satu) => satu.nama).sort());
    // The Rilis 2 rules on the two Lokasi, the rest of their policies and flags as the Rilis 1 set left them.
    for (const aturan of ATURAN_RILIS2_DATA_CONTOH) {
      const id = lokasi.find((satu) => satu.nama === tandaContoh(aturan.lokasi))!.id;
      const profil = await setup.lokasi.lokasiMitra(admin, id);
      if (!profil.ok) throw new Error("lokasiMitra refused");
      expect(profil.lokasiMitra.policies).toEqual({ ...DEFAULT_POLICIES, masaTenggangMonths: aturan.masaTenggangMonths, maxPerpanjanganTerms: aturan.maxPerpanjanganTerms, gantiPemegangHakFee: aturan.gantiPemegangHakFee });
      expect(profil.lokasiMitra.flags).toEqual({ ...DEFAULT_FLAGS, saleTransfersAllowed: true });
    }
    // The Retribusi Pemda IPTM is Rp 0 as a real value: a quote of it holds, and no contoh row names it.
    expect(await setup.tariffs.quote([{ kind: "retribusi_pemda", retribusi: "iptm" }], sekarang())).toMatchObject({ ok: true, total: 0 });
    const status = (await jalan(["status", "--izinkan-staging"], stagingEnv())).output;
    for (const baris of ["harga_layanan_dki: 3", "tarif_mitra_jasa: 3", "tanda_tpu_dki: 3", "mitra_jasa: 3", "nazhir: 2", "aturan_lokasi: 2"]) expect(status).toContain(baris);
    expect(status).not.toContain("retribusi");
    // Every write names the command and the environment; the Retribusi's real value says it is one.
    const baru = (await setup.audit.allEntries()).slice(entriSebelum);
    expect(baru.length).toBeGreaterThan(20);
    expect(baru.filter((satu) => !satu.reason?.includes("data-contoh tanam (staging, --izinkan-staging)")).map((satu) => satu.action)).toEqual([]);
    const retribusi = baru.find((satu) => satu.action === "tarif.ubah_global" && satu.entity.id === "retribusi_pemda_iptm");
    expect(retribusi?.reason).toMatch(/^nilai asli/);
  });

  it("prices, marks and covers all 11 variants of the launch catalog (6 Layanan), one DKI price and one rate per kind of Layanan", async () => {
    const { setup, admin } = await stackDenganDataPeluncuran({ katalog: false });
    // The catalog the owner's launch data brings (`docs/ops/data-peluncuran/katalog-layanan.csv`), imported the way the host imports it.
    const folder = fileURLToPath(new URL("../../docs/ops/data-peluncuran", import.meta.url));
    const diimpor = await olahKatalog(folder, db, (di) => createKatalogLayanan({ db: di, clock: setup.clock, audit: setup.audit }), admin, "import (test)");
    expect(diimpor.ditolak).toEqual([]);

    berhasil(await jalan([...SET3, "--tulis"]));

    const harga = await hargaDiTpu(setup);
    expect(Object.keys(harga)).toHaveLength(11);
    for (const layanan of await setup.layanan.katalog()) {
      for (const varian of layanan.varian) {
        expect(harga[varian.id], `${layanan.name} / ${varian.name}`).toBe(HARGA_DKI_DATA_CONTOH[layanan.jenis]);
        expect((await setup.tariffs.mitraJasaRate(admin, varian.id, sekarang()))?.amount, `${layanan.name} / ${varian.name}`).toBe(TARIF_MITRA_JASA_DATA_CONTOH[layanan.jenis]);
      }
    }
    // The three Mitra Jasa (Contoh) cover every variant, every variant but the four Batu Nisan, and every variant again.
    const cakupan = (await setup.layanan.semuaMitraJasa(admin)).map((satu) => satu.coverage.layananVariantIds.length).sort((a, b) => a - b);
    expect(cakupan).toEqual([7, 11, 11]);
  });

  it("works on top of the Rilis 1 set: its Lokasi (Contoh) get the Rilis 2 rules, and the dry run of cabut still waits for the contoh Biaya Layanan Platform", { timeout: 180_000 }, async () => {
    const { setup, admin } = await stackDenganDataPeluncuran({ lokasi: false });
    berhasil(await jalan([...SET, "--tulis"], env(), [lokasiKecil(0), lokasiKecil(2)]));

    const hasil = await jalan([...SET3, "--tulis"]);

    berhasil(hasil);
    const [firdaus] = (await setup.lokasi.publicLokasiMitraList()).filter((satu) => satu.name === tandaContoh("Taman Makam Firdaus"));
    const profil = await setup.lokasi.lokasiMitra(admin, firdaus.id);
    expect(profil.ok && profil.lokasiMitra.flags.saleTransfersAllowed).toBe(true);
    expect(profil.ok && profil.lokasiMitra.flags.tumpang.allowed).toBe(true);
    const dryRun = await jalan(["cabut"]);
    expect(dryRun.exitCode).toBe(1);
    expect(dryRun.output).toContain("biaya_layanan_platform Rp 100.000");
    expect(dryRun.output).toContain("lagi ditawarkan di TPU");
  });

  it("planting twice changes nothing", async () => {
    const { setup, admin, varian } = await stackDenganDataPeluncuran();
    berhasil(await jalan([...SET3, "--tulis"]));
    const status = (await jalan(["status"])).output;
    const entriSebelum = (await setup.audit.allEntries()).length;

    const lagi = await jalan([...SET3, "--tulis"]);

    berhasil(lagi);
    expect(lagi.output).toContain("tidak mengubah apa pun");
    expect((await jalan(["status"])).output).toBe(status);
    expect((await setup.audit.allEntries()).length).toBe(entriSebelum);
    for (const satu of varian) {
      expect(await setup.tariffs.hargaLayananDkiHistory(satu.id)).toHaveLength(1);
      expect(await setup.tariffs.mitraJasaRateHistory(admin, satu.id)).toHaveLength(1);
    }
    expect(await setup.tariffs.globalTariffHistory("retribusi_pemda_iptm")).toHaveLength(1);
    expect(await setup.layanan.semuaMitraJasa(admin)).toHaveLength(3);
  });

  it("leaves a variant the Operator already prices to the Operator: no contoh price, no contoh rate, no mark; the Retribusi Pemda stays the Operator's too", async () => {
    const { setup, admin, varian } = await stackDenganDataPeluncuran();
    const [milikOperator, ...lain] = varian;
    await setup.tariffs.setHargaLayananDki(admin, milikOperator.id, { amount: 123_000, effectiveOn: "2026-10-01", reason: "harga asli" });
    await setup.tariffs.setTarifMitraJasa(admin, milikOperator.id, { amount: 80_000, effectiveOn: "2026-10-01", reason: "tarif asli" });
    await setup.tariffs.setGlobalTariff(admin, { key: "retribusi_pemda_iptm", amount: 50_000, effectiveOn: "2026-10-01", reason: "retribusi asli" });

    berhasil(await jalan([...SET3, "--tulis"]));

    expect(await setup.tariffs.hargaLayananDkiHistory(milikOperator.id)).toHaveLength(1);
    expect((await setup.tariffs.mitraJasaRate(admin, milikOperator.id, sekarang()))?.amount).toBe(80_000);
    // Not marked, so not offered at a TPU: the Operator decides that for a variant of their own.
    expect(await hargaDiTpu(setup)).toEqual(Object.fromEntries(lain.map((satu) => [satu.id, HARGA_DKI_DATA_CONTOH[satu.jenis]])));
    expect((await setup.tariffs.globalTariff("retribusi_pemda_iptm", sekarang()))?.amount).toBe(50_000);
    expect(await setup.tariffs.globalTariffHistory("retribusi_pemda_iptm")).toHaveLength(1);
    const status = (await jalan(["status"])).output;
    expect(status).toContain(`harga_layanan_dki: ${lain.length}`);
    expect(status).toContain(`tanda_tpu_dki: ${lain.length}`);
  });

  it("leaves the Rilis 2 rules of a Lokasi someone else has already set, and still records the ones it has applied", async () => {
    const { setup, admin, lokasi } = await stackDenganDataPeluncuran();
    const [dikerjakanOperator, lain] = lokasi;
    const profil = await setup.lokasi.lokasiMitra(admin, dikerjakanOperator.id);
    if (!profil.ok) throw new Error("lokasiMitra refused");
    const { policies, flags } = profil.lokasiMitra;
    expect((await setup.lokasi.setPoliciesAndFlags(admin, dikerjakanOperator.id, { policies: { ...policies, gantiPemegangHakFee: 750_000 }, flags })).ok).toBe(true);

    berhasil(await jalan([...SET3, "--tulis"]));

    const sesudah = await setup.lokasi.lokasiMitra(admin, dikerjakanOperator.id);
    expect(sesudah.ok && sesudah.lokasiMitra.policies.gantiPemegangHakFee).toBe(750_000);
    expect(sesudah.ok && sesudah.lokasiMitra.flags.saleTransfersAllowed).toBe(false);
    const terpasang = await setup.lokasi.lokasiMitra(admin, lain.id);
    expect(terpasang.ok && terpasang.lokasiMitra.flags.saleTransfersAllowed).toBe(true);
    expect((await jalan(["status"])).output).toContain("aturan_lokasi: 1");
  });

  it("takes up a Mitra Jasa (Contoh) and a Nazhir (Contoh) a killed run left unrecorded, instead of adding a second one", async () => {
    const { setup, admin } = await stackDenganDataPeluncuran();
    const mitraSatu = MITRA_JASA_DATA_CONTOH[0];
    const nazhirSatu = NAZHIR_DATA_CONTOH[0];
    // What a run killed between creating them and recording them leaves: the records, no registry row.
    const dibuat = await createMitraJasaDaftar({ db, clock: setup.clock, audit: setup.audit }).buatMitraJasa(admin, mitraSatu.email, { namaLengkap: mitraSatu.namaLengkap, nik: mitraSatu.nik, area: mitraSatu.area });
    if (!dibuat.ok) throw new Error(`buatMitraJasa refused: ${dibuat.reason}`);
    const daftar = createNazhirList({ db, clock: setup.clock, audit: setup.audit });
    const nazhir = await daftar.tambahNazhir(admin, { nama: nazhirSatu.nama, jenis: nazhirSatu.jenis, kabKota: nazhirSatu.kabKota, kontak: nazhirSatu.kontak, nomorBwi: nazhirSatu.nomorBwi });
    if (!nazhir.ok) throw new Error("tambahNazhir refused");

    berhasil(await jalan([...SET3, "--tulis"]));

    expect(await setup.layanan.semuaMitraJasa(admin)).toHaveLength(3);
    expect(await daftar.daftarNazhir(admin)).toHaveLength(2);
    const status = (await jalan(["status"])).output;
    expect(status).toContain("mitra_jasa: 3");
    expect(status).toContain("nazhir: 2");
    expect(await setup.layanan.bacaMitraJasa(admin, dibuat.mitraJasaId)).toMatchObject({ ok: true, mitraJasa: { status: "aktif", coverage: { tpuDkiIds: expect.any(Array) } } });
  });
});

describe("data-contoh cabut after tanam --set rilis3", () => {
  /** The contoh Biaya Layanan Platform of the Rilis 1 set is not in these cases: a real fee is in force, so only Rilis 3's own entries are under test. */
  async function stackDenganRilis3() {
    const stack = await stackDenganDataPeluncuran();
    await stack.setup.tariffs.setGlobalTariff(stack.admin, { key: "biaya_layanan_platform", amount: 125_000, effectiveOn: "2026-10-01", reason: "harga asli" });
    berhasil(await jalan([...SET3, "--tulis"]));
    return stack;
  }

  it("a TPU quote succeeds after tanam and is unavailable again after cabut without a real price: the variants are no longer offered at a TPU", async () => {
    const { setup, varian } = await stackDenganRilis3();
    const ids = varian.map((satu) => satu.id);
    expect(await setup.layanan.hargaPesananTpu(ids)).not.toBeNull();
    expect(Object.keys(await hargaDiTpu(setup)).sort()).toEqual([...ids].sort());

    const dryRun = await jalan(["cabut"]);
    const hasil = await jalan(["cabut", "--tulis"]);

    expect(dryRun.output).toContain("lagi ditawarkan di TPU");
    for (const nama of varian.map((satu) => satu.nama)) expect(dryRun.output).toContain(nama);
    berhasil(hasil);
    expect(hasil.output).toContain("lagi ditawarkan di TPU");
    expect(await setup.layanan.hargaPesananTpu(ids)).toBeNull();
    expect(await hargaDiTpu(setup)).toEqual({});
    expect((await jalan(["status"])).output).toContain("Tidak ada Data Contoh yang aktif");
  });

  it("sets the Mitra Jasa (Contoh) to Berhenti and removes the Nazhir (Contoh), and keeps the Retribusi Pemda it entered as a real value", async () => {
    const { setup, admin } = await stackDenganRilis3();
    const daftar = createNazhirList({ db, clock: setup.clock, audit: setup.audit });
    const nazhirAsli = await daftar.tambahNazhir(admin, { nama: "Nazhir Asli", jenis: "perorangan", kabKota: "Kota Bogor", kontak: "0251-123", nomorBwi: "BWI-1" });
    if (!nazhirAsli.ok) throw new Error("tambahNazhir refused");

    berhasil(await jalan(["cabut", "--tulis"]));

    for (const satu of await setup.layanan.semuaMitraJasa(admin)) expect(satu.status).toBe("berhenti");
    expect((await daftar.daftarNazhir(admin)).map((satu) => satu.nama)).toEqual(["Nazhir Asli"]);
    expect((await setup.tariffs.globalTariff("retribusi_pemda_iptm", sekarang()))?.amount).toBe(0);
    expect(await setup.tariffs.quote([{ kind: "retribusi_pemda", retribusi: "iptm" }], sekarang())).toMatchObject({ ok: true });
  });

  it("tells the dry run to enter real prices before cabut --tulis, and only the run itself to mark the variants again, because nothing has been unmarked before it", async () => {
    await stackDenganRilis3();

    const dryRun = await jalan(["cabut"]);
    const hasil = await jalan(["cabut", "--tulis"]);

    expect(dryRun.output).toContain("lagi ditawarkan di TPU");
    expect(dryRun.output).toContain("sebelum cabut --tulis");
    expect(dryRun.output).not.toContain("tandai variannya lagi");
    expect(hasil.output).toContain("tandai variannya lagi");
  });

  it("takes a variant somebody marked again after cabut, still at its example price, off the TPU listing at the next cabut, and the dry run lists it first", async () => {
    const { setup, admin, varian } = await stackDenganRilis3();
    berhasil(await jalan(["cabut", "--tulis"]));
    expect(await hargaDiTpu(setup)).toEqual({});
    const [satu] = varian;
    expect((await setup.layanan.tandaiBolehDiTpu(admin, satu.id, { boleh: true, reason: "ditandai lagi" })).ok).toBe(true);
    expect(await hargaDiTpu(setup)).toEqual({ [satu.id]: HARGA_DKI_DATA_CONTOH[satu.jenis] });

    const dryRun = await jalan(["cabut"]);
    const hasil = await jalan(["cabut", "--tulis"]);

    berhasil(dryRun);
    expect(dryRun.output).toContain("Registri tidak memegang entri aktif");
    expect(dryRun.output).toContain(satu.nama);
    expect(await hargaDiTpu(setup)).toEqual({});
    berhasil(hasil);
    expect(hasil.output).toContain(satu.nama);
  });

  it("keeps a variant offered at a TPU once the Operator has entered a real DKI price and a real Mitra Jasa rate for it, and stops offering the rest", async () => {
    const { setup, admin, varian } = await stackDenganRilis3();
    const [tetap, ...lain] = varian;
    await setup.tariffs.setHargaLayananDki(admin, tetap.id, { amount: 175_000, effectiveOn: "2026-10-01", reason: "harga asli" });
    await setup.tariffs.setTarifMitraJasa(admin, tetap.id, { amount: 120_000, effectiveOn: "2026-10-01", reason: "tarif asli" });

    const hasil = await jalan(["cabut", "--tulis"]);

    berhasil(hasil);
    expect(await hargaDiTpu(setup)).toEqual({ [tetap.id]: 175_000 });
    for (const satu of lain) expect(hasil.output).toContain(satu.nama);
    expect(hasil.output).not.toContain(tetap.nama);
  });

  it("every Entri Audit a cabut writes after tanam --set rilis3, in whichever module, carries a reason naming the command: the Nazhir removal too, which Wakaf writes without one of its own", async () => {
    const { setup } = await stackDenganRilis3();
    const sebelum = (await setup.audit.allEntries()).length;

    berhasil(await jalan(["cabut", "--tulis"]));

    const baru = (await setup.audit.allEntries()).slice(sebelum);
    expect(baru.filter((satu) => satu.action === "wakaf.nazhir_hapus")).toHaveLength(2);
    expect(baru.filter((satu) => satu.action === "mitra_jasa.ubah_status")).toHaveLength(3);
    expect(baru.length).toBeGreaterThan(10);
    expect(baru.filter((satu) => !satu.reason?.startsWith("data-contoh cabut")).map((satu) => satu.action)).toEqual([]);
  });

  it("takes up again the Mitra Jasa (Contoh) an earlier cabut ended when it plants again: Aktif once more with their coverage, three of them and no second set", async () => {
    const { setup, admin, tpu, varian, tanamLokasi } = await stackDenganRilis3();
    const bunga = varian.find((satu) => satu.jenis === "bunga");
    if (!tpu || !bunga) throw new Error("the stack lacks a TPU or a Karangan Bunga");
    const kebutuhan = { tpuDkiId: tpu.id, layananVariantId: bunga.id, tanggal: "2026-10-10" };
    const dipilih = async () => (await setup.layanan.mitraJasaTersedia(admin, kebutuhan)).map((satu) => satu.namaLengkap).sort();
    const semula = await dipilih();
    expect(semula.length).toBeGreaterThan(0);
    berhasil(await jalan(["cabut", "--tulis"]));
    expect((await setup.layanan.semuaMitraJasa(admin)).map((satu) => satu.status)).toEqual(["berhenti", "berhenti", "berhenti"]);
    expect(await dipilih()).toEqual([]);
    // The Rilis 1 Lokasi (Contoh) went with that cabut, and a Rilis 3 run builds on them: they are planted again first.
    await tanamLokasi();

    const hasil = await jalan([...SET3, "--tulis"]);

    berhasil(hasil);
    expect((await setup.layanan.semuaMitraJasa(admin)).map((satu) => satu.status)).toEqual(["aktif", "aktif", "aktif"]);
    expect((await jalan(["status"])).output).toContain("mitra_jasa: 3");
    expect(await dipilih()).toEqual(semula);
  });

  /** A paid TPU order of a Karangan Bunga, handed to one Mitra Jasa (Contoh), who accepts it and takes the first photo: work in the ground. */
  async function pekerjaanSedangDikerjakan(stack: Awaited<ReturnType<typeof stackDenganRilis3>>, persona: (typeof MITRA_JASA_DATA_CONTOH)[number], targetDate: string) {
    const { setup, admin, tpu, varian } = stack;
    const bunga = varian.find((satu) => satu.jenis === "bunga");
    const mitra = (await setup.layanan.semuaMitraJasa(admin)).find((satu) => satu.email === persona.email);
    if (!tpu || !bunga || !mitra) throw new Error("the stack lacks a TPU, a Karangan Bunga or the Mitra Jasa (Contoh)");
    // Every Tagihan is headed with Pengaturan Operator, so one can only be issued once it is entered.
    await siapkanOperatorLayanan(setup);
    const { pemesan } = await pemesanDenganEmail(setup, "pemesan.tpu@contoh.id");
    const dipesan = await setup.layanan.placePesananLayananTpu(pemesan, orderTpu({ tpu }, [{ layananVariantId: bunga.id, targetDate }]));
    if (!dipesan.ok) throw new Error(`TPU order refused: ${dipesan.reason}`);
    const dibayar = await setup.billing.recordPayment(dipesan.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: setup.clock.now() });
    if (!dibayar.ok) throw new Error("payment refused");
    const [pekerjaan] = await setup.layanan.pekerjaanTpuUntukStaf(admin);
    const ditugaskan = await setup.layanan.tugaskanMitraJasa(admin, { pekerjaanId: pekerjaan.id, mitraJasaId: mitra.id });
    if (!ditugaskan.ok) throw new Error(`assign refused: ${ditugaskan.reason}`);
    const actor = await signedInMitraJasa(setup, admin, persona.email);
    const diterima = await setup.layanan.jawabPenugasan(actor, { pekerjaanId: pekerjaan.id, jawaban: "terima" });
    if (!diterima.ok) throw new Error(`accept refused: ${diterima.reason}`);
    const foto = await setup.layanan.simpanBuktiTpu(actor, {
      pekerjaanId: pekerjaan.id,
      kind: "foto_sesudah",
      takenAt: setup.clock.now(),
      file: { body: new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]), contentType: "image/jpeg" },
    });
    if (!foto.ok) throw new Error(`photo refused: ${foto.reason}`);
    return { pekerjaanId: pekerjaan.id, mitraJasaId: mitra.id, actor };
  }

  it("lists the job a Mitra Jasa (Contoh) has in progress when cabut ends them, leaves it with them, and points to the Pekerjaan TPU screen, where Admin Platform reassigns it", async () => {
    const stack = await stackDenganRilis3();
    const agus = MITRA_JASA_DATA_CONTOH[0];
    const { pekerjaanId, mitraJasaId, actor } = await pekerjaanSedangDikerjakan(stack, agus, "2026-10-05");

    const hasil = await jalan(["cabut", "--tulis"]);

    berhasil(hasil);
    const baris = hasil.output.split("\n");
    const laporan = baris.findIndex((satu) => satu.includes("pekerjaan masih berjalan"));
    expect(laporan, hasil.output).toBeGreaterThanOrEqual(0);
    expect(baris[laporan]).toContain("1 pekerjaan masih berjalan pada Mitra Jasa (Contoh)");
    expect(baris[laporan]).toContain("layar Pekerjaan TPU");
    expect(baris[laporan]).not.toContain("layar Layanan");
    expect(baris[laporan + 1]).toContain(`rilis3/mitra-jasa/${agus.slug}`);
    expect(baris[laporan + 1]).toContain("target 2026-10-05");
    // "tidak dilepas": the work in the ground stays with the Mitra Jasa, who is Berhenti now.
    expect(await stack.setup.layanan.bacaMitraJasa(stack.admin, mitraJasaId)).toMatchObject({ ok: true, mitraJasa: { status: "berhenti" } });
    expect((await stack.setup.layanan.pekerjaanTpuSaya(actor)).aktif.map((satu) => satu.id)).toEqual([pekerjaanId]);
  });
});
