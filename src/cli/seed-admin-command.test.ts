import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { seedAdminCommand } from "./seed-admin-command";

const { close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const env = () => ({ APP_ENV: "test", DATABASE_URL: inject("databaseUrl") });

describe("npm run seed:admin <phone> <email>", () => {
  it("creates the first Admin Platform and says so", async () => {
    const result = await seedAdminCommand(["0811-1111-1111", "admin@makam.co.id"], env());

    expect(result).toEqual({
      exitCode: 0,
      output: "Admin Platform pertama dibuat: +6281111111111 (admin@makam.co.id). Masuk lewat /masuk, lalu daftarkan TOTP.",
    });
  });

  it("refuses a second seed with a non-zero exit code", async () => {
    await seedAdminCommand(["081111111111", "admin@makam.co.id"], env());

    expect(await seedAdminCommand(["082222222222", "dua@makam.co.id"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: sudah ada Admin Platform. Admin Platform berikutnya diundang lewat Undangan Staf.",
    });
  });

  it("prints its usage when the phone number or the email is missing", async () => {
    expect(await seedAdminCommand(["081111111111"], env())).toEqual({
      exitCode: 2,
      output: "Pakai: seed:admin <nomor WhatsApp +62> <email>",
    });
  });

  it("refuses an invalid email", async () => {
    expect(await seedAdminCommand(["081111111111", "bukan-email"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: email tidak valid.",
    });
  });

  it("refuses an invalid number with the shared phone-number message", async () => {
    expect(await seedAdminCommand(["12", "admin@makam.co.id"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: Nomor WhatsApp tidak valid.",
    });
  });

  it("when the database cannot be reached, says so briefly without the connection string", async () => {
    const result = await seedAdminCommand(["081111111111", "admin@makam.co.id"], {
      APP_ENV: "test",
      DATABASE_URL: "postgres://makam:rahasia-sekali@127.0.0.1:1/makam",
    });

    expect(result).toEqual({ exitCode: 1, output: "Gagal: perintah berhenti karena galat (Error ECONNREFUSED)." });
    expect(result.output).not.toContain("rahasia");
  });
});
