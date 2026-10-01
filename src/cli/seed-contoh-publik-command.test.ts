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
import { FakeClock } from "@/adapters/memory";
import { wib } from "@/lib/time/jakarta";
import { publishOnTestDatabase, signedInAdminLokasi, signedInAdminPlatform } from "../../tests/support/publish";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { seedAdminCommand } from "./seed-admin-command";
import { CONTOH_LOKASI, seedContohPublikCommand } from "./seed-contoh-publik-command";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const env = (APP_ENV = "test") => ({ APP_ENV, DATABASE_URL: inject("databaseUrl") });
const seedAdmin = () => seedAdminCommand(["--email", "admin-contoh-publik@makam.co.id", "--phone", "081100000002"], env());
/** The same instant the test support reads back through, so the seed's tariff versions are in force (ticket 100). */
const clock = () => new FakeClock(wib("2026-10-01 09:00"));

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
    // The mock's real Tersedia counts (9-118) mean a lot more sequential clearPetak calls than a small
    // fixture Denah would; this and the other tests below that seed all five give it more room than the
    // file's default testTimeout.
    await seedAdmin();

    const result = await seedContohPublikCommand([], env(), undefined, { clock: clock() });

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
  }, 120_000);

  // The mock's own real Tersedia counts, per Lokasi Mitra × Jenis Makam name
  // (`_mock/data.ts` on `origin/prototype-public-site`) — including its two
  // Kavling Keluarga entries and its one `tersedia: 0` entry (no availability
  // row at all, asserted by its absence from the map below).
  const mockTersedia: Record<string, Record<string, number>> = {
    "Taman Makam Firdaus": { "Makam Standar": 42, "Makam Taman": 9, "Makam Selamanya": 3 },
    "Pemakaman Wakaf Al-Ikhlas": { "Makam Umum": 118, "Kavling Keluarga 2 Petak": 2 },
    "Makam Masjid Nurul Huda": { "Makam Umum": 27 },
    "Taman Peristirahatan Hijau Asri": { "Makam Standar": 64, "Kavling Keluarga 4 Petak": 1 },
    "Pemakaman Bukit Sejuk": { "Makam Standar": 30 },
  };

  // The mock's own `kontakSiaga.nama` per Lokasi Mitra.
  const mockKontakSiagaName: Record<string, string> = {
    "Taman Makam Firdaus": "Bapak Hendra",
    "Pemakaman Wakaf Al-Ikhlas": "Ustaz Farid",
    "Makam Masjid Nurul Huda": "Bapak Syamsul",
    "Taman Peristirahatan Hijau Asri": "Ibu Ratna",
    "Pemakaman Bukit Sejuk": "Bapak Yusuf",
  };

  /** Every Lokasi Mitra's Tersedia counts, Kavling units and Kontak Siaga name read back equal to the mock's. */
  async function expectSamaDenganMock(minimal: readonly string[] = []) {
    const setup = publishOnTestDatabase(db);
    const listed = await setup.lokasi.publicLokasiMitraList();

    for (const [lokasiName, perJenis] of Object.entries(mockTersedia)) {
      const lokasi = listed.find((one) => one.name === lokasiName);
      expect(lokasi, lokasiName).toBeTruthy();

      // Jenis Makam id ↔ name, read the way a staff price list does (unfiltered by the public QRIS cap,
      // unlike `lokasiPricing` — Firdaus's "Makam Taman" and "Makam Selamanya" are both over it).
      const tariffs = await setup.tariffs.lokasiTariffs(lokasi!.id, setup.clock.now());
      const tersedia = await setup.inventory.tersediaPerJenisMakam(lokasi!.id);
      const countByJenisMakamId = new Map(tersedia.map((row) => [row.jenisMakamId, row.count]));

      for (const [jenisMakamName, expectedTersedia] of Object.entries(perJenis)) {
        const jenisMakam = tariffs.jenisMakam.find((one) => one.name === jenisMakamName);
        expect(jenisMakam, `${lokasiName} / ${jenisMakamName}`).toBeTruthy();
        const actual = countByJenisMakamId.get(jenisMakam!.id) ?? 0;
        // A stack an older version seeded keeps its old single-row Bloks, so beside the prototype's Bloks it
        // holds more than the mock's number (`minimal` names those Lokasi); every other count is exact.
        if (minimal.includes(lokasiName)) expect(actual, `${lokasiName} / ${jenisMakamName}`).toBeGreaterThanOrEqual(expectedTersedia);
        else expect(actual, `${lokasiName} / ${jenisMakamName}`).toBe(expectedTersedia);
      }

      const kontakSiaga = await setup.lokasi.kontakSiagaOf(lokasi!.id);
      expect(kontakSiaga?.name, lokasiName).toBe(mockKontakSiagaName[lokasiName]);
    }
  }

  it(
    "reproduces the mock's real Tersedia counts (9-118), its Kavling Keluarga unit counts and its Kontak Siaga name 1:1, per Lokasi Mitra",
    async () => {
      await seedAdmin();
      const result = await seedContohPublikCommand([], env());
      expect(result.exitCode).toBe(0);

      await expectSamaDenganMock();
    },
    120_000,
  );

  it(
    "draws the prototype's own Denah for Wakaf Al-Ikhlas and Hijau Asri, then tops each Jenis Makam up in tidy rectangular Bloks",
    async () => {
      await seedAdmin();
      expect((await seedContohPublikCommand([], env())).exitCode).toBe(0);

      const setup = publishOnTestDatabase(db);
      const listed = await setup.lokasi.publicLokasiMitraList();
      const denahOf = async (name: string) => {
        const lokasi = listed.find((one) => one.name === name)!;
        const denah = await setup.inventory.publicDenah(lokasi.id);
        expect(denah, name).not.toBeNull();
        return denah!;
      };
      const cellAt = (blok: NonNullable<Awaited<ReturnType<typeof denahOf>>>["bloks"][number], row: number, col: number) =>
        blok.cells.find((cell) => cell.row === row && cell.col === col)!;

      // Wakaf Al-Ikhlas: "Blok Utama" is 5 × 11 with a Jalan row and column, four Kavling Keluarga of two Petak.
      const wakaf = await denahOf("Pemakaman Wakaf Al-Ikhlas");
      const utama = wakaf.bloks.find((blok) => blok.name === "Blok Utama")!;
      expect([utama.rows, utama.cols]).toEqual([5, 11]);
      expect(cellAt(utama, 2, 4).kind).toBe("jalan");
      expect(cellAt(utama, 0, 6).kind).toBe("jalan");
      expect(cellAt(utama, 0, 0)).toMatchObject({ kind: "petak", nomorMakam: "U-01", status: "terisi" });
      // The prototype numbers Petak only: (1, 7) is the 17th Petak in reading order.
      expect(cellAt(utama, 1, 7).nomorMakam).toBe("U-17");
      expect(cellAt(utama, 1, 8)).toMatchObject({ nomorMakam: "U-18", status: "bisa_dipilih" });
      // Dipesan has no honest path (no real order): a Petak the mock marks Dipesan is not pickable either.
      expect(cellAt(utama, 1, 2).status).toBe("tidak_tersedia");
      // The four Kavling Keluarga are there with the mock's Nomor Kavling and two Petak each. (Their Terisi /
      // Tersedia state is read through `tersediaPerJenisMakam` below, which counts the two Tersedia ones:
      // the picker's own Kavling status currently ignores a Kavling's Hak Pakai, a bug outside this seed.)
      expect(utama.kavling.map((kavling) => kavling.nomorKavling).sort()).toEqual(["KK-U1", "KK-U2", "KK-U3", "KK-U4"]);
      expect(utama.cells.filter((cell) => cell.kavlingId).length).toBe(8);
      expect(utama.kavling.find((kavling) => kavling.nomorKavling === "KK-U1")?.status).toBe("bisa_dipilih");
      // 3 + 12 Tersedia Petak outside a Kavling.
      expect(utama.cells.filter((cell) => cell.status === "bisa_dipilih").length).toBe(15);
      // The rest of the mock's 118 Makam Umum: tidy rectangles, never one long row.
      expect(wakaf.bloks.length).toBeGreaterThan(1);
      for (const blok of wakaf.bloks) {
        expect(blok.rows, blok.name).toBeGreaterThan(1);
        expect(blok.cols, blok.name).toBeLessThanOrEqual(11);
      }

      // Hijau Asri: Blok A 8 × 13, Blok B 5 × 10, Blok Melati 4 × 8, with the mock's Nomor Makam.
      const hijau = await denahOf("Taman Peristirahatan Hijau Asri");
      const [blokA, blokB, melati] = ["Blok A", "Blok B", "Blok Melati"].map((name) => hijau.bloks.find((blok) => blok.name === name)!);
      expect([blokA.rows, blokA.cols, blokB.rows, blokB.cols, melati.rows, melati.cols]).toEqual([8, 13, 5, 10, 4, 8]);
      expect(cellAt(blokA, 0, 3)).toMatchObject({ nomorMakam: "A-04", status: "terisi" });
      expect(cellAt(blokA, 3, 12).kind).toBe("bukan_petak");
      expect(cellAt(blokA, 4, 12).kind).toBe("bukan_petak");
      expect(cellAt(blokA, 0, 12).status).toBe("tidak_tersedia");
      expect(blokA.kavling.map((kavling) => kavling.nomorKavling).sort()).toEqual(["KK-A1", "KK-A2"]);
      expect(blokA.cells.filter((cell) => cell.status === "bisa_dipilih").length).toBe(35);
      expect(blokB.cells.filter((cell) => cell.status === "bisa_dipilih").length).toBe(28);
      expect(melati.cells.filter((cell) => cell.status === "bisa_dipilih").length).toBe(0);
      expect(cellAt(melati, 2, 0).kind).toBe("bukan_petak");
      expect(cellAt(melati, 0, 4).kind).toBe("jalan");

      // The Tersedia total of every Jenis Makam is still the mock's number.
      await expectSamaDenganMock();
    },
    120_000,
  );

  it(
    "reconciles Lokasi Mitra an older run listed with fewer Tersedia Petak, Kavling units and no Kontak Siaga name, only adding, and then changes nothing",
    async () => {
      // The Admin Platform is signed in by the test itself, since this test also draws Bloks as an Admin Lokasi.
      const setup = publishOnTestDatabase(db);
      const platform = await signedInAdminPlatform(setup);
      // What an older version seeded: every count capped at 3 (Kavling at 1), no Kontak Siaga name.
      const lama = CONTOH_LOKASI.map((spec) => ({
        ...spec,
        kontakSiagaName: "",
        denahPrototipe: undefined,
        // Hijau Asri's "Makam Standar" was Rp 11.000.000 before the mock's price became 9.000.000 (under the QRIS cap).
        jenisMakam: spec.jenisMakam.map((jm) =>
          jm.kosong
            ? jm
            : { ...jm, tersedia: jm.kavlingPetak ? 1 : Math.min(jm.tersedia, 3), hargaHakPakai: spec.name === "Taman Peristirahatan Hijau Asri" && jm.name === "Makam Standar" ? 11_000_000 : jm.hargaHakPakai },
        ),
      }));
      const first = await seedContohPublikCommand([], env(), lama);
      expect(first.exitCode).toBe(0);

      const listed = await setup.lokasi.publicLokasiMitraList();
      const wakaf = listed.find((one) => one.name === "Pemakaman Wakaf Al-Ikhlas")!;
      expect((await setup.lokasi.kontakSiagaOf(wakaf.id))?.name).toBe("");
      const hijauAsriLama = listed.find((one) => one.name === "Taman Peristirahatan Hijau Asri")!;
      // The latest tariff version, read at an instant far past every effective date.
      const hargaStandarHijau = async (lokasiId: string) =>
        (await setup.tariffs.lokasiTariffs(lokasiId, new Date("2100-01-01T00:00:00Z"))).jenisMakam.find((one) => one.name === "Makam Standar")?.inForce?.hargaHakPakai;
      expect(await hargaStandarHijau(hijauAsriLama.id)).toBe(11_000_000);
      const before = await setup.inventory.tersediaPerJenisMakam(wakaf.id);
      const petakBefore = before.reduce((sum, one) => sum + one.count, 0);
      expect(petakBefore).toBe(3 + 1);

      // What the older version also left on staging: single-row example Bloks "A" (only Tersedia Petak) and "B"
      // (one Tersedia, one Terisi Petak), drawn the way an Admin Lokasi would.
      const adminLokasi = await signedInAdminLokasi(setup, platform.actor, [wakaf.id]);
      const umum = (await setup.tariffs.lokasiTariffs(wakaf.id, new Date("2100-01-01T00:00:00Z"))).jenisMakam.find((one) => one.name === "Makam Umum")!;
      const gambarLama = async (name: string, cols: number, terisi: number) => {
        const blok = await setup.inventory.createBlok(adminLokasi, wakaf.id, { name, rows: 1, cols, numberPattern: `L${name}-{nn}`, jenisMakamId: umum.id });
        if (!blok.ok) throw new Error(blok.reason);
        const cells = (await setup.inventory.asStaff(adminLokasi).blok(wakaf.id, blok.blok.id))!.cells;
        for (const [index, cell] of cells.entries()) {
          const cleared = await setup.inventory.clearPetak(adminLokasi, wakaf.id, cell.id, index < terisi ? { mode: "terisi", dataMenyusul: true } : { mode: "tersedia" });
          if (!cleared.ok) throw new Error(cleared.reason);
        }
      };
      await gambarLama("A", 5, 0);
      await gambarLama("B", 2, 1);

      // A newer run comes long after the older one; here the same Admin Lokasi's Kode Masuk resend window (60 s) must pass.
      await new Promise((resolve) => setTimeout(resolve, 61_000));
      const second = await seedContohPublikCommand([], env());
      expect(second.exitCode, second.output).toBe(0);
      expect(second.output).toContain("disamakan dengan contoh");
      // The price is brought to the mock's as a new tariff version effective today; the old version stays.
      expect(await hargaStandarHijau(hijauAsriLama.id)).toBe(9_000_000);
      await expectSamaDenganMock(["Pemakaman Wakaf Al-Ikhlas", "Taman Peristirahatan Hijau Asri"]);
      // The Bloks the older run built are still there, untouched, and the prototype's "Blok Utama" was added beside them.
      const publicWakaf = await setup.inventory.publicDenah(wakaf.id);
      expect(publicWakaf?.bloks.map((blok) => blok.name)).toEqual(expect.arrayContaining(["Blok A", "Blok Utama"]));
      // The old empty single-row Blok "A" was removed (through Inventory's hapusBlok), so Makam Umum is exactly the
      // mock's 118 again; "B" holds a Terisi Petak, so it stays.
      expect(publicWakaf?.bloks.map((blok) => blok.name)).not.toContain("A");
      expect(publicWakaf?.bloks.map((blok) => blok.name)).toContain("B");
      const umumSesudah = (await setup.inventory.tersediaPerJenisMakam(wakaf.id)).find((row) => row.jenisMakamId === umum.id);
      expect(umumSesudah?.count).toBe(118);
      // Pengaturan Operator holds the mock's CS contact, entered by the first run because it was empty.
      const operator = await setup.operatorSettings.current();
      expect(operator?.csReplyHours).toBe("setiap hari, 06.00–22.00 WIB");
      expect(operator?.csWhatsApp).toBe("+6281100000000");

      const afterSecond = await setup.inventory.tersediaPerJenisMakam(wakaf.id);
      const bloksAfterSecond = (await setup.inventory.publicDenah(wakaf.id))?.bloks.map((blok) => blok.name);
      const third = await seedContohPublikCommand([], env());
      expect(third.exitCode).toBe(0);
      expect(third.output).toContain("seed-contoh-publik tidak mengubah apa pun");
      expect(await setup.inventory.tersediaPerJenisMakam(wakaf.id)).toEqual(afterSecond);
      expect((await setup.inventory.publicDenah(wakaf.id))?.bloks.map((blok) => blok.name)).toEqual(bloksAfterSecond);
    },
    240_000,
  );

  it(
    "changes nothing once all five example Lokasi Mitra are listed",
    async () => {
      await seedAdmin();
      await seedContohPublikCommand([], env());

      const second = await seedContohPublikCommand([], env());

      expect(second.exitCode).toBe(0);
      expect(second.output).toContain("seed-contoh-publik tidak mengubah apa pun");

      const setup = publishOnTestDatabase(db);
      expect(await setup.lokasi.publicLokasiMitraList()).toHaveLength(5);
    },
    120_000,
  );

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

  it(
    "runs on staging with the named allowance, and every write it makes says so in its reason",
    async () => {
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
    },
    120_000,
  );

  it(
    "changes nothing on a second staging run, the same allowance",
    async () => {
      const staging = stagingEnv();
      await seedAdminCommand(["--email", "admin-contoh-publik-staging-2@makam.co.id", "--phone", "081100000004"], staging);
      await seedContohPublikCommand(["--izinkan-staging"], staging);

      const second = await seedContohPublikCommand(["--izinkan-staging"], staging);

      expect(second.exitCode).toBe(0);
      expect(second.output).toContain("seed-contoh-publik tidak mengubah apa pun");
      const setup = publishOnTestDatabase(db);
      expect(await setup.lokasi.publicLokasiMitraList()).toHaveLength(5);
    },
    120_000,
  );
});
