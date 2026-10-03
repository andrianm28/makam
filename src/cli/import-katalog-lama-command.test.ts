import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { FakeClock } from "@/adapters/memory";
import { createKatalogLama } from "@/domain/katalog-lama";
import { createTariffs } from "@/domain/tariffs";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { signedInAdminPlatform } from "../../tests/support/identity";
import { lokasiOnTestDatabase } from "../../tests/support/lokasi";
import { importKatalogLamaCommand } from "./import-katalog-lama-command";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The example export the tool ships, which is also what a dry run is proved on. */
const CONTOH = fileURLToPath(new URL("./katalog-lama/fixtures/katalog-lama-contoh.json", import.meta.url));
/** The Clock the fake adapters stand on, so every price has the same effective date on every run. */
const clock = () => new FakeClock(wib("2026-10-01 09:00"));
const env = () => ({ APP_ENV: "test", DATABASE_URL: inject("databaseUrl") });

const sementara: string[] = [];
afterAll(() => {
  for (const path of sementara) rmSync(path, { recursive: true, force: true });
});

/** The environment of a live stack (staging or production), so the adapters are the live ones. */
function stackLive(appEnv: "staging" | "production"): Record<string, string> {
  return {
    ...env(),
    APP_ENV: appEnv,
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
  } as Record<string, string>;
}

/** An export in a temporary file, so a case may change the example. */
function berkas(dokumen: unknown): string {
  const folder = mkdtempSync(join(tmpdir(), "makam-katalog-lama-"));
  sementara.push(folder);
  const path = join(folder, "katalog-lama.json");
  writeFileSync(path, typeof dokumen === "string" ? dokumen : JSON.stringify(dokumen));
  return path;
}

/** The example export, changed by `ubah`, in a temporary file. */
function contohDiubah(ubah: (dokumen: Record<string, unknown>) => void): string {
  const dokumen = JSON.parse(readFileSync(CONTOH, "utf8")) as Record<string, unknown>;
  ubah(dokumen);
  return berkas(dokumen);
}

/** The modules the import writes through, plus the Admin Platform it acts as, on the test database. */
async function modul() {
  const test = lokasiOnTestDatabase(db);
  const katalog = createKatalogLama({ db, clock: test.clock, audit: test.audit });
  const admin = (await signedInAdminPlatform(test)).actor;
  return {
    ...test,
    katalog,
    admin,
    tariffs: createTariffs({ db, clock: test.clock, audit: test.audit, lokasi: test.lokasi }),
    /** The Lokasi Mitra one old catalog code was imported as, as the module reads it. */
    async lokasiMitra(kode: string) {
      const impor = await katalog.lokasi(kode);
      if (!impor?.lokasiId) throw new Error(`${kode} belum diimpor`);
      const record = await test.lokasi.lokasiMitra(admin, impor.lokasiId);
      if (!record.ok) throw new Error(`${kode}: ${record.reason}`);
      return record.lokasiMitra;
    },
  };
}

describe("npm run import:katalog-lama -- --sumber <ekspor.json>", () => {
  it("dry-runs by default: it reports what would come across and writes nothing", async () => {
    const { katalog, lokasi, admin } = await modul();

    const hasil = await importKatalogLamaCommand(["--sumber", CONTOH], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(0);
    expect(hasil.output).toContain("Mode dry-run: tidak ada yang ditulis.");
    expect(hasil.output).toContain("Lokasi: 3 dibaca, 3 akan diimpor, 1 ditolak.");
    expect(hasil.output).toContain("Jenis Makam: 5 dibaca, 4 akan diimpor.");
    expect(hasil.output).toContain("Di luar cap QRIS Rp 10.000.000, tetap diimpor tapi tidak ditampilkan (1):");
    expect(hasil.output).toContain("TPU-BT-01-DLX: Rp 12.750.000");
    expect(hasil.output).toContain("Pertanyaan untuk owner (5):");
    expect(hasil.output).toContain('Aplikasi lama menyimpan status terbit "draft"');
    expect(hasil.output).toContain('Data contoh di aplikasi lama (2 Lokasi): TPU-BT-01 (alamat diawali "Jl. Contoh")');
    expect(hasil.output).toContain("Katalog ini bukan data makam sungguhan");
    expect(hasil.output).toContain("Gunakan --tulis untuk menulisnya ke v1.");
    expect(await katalog.diimpor()).toEqual({ lokasi: [], jenisMakam: [] });
    expect(await lokasi.allLokasiMitra(admin)).toEqual([]);
  });

  it("writes a Lokasi Mitra with its profile and its priced Jenis Makam with --tulis", async () => {
    const { lokasiMitra, tariffs, admin, katalog } = await modul();

    const hasil = await importKatalogLamaCommand(["--sumber", CONTOH, "--tulis"], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(0);
    expect(hasil.output).toContain("Ditulis: 3 Lokasi Mitra dan 4 Jenis Makam.");

    const lokasi = await lokasiMitra("TPU-BT-01");
    expect(lokasi).toMatchObject({
      name: "TPU Contoh Satu",
      pengelolaName: "PJT Contoh Satu",
      address: "Jl. Contoh No. 1, Kota Contoh",
      city: "Kota Contoh",
      status: "belum_tayang",
      pin: { lat: -6.2, lng: 106.865 },
      facilities: { checked: ["parkir", "toilet"], note: "Fasilitas contoh, bukan data sebenarnya." },
      dataContoh: true,
    });
    const tarif = await tariffs.asStaff(admin).lokasiTariffs(lokasi.id, wib("2026-10-01 09:00"));
    expect(tarif.jenisMakam.map((jenis) => jenis.name)).toEqual(["Makam Deluxe", "Makam Standar"]);
    expect(tarif.jenisMakam.find((jenis) => jenis.name === "Makam Standar")?.inForce).toMatchObject({
      hargaHakPakai: 3_500_000,
      tenure: { kind: "tahun", years: 10 },
      hargaPerpanjangan: 1_750_000,
    });
    expect(tarif.biayaPemakaman.inForce).toMatchObject({ biayaPemakaman: 750_000, biayaPemakamanTumpang: 1_000_000 });
    // The old code is what the beta keeps, so an Admin Platform can trace a Lokasi back to the old app.
    expect(await katalog.lokasi("TPU-BT-01")).toMatchObject({ lokasiId: lokasi.id, sudahTerikat: true });
  });

  it("keeps a Jenis Makam over the QRIS cap, and the public pricing leaves it out", async () => {
    const { lokasiMitra, tariffs, admin } = await modul();
    // The platform fee a quote adds on a Lokasi Mitra order; without it nothing can be quoted at all.
    await tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 25_000, effectiveOn: "2026-10-01", reason: null });
    await importKatalogLamaCommand(["--sumber", CONTOH, "--tulis"], env(), { clock: clock() });

    const lokasi = await lokasiMitra("TPU-BT-01");
    const seenuh = await tariffs.asStaff(admin).lokasiTariffs(lokasi.id, wib("2026-10-01 09:00"));
    const publik = await tariffs.asStaff(admin).lokasiPricing(lokasi.id, wib("2026-10-01 09:00"));

    expect(seenuh.jenisMakam.map((jenis) => jenis.name)).toContain("Makam Deluxe");
    expect(publik.jenisMakam.map((kartu) => kartu.jenisMakam.name)).toEqual(["Makam Standar"]);
  });

  it("refuses a price the old app had already put in force, and counts it as a question for the owner", async () => {
    const { lokasiMitra, tariffs, admin } = await modul();
    const path = contohDiubah((dokumen) => {
      const lokasi = (dokumen.lokasi as Record<string, unknown>[])[0];
      (lokasi.jenisMakam as Record<string, unknown>[])[0].berlakuMulai = "2026-01-01";
    });

    const hasil = await importKatalogLamaCommand(["--sumber", path, "--tulis"], env(), { clock: clock() });

    expect(hasil.output).toContain("TPU-BT-01-STD [jenis_makam]: harga_berlaku_sudah_lampau (2026-01-01)");
    expect(hasil.output).toContain("Harga lama berlaku sejak 2026-01-01");
    const lokasi = await lokasiMitra("TPU-BT-01");
    const tarif = await tariffs.asStaff(admin).lokasiTariffs(lokasi.id, wib("2026-10-01 09:00"));
    expect(tarif.jenisMakam.map((jenis) => jenis.name)).toEqual(["Makam Deluxe"]);
  });

  it("runs twice over the same export without creating anything twice", async () => {
    const { lokasi, admin, katalog, audit, lokasiMitra: lokasiOf } = await modul();
    await importKatalogLamaCommand(["--sumber", CONTOH, "--tulis"], env(), { clock: clock() });

    const kedua = await importKatalogLamaCommand(["--sumber", CONTOH, "--tulis"], env(), { clock: clock() });

    expect(kedua.exitCode).toBe(0);
    expect(kedua.output).toContain("Ditulis: 0 Lokasi Mitra dan 0 Jenis Makam.");
    expect(kedua.output).toContain("Sudah ada, dilewati (3 Lokasi, 4 Jenis Makam)");
    expect((await lokasi.allLokasiMitra(admin)).map((row) => row.name).sort()).toEqual([
      "Makam Wakaf Contoh Dua",
      "TPU Contoh Satu",
      "TPU Contoh Tiga",
    ]);
    expect((await katalog.diimpor()).lokasi).toHaveLength(3);
    const dibuat = await lokasiOf("TPU-BT-01");
    expect((await audit.allEntriesForLokasi(dibuat.id)).map((entry) => entry.action)).toContain("lokasi.tandai_data_contoh");
  });

  it("refuses a code an interrupted import claimed but never bound, and names it", async () => {
    const { katalog, admin } = await modul();
    await katalog.claimLokasi(admin, { kode: "TPU-CMG-03" });

    const hasil = await importKatalogLamaCommand(["--sumber", CONTOH, "--tulis"], env(), { clock: clock() });

    expect(hasil.output).toContain("TPU-CMG-03 tertinggal diklaim tanpa Lokasi Mitra");
    expect((await katalog.diimpor()).lokasi.filter((impor) => impor.kode === "TPU-CMG-03")).toMatchObject([
      { lokasiId: null },
    ]);
  });

  it("refuses a document with a personal column, writing nothing and naming the column but not its value", async () => {
    const { katalog } = await modul();
    const path = contohDiubah((dokumen) => {
      (dokumen.lokasi as Record<string, unknown>[])[0].no_hp = "081200000000";
    });

    const hasil = await importKatalogLamaCommand(["--sumber", path, "--tulis"], env(), { clock: clock() });

    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain("kolom pribadi");
    expect(hasil.output).toContain("lokasi[0].no_hp");
    expect(hasil.output).not.toContain("081200000000");
    expect(await katalog.diimpor()).toEqual({ lokasi: [], jenisMakam: [] });
  });

  it("refuses a document that is not a catalog export, or cannot be read", async () => {
    const { katalog } = await modul();

    const rusak = await importKatalogLamaCommand(["--sumber", berkas("bukan json")], env(), { clock: clock() });
    const salahFormat = await importKatalogLamaCommand(["--sumber", berkas({ format: "lain/v1", lokasi: [] })], env(), {
      clock: clock(),
    });

    expect(rusak.exitCode).toBe(1);
    expect(rusak.output).toContain("bukan JSON");
    expect(salahFormat.exitCode).toBe(1);
    expect(salahFormat.output).toContain("bukan_ekspor_katalog");
    expect(await katalog.diimpor()).toEqual({ lokasi: [], jenisMakam: [] });
  });

  it("prints its usage when the source is missing, unreadable, or a flag is unknown", async () => {
    const usage = "Pakai: import:katalog-lama --sumber <berkas.json> [--tulis] [--izinkan-staging | --izinkan-produksi]";

    for (const argv of [
      [],
      ["--tulis"],
      ["--sumber", "/tmp/tidak-ada-untuk-impor.json"],
      ["--sumber", CONTOH, "--tulis", "--paksa"],
      ["--sumber", CONTOH, "ekstra"],
    ]) {
      expect(await importKatalogLamaCommand(argv, env(), { clock: clock() })).toEqual({ exitCode: 2, output: usage });
    }
  });

  it("marks every imported Lokasi Mitra as example data, the source's own marker or not", async () => {
    const { lokasiMitra, audit } = await modul();

    await importKatalogLamaCommand(["--sumber", CONTOH, "--tulis"], env(), { clock: clock() });

    for (const kode of ["TPU-BT-01", "WKF-BGR-02", "TPU-CMG-03"]) {
      const lokasi = await lokasiMitra(kode);
      expect(lokasi.dataContoh).toBe(true);
      const alasan = (await audit.allEntriesForLokasi(lokasi.id)).find((entry) => entry.action === "lokasi.tandai_data_contoh");
      expect(alasan?.reason).toContain("impor katalog aplikasi lama");
    }
  });

  it("is refused on staging without the named allowance, and on production without its own", async () => {
    for (const appEnv of ["staging", "production"]) {
      expect(await importKatalogLamaCommand(["--sumber", CONTOH], { ...env(), APP_ENV: appEnv }, { clock: clock() })).toEqual({
        exitCode: 1,
        output:
          appEnv === "production"
            ? "Ditolak: di production perlu allowance --izinkan-produksi (ditolak secara bawaan)."
            : 'Ditolak: di staging perlu allowance --izinkan-staging (ditolak secara bawaan).',
      });
    }
    expect(
      await importKatalogLamaCommand(["--sumber", CONTOH, "--tulis", "--izinkan-staging"], { ...env(), APP_ENV: "production" }, { clock: clock() }),
    ).toEqual({ exitCode: 1, output: "Ditolak: di production perlu allowance --izinkan-produksi (ditolak secara bawaan)." });
  });

  it("runs on production with --izinkan-produksi, leaves the rows as example data, and says so in every reason", async () => {
    const { lokasiMitra, audit } = await modul();

    const hasil = await importKatalogLamaCommand(["--sumber", CONTOH, "--tulis", "--izinkan-produksi"], stackLive("production"), { clock: clock() });

    expect(hasil.exitCode).toBe(0);
    expect(hasil.output).toContain("Ditulis: 3 Lokasi Mitra dan 4 Jenis Makam.");
    const lokasi = await lokasiMitra("TPU-BT-01");
    expect(lokasi.dataContoh).toBe(true);
    expect(lokasi.status).toBe("belum_tayang");
    const reasons = (await audit.allEntriesForLokasi(lokasi.id)).map((entry) => entry.reason);
    expect(reasons).toContain("impor katalog aplikasi lama (production, --izinkan-produksi)");
    expect(reasons.every((alasan) => alasan?.includes("--izinkan-produksi"))).toBe(true);
  });

  it("does not let the staging allowance open production, nor the production allowance open staging", async () => {
    const cross = [
      ["--izinkan-staging", "production"],
      ["--izinkan-produksi", "staging"],
    ] as const;
    for (const [flag, appEnv] of cross) {
      const hasil = await importKatalogLamaCommand(["--sumber", CONTOH, "--tulis", flag], stackLive(appEnv), { clock: clock() });
      expect(hasil.exitCode).toBe(1);
      expect(hasil.output).toContain("Ditolak");
    }
  });

  it("runs on staging with the named allowance, and every write it makes says so in its reason", async () => {
    const { lokasiMitra, audit } = await modul();
    const staging = stackLive("staging");

    const hasil = await importKatalogLamaCommand(["--sumber", CONTOH, "--tulis", "--izinkan-staging"], staging, { clock: clock() });

    expect(hasil.exitCode).toBe(0);
    expect(hasil.output).toContain("Ditulis: 3 Lokasi Mitra dan 4 Jenis Makam.");
    const lokasi = await lokasiMitra("TPU-BT-01");
    // Every write the import makes names the allowance in its reason, the Lokasi module's own two included.
    const reasons = (await audit.allEntriesForLokasi(lokasi.id)).map((entry) => entry.reason);
    expect(reasons).toContain("impor katalog aplikasi lama (staging, --izinkan-staging)");
    expect(reasons.every((alasan) => alasan?.includes("--izinkan-staging"))).toBe(true);
  });

  it("refuses a connection string for the old app's database, which this tool never opens", async () => {
    const hasil = await importKatalogLamaCommand(["--sumber", CONTOH], {
      ...env(),
      KATALOG_LAMA_DATABASE_URL: "postgres://makam:rahasia@127.0.0.1:5432/makam_beta",
    }, { clock: clock() });

    expect(hasil.exitCode).toBe(1);
    expect(hasil.output).toContain("KATALOG_LAMA_DATABASE_URL");
    expect(hasil.output).not.toContain("rahasia");
  });

  it("says so and writes nothing when there is no Admin Platform to import as", async () => {
    expect(await importKatalogLamaCommand(["--sumber", CONTOH, "--tulis"], env(), { clock: clock() })).toEqual({
      exitCode: 1,
      output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu.",
    });
  });

  it("does not need the old app's database at all: the example export is all it reads", async () => {
    await modul();

    const hasil = await importKatalogLamaCommand(["--sumber", CONTOH], env(), { clock: clock() });

    expect(hasil.output).toContain(`Sumber: ${CONTOH}`);
    expect(hasil.output).toContain("format makam.katalog-lama/v1");
  });
});
