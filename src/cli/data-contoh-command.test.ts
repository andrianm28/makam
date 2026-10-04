/**
 * Data Contoh, the command (ticket 109): plants the marked "(Contoh)" set of Rilis 1, lists
 * what is active and retires all of it. Driven only through the command and read back through
 * the owning modules' own public reads, the way the public site and the staff screens read them.
 */
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { FakeClock } from "@/adapters/memory";
import { buktiOf, createKatalogLayanan } from "@/domain/layanan";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { adminPlatformOf } from "../../tests/support/identity";
import { pemesananOnTestDatabase } from "../../tests/support/pemesanan";
import { dataContohCommand, pengaturanOperatorBolehDiisi } from "./data-contoh-command";
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

  it("never enters Pengaturan Operator on production", () => {
    expect(pengaturanOperatorBolehDiisi("production")).toBe(false);
    for (const lingkungan of ["development", "test", "staging"]) expect(pengaturanOperatorBolehDiisi(lingkungan)).toBe(true);
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
    // The prices the family sees are all-in: the example Hak Pakai plus the example platform fee.
    expect(await setup.inventory.tersediaPerJenisMakam(lokasiId)).toEqual([expect.objectContaining({ count: 3 })]);
    const staf = (await setup.identity.staffAccounts()).filter((akun) => !akun.roles.includes("admin_platform"));
    expect(staf.length).toBeGreaterThanOrEqual(2);
    for (const akun of staf) expect(akun.email).toMatch(/\.invalid$/);
    // On a stack that is not production the example Pengaturan Operator is entered when empty.
    expect(await setup.operatorSettings.current()).not.toBeNull();
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

  it("does not enter the contoh Biaya Layanan Platform when a version of it is already set", async () => {
    const { setup, admin } = await stackDenganAdmin();
    await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 125_000, effectiveOn: "2026-10-01", reason: "harga asli" });

    berhasil(await jalan(SET.concat("--tulis")));

    expect(await setup.tariffs.globalTariffHistory("biaya_layanan_platform")).toHaveLength(1);
    expect((await jalan(["status"])).output).not.toContain("tarif_global");
  });

  it("plants the five Lokasi Mitra of the set, each named (Contoh), two with Pemesanan Terencana on", { timeout: 600_000 }, async () => {
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
