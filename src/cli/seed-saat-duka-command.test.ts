/**
 * The Saat Duka seed, the fixture the wizard's end-to-end test walks (a
 * Terverifikasi Lokasi Mitra the list can offer), and the refusals that keep it
 * a development-only tool.
 */
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { FakeClock } from "@/adapters/memory";
import { wib } from "@/lib/time/jakarta";
import { pemesananOnTestDatabase } from "../../tests/support/pemesanan";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { seedAdminCommand } from "./seed-admin-command";
import { seedSaatDukaCommand } from "./seed-saat-duka-command";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const env = (APP_ENV = "test") => ({ APP_ENV, DATABASE_URL: inject("databaseUrl") });
const seedAdmin = () => seedAdminCommand(["--email", "admin-e2e@makam.co.id", "--phone", "081100000001"], env());
/** The same instant the test support reads back through, so the seed's tariff versions are in force (ticket 100). */
const clock = () => new FakeClock(wib("2026-10-01 09:00"));

describe("seed-saat-duka (development and test stacks only)", () => {
  it("gives the wizard a Terverifikasi Lokasi Mitra it can offer, with cleared Tersedia Petak", async () => {
    await seedAdmin();

    const result = await seedSaatDukaCommand([], env(), { clock: clock() });

    expect(result.exitCode).toBe(0);
    const halaman = /\/lokasi\/([0-9a-f-]{36})/.exec(result.output)?.[1];
    expect(halaman).toBeDefined();
    // Read back through the Pemesanan module's own list, the way the wizard does.
    const setup = pemesananOnTestDatabase(db);
    const [grup] = await setup.pemesanan.pilihanSaatDuka();
    expect(grup.lokasi.id).toBe(halaman);
    expect(grup.pilihan).toHaveLength(1);
    expect(grup.pilihan[0]).toMatchObject({ jenisMakamName: "Reguler 1 × 2 m", tersedia: 4 });
  });

  it("changes nothing once the stack has a listed Lokasi Mitra", async () => {
    await seedAdmin();
    await seedSaatDukaCommand([], env(), { clock: clock() });

    const second = await seedSaatDukaCommand([], env(), { clock: clock() });

    expect(second.exitCode).toBe(0);
    expect(second.output).toContain("seed-saat-duka tidak mengubah apa pun");
  });

  it("needs an Admin Platform to enter the example Lokasi Mitra as", async () => {
    expect(await seedSaatDukaCommand([], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu.",
    });
  });

  it("refuses to run on staging or production, and prints its usage for a positional", async () => {
    expect(await seedSaatDukaCommand([], env("staging"))).toEqual({
      exitCode: 1,
      output: "Ditolak: seed-saat-duka hanya untuk development dan test.",
    });
    expect(await seedSaatDukaCommand([], env("production"))).toMatchObject({ exitCode: 1 });
    expect(await seedSaatDukaCommand(["--seed"], env())).toEqual({ exitCode: 2, output: "Pakai: seed-saat-duka" });
  });
});
