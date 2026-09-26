import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { actorOf, emailCodeTo, identityOnTestDatabase, logInByEmail, logInByOtp } from "../../tests/support/identity";
import { seedAdminCommand } from "./seed-admin-command";

const { db, close } = testDatabase();
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
      output: "Pakai: seed:admin <nomor WhatsApp +62> <email> [--email-terverifikasi]",
    });
    expect(await seedAdminCommand(["081111111111", "admin@makam.co.id", "--salah"], env())).toMatchObject({ exitCode: 2 });
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

  it("with --email-terverifikasi, the first Admin Platform's email is already its Email Terverifikasi: an email login works, TOTP still required", async () => {
    const setup = identityOnTestDatabase(db);

    const result = await seedAdminCommand(["081111111111", "Admin@Makam.co.id", "--email-terverifikasi"], env());

    expect(result).toEqual({
      exitCode: 0,
      output:
        "Admin Platform pertama dibuat: +6281111111111 (admin@makam.co.id, Email Terverifikasi). Masuk lewat /masuk dengan email, lalu daftarkan TOTP.",
    });
    const { login, cookies } = await logInByEmail(setup, "admin@makam.co.id");
    expect(login.roles).toEqual(["pemesan", "admin_platform"]);
    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({ totp: "perlu_daftar" });
    expect((await setup.identity.staffAccounts()).map((account) => account.phoneNumber)).toEqual(["+6281111111111"]);
  });

  it("with --email-terverifikasi, records an Entri Audit by seed_cli: akun.email_verifikasi, terverifikasi false to true, with a reason", async () => {
    const setup = identityOnTestDatabase(db);

    await seedAdminCommand(["081111111111", "admin@makam.co.id", "--email-terverifikasi"], env());

    const admin = await setup.identity.accountByPhoneNumber("081111111111");
    const entries = await setup.audit.entriesAbout({ kind: "akun", id: admin!.id });
    expect(entries.map((entry) => entry.action)).toEqual(["staf.seed_admin_platform", "akun.email_verifikasi"]);
    expect(entries[1]).toMatchObject({
      actor: { accountId: admin!.id, role: "seed_cli" },
      before: { terverifikasi: false },
      after: { terverifikasi: true },
      reason: "seed:admin --email-terverifikasi (jalur bootstrap sebelum WhatsApp live)",
    });
  });

  it("with --email-terverifikasi, is refused when another Akun has that Email Terverifikasi, and no Admin Platform is created", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, email } = setup;
    const { cookies } = await logInByOtp(identity, whatsapp, "082222222222");
    await identity.requestEmailVerification(await actorOf(identity, cookies), { email: "admin@makam.co.id", ip: "198.51.100.40" });
    const confirmed = await identity.confirmEmailVerification(await actorOf(identity, cookies), {
      code: emailCodeTo(email, "admin@makam.co.id"),
    });
    if (!confirmed.ok) throw new Error(confirmed.reason);

    expect(await seedAdminCommand(["081111111111", "admin@makam.co.id", "--email-terverifikasi"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: email ini sudah menjadi Email Terverifikasi Akun lain. Tidak ada yang dibuat.",
    });
    expect(await identity.staffAccounts()).toEqual([]);
    expect(await identity.accountByPhoneNumber("081111111111")).toBeNull();
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
