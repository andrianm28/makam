/**
 * The public-site prototype's example seed: the five Lokasi Mitra the public
 * listing can offer, and the refusals that keep it a development-only tool.
 * Driven only through the command and read back through the Lokasi module's
 * own public listing query, the way the public site itself reads it.
 */
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

    // Every one has its Kunjungan Verifikasi photos stored as real JPEG bytes, reachable through the public read.
    for (const one of listed) {
      expect(one.kunjunganVerifikasi?.photos.length).toBeGreaterThan(0);
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

  it("refuses to run on staging or production, and prints its usage for a positional", async () => {
    expect(await seedContohPublikCommand([], env("staging"))).toEqual({
      exitCode: 1,
      output: "Ditolak: seed-contoh-publik hanya untuk development dan test.",
    });
    expect(await seedContohPublikCommand([], env("production"))).toMatchObject({ exitCode: 1 });
    expect(await seedContohPublikCommand(["--seed"], env())).toEqual({ exitCode: 2, output: "Pakai: seed-contoh-publik" });
  });
});
