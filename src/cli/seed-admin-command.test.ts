import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { identityOnTestDatabase, logIn } from "../../tests/support/identity";
import { seedAdminCommand } from "./seed-admin-command";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const env = () => ({ APP_ENV: "test", DATABASE_URL: inject("databaseUrl") });

describe("npm run seed:admin -- --email <email> --phone <phone>", () => {
  it("creates the first Admin Platform with its email as its Email Terverifikasi: a Kode Masuk logs it in, TOTP still required", async () => {
    const setup = identityOnTestDatabase(db);

    const result = await seedAdminCommand(["--email", "Admin@Makam.co.id", "--phone", "0811-1111-1111"], env());

    expect(result).toEqual({
      exitCode: 0,
      output:
        "Admin Platform pertama dibuat: admin@makam.co.id (Email Terverifikasi; telepon +6281111111111). Masuk lewat /masuk dengan Kode Masuk ke email itu, lalu daftarkan TOTP.",
    });
    const { login, cookies } = await logIn(setup, "admin@makam.co.id");
    expect(login).toMatchObject({ accountCreated: false, roles: ["pemesan", "admin_platform"] });
    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({ totp: "perlu_daftar", phoneNumber: "+6281111111111" });
  });

  it("records the seed as an Entri Audit by seed_cli", async () => {
    const setup = identityOnTestDatabase(db);

    await seedAdminCommand(["--email", "admin@makam.co.id", "--phone", "081111111111"], env());

    const admin = await setup.identity.accountByEmail("admin@makam.co.id");
    expect((await setup.audit.entriesAbout({ kind: "akun", id: admin!.id })).map((entry) => [entry.action, entry.actor.role])).toEqual([
      ["staf.seed_admin_platform", "seed_cli"],
    ]);
  });

  it("refuses a second seed with a non-zero exit code", async () => {
    await seedAdminCommand(["--email", "admin@makam.co.id", "--phone", "081111111111"], env());

    expect(await seedAdminCommand(["--email", "dua@makam.co.id", "--phone", "082222222222"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: sudah ada Admin Platform. Admin Platform berikutnya diundang lewat Undangan Staf.",
    });
  });

  it("prints its usage when the email or the phone number is missing, or a positional is given", async () => {
    const usage = { exitCode: 2, output: "Pakai: seed:admin --email <email> --phone <nomor telepon +62>" };
    expect(await seedAdminCommand(["--email", "admin@makam.co.id"], env())).toEqual(usage);
    expect(await seedAdminCommand(["--phone", "081111111111"], env())).toEqual(usage);
    expect(await seedAdminCommand(["081111111111", "admin@makam.co.id"], env())).toEqual(usage);
    expect(await seedAdminCommand(["--email", "admin@makam.co.id", "--phone", "081111111111", "--salah"], env())).toEqual(usage);
  });

  it("refuses an invalid email, and an invalid number with the shared phone-number message", async () => {
    expect(await seedAdminCommand(["--email", "bukan-email", "--phone", "081111111111"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: email tidak valid.",
    });
    expect(await seedAdminCommand(["--email", "admin@makam.co.id", "--phone", "12"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: Nomor telepon tidak valid.",
    });
  });

  it("when the database cannot be reached, says so briefly without the connection string", async () => {
    const result = await seedAdminCommand(["--email", "admin@makam.co.id", "--phone", "081111111111"], {
      APP_ENV: "test",
      DATABASE_URL: "postgres://makam:rahasia-sekali@127.0.0.1:1/makam",
    });

    expect(result).toEqual({ exitCode: 1, output: "Gagal: perintah berhenti karena galat (Error ECONNREFUSED)." });
    expect(result.output).not.toContain("rahasia");
  });
});
