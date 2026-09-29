/**
 * The public-site prototype's example seed: the five Lokasi Mitra the public
 * listing can offer, and the refusals that keep it out of production while
 * letting the beta for UAT on staging use it under its named allowance.
 * Driven only through the command and read back through the Lokasi module's
 * own public listing query, the way the public site itself reads it.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { publishOnTestDatabase } from "../../tests/support/publish";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { seedAdminCommand } from "./seed-admin-command";
import { seedContohPublikCommand } from "./seed-contoh-publik-command";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const env = (APP_ENV = "test") => ({ APP_ENV, DATABASE_URL: inject("databaseUrl") });
const seedAdmin = () => seedAdminCommand(["--email", "admin-contoh-publik@makam.co.id", "--phone", "081100000002"], env());

/** A temporary directory for the "staging" tests' live FileStore; removed after the suite. */
const sementara: string[] = [];
afterAll(() => {
  for (const path of sementara) rmSync(path, { recursive: true, force: true });
});
function filesRoot(): string {
  const folder = mkdtempSync(join(tmpdir(), "makam-seed-contoh-publik-"));
  sementara.push(folder);
  return folder;
}

/**
 * Everything `readRuntimeEnv` requires outside development and test, the same
 * settings `import-katalog-lama-command.test.ts` uses for its own staging run,
 * plus a real (temporary) `FILES_ROOT`: this command's agreement scan and
 * Kunjungan Verifikasi photos go through the live FileStore on staging, unlike
 * `import-katalog-lama`, which never touches one.
 */
const stagingEnv = () =>
  ({
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
    FILES_ROOT: filesRoot(),
  }) as Record<string, string>;

describe("seed-contoh-publik (development and test stacks only)", () => {
  it("gives the public listing the prototype's five example Lokasi Mitra, Terverifikasi", async () => {
    await seedAdmin();

    const result = await seedContohPublikCommand([], env());

    expect(result.exitCode).toBe(0);

    // Read back the way the public site itself does: the Lokasi module's own listing query.
    const setup = publishOnTestDatabase(db);
    const listed = await setup.lokasi.publicLokasiMitraList();
    expect(listed).toHaveLength(5);
    const names = listed.map((one) => one.name).sort();
    expect(names).toEqual(
      [
        "Makam Masjid Nurul Huda",
        "Pemakaman Bukit Sejuk",
        "Pemakaman Wakaf Al-Ikhlas",
        "Taman Makam Firdaus",
        "Taman Peristirahatan Hijau Asri",
      ].sort(),
    );

    // Two of the five switch "Pemesanan Terencana aktif" on (the mock's terencanaAktif), through the real gate.
    const terencanaAktif = listed.filter((one) => one.terencanaAktif).map((one) => one.name).sort();
    expect(terencanaAktif).toEqual(["Pemakaman Wakaf Al-Ikhlas", "Taman Peristirahatan Hijau Asri"].sort());

    // Every one's Kunjungan Verifikasi photo count matches the mock's own count exactly (Firdaus gets all four
    // of its mock photos, the other four their two each).
    const mockPhotoCount: Record<string, number> = {
      "Taman Makam Firdaus": 4,
      "Pemakaman Wakaf Al-Ikhlas": 2,
      "Makam Masjid Nurul Huda": 2,
      "Taman Peristirahatan Hijau Asri": 2,
      "Pemakaman Bukit Sejuk": 2,
    };
    for (const one of listed) {
      expect(one.kunjunganVerifikasi?.photos.length).toBe(mockPhotoCount[one.name]);
    }

    // Hijau Asri's Kunjungan Verifikasi records no pin (the mock has none for it either).
    const hijauAsri = listed.find((one) => one.name === "Taman Peristirahatan Hijau Asri");
    expect(hijauAsri?.pin).toBeNull();

    // The mock's facilities map onto the real checklist (mushola, akses-mobil, keamanan, pendopo, air → musala,
    // akses_ambulans, pos_jaga, tempat_duduk, air_bersih); Firdaus has all seven.
    const firdaus = listed.find((one) => one.name === "Taman Makam Firdaus");
    expect(firdaus?.facilities.sort()).toEqual(
      ["musala", "parkir", "akses_ambulans", "air_bersih", "pos_jaga", "tempat_duduk", "toilet"].sort(),
    );

    // Its three Jenis Makam each have cleared Tersedia Petak, read the way the order card does.
    const firdausId = firdaus!.id;
    const tersedia = await setup.inventory.tersediaPerJenisMakam(firdausId);
    expect(tersedia).toHaveLength(3);
    for (const one of tersedia) expect(one.count).toBeGreaterThan(0);

    // Firdaus's hargaBaru: "Makam Standar" is scheduled to become Rp 9.000.000 from 1 Januari 2027, through the
    // Tariffs module's own versioning — read the way the public Lokasi page reads a scheduled price change.
    const pricing = await setup.tariffs.lokasiPricing(firdausId, setup.clock.now());
    const standar = pricing.jenisMakam.find((card) => card.jenisMakam.name === "Makam Standar");
    expect(standar?.hakPakai.scheduledChange).toEqual({ effectiveOn: "2027-01-01", total: 9_000_000 + 250_000 });

    // Wakaf Al-Ikhlas's "Kavling Keluarga 2 Petak" is a real Kavling Keluarga (Perlu Verifikasi is cleared, so
    // "Pemesanan Terencana aktif" is on, which needs every Petak here resolved).
    const wakaf = listed.find((one) => one.name === "Pemakaman Wakaf Al-Ikhlas")!;
    expect(await setup.inventory.hasPetakPerluVerifikasi(wakaf.id)).toBe(false);

    // Hijau Asri's "Makam Taman" is the mock's one `tersedia: 0` entry: cleared, but Tidak Tersedia, so it
    // carries no availability row at all — only its other two Jenis Makam (Standar, Kavling) do.
    const hijauAsriTersedia = await setup.inventory.tersediaPerJenisMakam(hijauAsri!.id);
    expect(hijauAsriTersedia).toHaveLength(2);
    for (const one of hijauAsriTersedia) expect(one.count).toBeGreaterThan(0);
    expect(await setup.inventory.hasPetakPerluVerifikasi(hijauAsri!.id)).toBe(false);
  });

  it("changes nothing once all five example Lokasi Mitra are listed", async () => {
    await seedAdmin();
    await seedContohPublikCommand([], env());

    const second = await seedContohPublikCommand([], env());

    expect(second.exitCode).toBe(0);
    expect(second.output).toContain("seed-contoh-publik tidak mengubah apa pun");

    const setup = publishOnTestDatabase(db);
    expect(await setup.lokasi.publicLokasiMitraList()).toHaveLength(5);
  });

  it("needs an Admin Platform to enter the example Lokasi Mitra as", async () => {
    expect(await seedContohPublikCommand([], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu.",
    });
  });

  it("refuses to run on staging without the named allowance, and always on production, and prints its usage for an unknown flag", async () => {
    expect(await seedContohPublikCommand([], env("staging"))).toEqual({
      exitCode: 1,
      output: "Ditolak: di staging perlu allowance --izinkan-staging (ditolak secara bawaan).",
    });
    expect(await seedContohPublikCommand(["--izinkan-staging"], env("production"))).toEqual({
      exitCode: 1,
      output: "Ditolak: seed-contoh-publik tidak pernah jalan di production.",
    });
    expect(await seedContohPublikCommand(["--seed"], env())).toEqual({
      exitCode: 2,
      output: "Pakai: seed-contoh-publik [--izinkan-staging]",
    });
  });

  it("runs on staging with the named allowance, and every write it makes says so in its reason", async () => {
    const staging = stagingEnv();
    await seedAdminCommand(["--email", "admin-contoh-publik-staging@makam.co.id", "--phone", "081100000003"], staging);

    const result = await seedContohPublikCommand(["--izinkan-staging"], staging);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("5 Lokasi Mitra contoh terbit");

    const setup = publishOnTestDatabase(db);
    const listed = await setup.lokasi.publicLokasiMitraList();
    expect(listed).toHaveLength(5);

    // Every reason this command's own writes carry (tariffs, and the Undangan Admin
    // Lokasi for this Lokasi Mitra) names the staging allowance.
    const firdaus = listed.find((one) => one.name === "Taman Makam Firdaus")!;
    const reasons = (await setup.audit.allEntriesForLokasi(firdaus.id)).map((entry) => entry.reason).filter((reason) => reason !== null);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.every((reason) => String(reason).includes("seed-contoh-publik (staging, --izinkan-staging)"))).toBe(true);

    // The Petugas Lapangan invite (not Lokasi-scoped) says the same.
    const undangan = (await setup.audit.allEntries()).filter((entry) => entry.action === "staf.undang");
    expect(undangan.length).toBeGreaterThanOrEqual(6); // 1 Petugas Lapangan + 5 Admin Lokasi
    expect(undangan.every((entry) => String(entry.reason).includes("seed-contoh-publik (staging, --izinkan-staging)"))).toBe(true);
  });

  it("changes nothing on a second staging run, the same allowance", async () => {
    const staging = stagingEnv();
    await seedAdminCommand(["--email", "admin-contoh-publik-staging-2@makam.co.id", "--phone", "081100000004"], staging);
    await seedContohPublikCommand(["--izinkan-staging"], staging);

    const second = await seedContohPublikCommand(["--izinkan-staging"], staging);

    expect(second.exitCode).toBe(0);
    expect(second.output).toContain("seed-contoh-publik tidak mengubah apa pun");
    const setup = publishOnTestDatabase(db);
    expect(await setup.lokasi.publicLokasiMitraList()).toHaveLength(5);
  });
});
