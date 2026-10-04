/**
 * Data Contoh, the command (ticket 109): plants the marked "(Contoh)" set of Rilis 1, lists
 * what is active and retires all of it. Driven only through the command and read back through
 * the owning modules' own public reads, the way the public site and the staff screens read them.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { FakeClock } from "@/adapters/memory";
import { buktiOf, createKatalogLayanan } from "@/domain/layanan";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { adminPlatformOf } from "../../tests/support/identity";
import { pemesananOnTestDatabase } from "../../tests/support/pemesanan";
import { dataContohCommand } from "./data-contoh-command";
import { LOKASI_RILIS1, sebagaiDataContoh, tandaContoh } from "./data-contoh/rilis1";
import { CONTOH_LOKASI } from "./seed-contoh-publik-command";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const env = (APP_ENV = "test") => ({ APP_ENV, DATABASE_URL: inject("databaseUrl") });
/** The same instant the test support reads back through, so a version entered "today" is in force (ticket 100). */
const clock = () => new FakeClock(wib("2026-10-01 09:00"));
const SET = ["tanam", "--set", "rilis1"];

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

describe("data-contoh: where it may run", () => {
  it("refuses production without --izinkan-production, and staging without --izinkan-staging, before any database is touched", async () => {
    const production = await dataContohCommand([...SET, "--tulis"], { APP_ENV: "production" });
    expect(production).toMatchObject({ exitCode: 1 });
    expect(production.output).toContain("di production perlu --izinkan-production");

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
