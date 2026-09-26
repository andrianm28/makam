import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { akunFromBeforeEmailKey, identityOnTestDatabase, logIn, signedInAdminPlatform } from "../../tests/support/identity";
import { verifyEmailCommand } from "./verify-email-command";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const env = () => ({ APP_ENV: "test", DATABASE_URL: inject("databaseUrl") });

/** The first Admin Platform as ADR 0003 left it: seeded with an email that was never verified. */
async function adminPlatformFromBeforeEmailKey() {
  return akunFromBeforeEmailKey(db, { email: "admin@makam.co.id", phoneNumber: "+6281111111111", roles: ["admin_platform"] });
}

describe('npm run verify-email -- <email> --alasan "<reason>"', () => {
  it("makes the email on record of an Admin Platform from before ADR 0004 its Email Terverifikasi: a Kode Masuk then logs it in, TOTP still required", async () => {
    const setup = identityOnTestDatabase(db);
    const legacy = await adminPlatformFromBeforeEmailKey();

    const result = await verifyEmailCommand(["Admin@Makam.co.id", "--alasan", "Admin Platform lama tanpa Email Terverifikasi"], env());

    expect(result).toEqual({
      exitCode: 0,
      output:
        "Email admin@makam.co.id kini Email Terverifikasi Admin Platform itu. Masuk lewat /masuk dengan Kode Masuk ke email itu, lalu daftarkan TOTP.",
    });
    const { login, cookies } = await logIn(setup, "admin@makam.co.id");
    expect(login).toMatchObject({ accountCreated: false, account: { id: legacy.accountId }, roles: ["pemesan", "admin_platform"] });
    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({ totp: "perlu_daftar" });
  });

  it("records an Entri Audit by ops_cli: akun.email_verifikasi, terverifikasi false to true, with the reason", async () => {
    const setup = identityOnTestDatabase(db);
    const legacy = await adminPlatformFromBeforeEmailKey();

    await verifyEmailCommand(["admin@makam.co.id", "--alasan", "Admin Platform lama"], env());

    const entries = await setup.audit.entriesAbout({ kind: "akun", id: legacy.accountId });
    expect(entries.filter((entry) => entry.action === "akun.email_verifikasi")).toEqual([
      expect.objectContaining({
        actor: { accountId: legacy.accountId, role: "ops_cli" },
        entity: { kind: "akun", id: legacy.accountId },
        before: { email: "admin@makam.co.id", terverifikasi: false },
        after: { email: "admin@makam.co.id", terverifikasi: true },
        reason: "Admin Platform lama",
      }),
    ]);
  });

  it("is refused for an Akun that is not an Admin Platform, an email that already is an Email Terverifikasi, or no Akun", async () => {
    const setup = identityOnTestDatabase(db);
    await signedInAdminPlatform(setup);
    await akunFromBeforeEmailKey(db, { email: "pemesan.lama@contoh.id", phoneNumber: "+6282222222222" });
    const refused = {
      exitCode: 1,
      output:
        "Ditolak: tidak ada Admin Platform dengan email ini yang belum terverifikasi (sudah Email Terverifikasi, atau bukan Admin Platform). Tidak ada yang diubah.",
    };

    expect(await verifyEmailCommand(["pemesan.lama@contoh.id", "--alasan", "salah orang"], env())).toEqual(refused);
    expect(await verifyEmailCommand(["admin@makam.co.id", "--alasan", "sudah"], env())).toEqual(refused);
    expect(await verifyEmailCommand(["tidak.ada@contoh.id", "--alasan", "tidak ada"], env())).toEqual(refused);
    expect((await setup.audit.allEntries()).map((entry) => entry.action)).not.toContain("akun.email_verifikasi");
  });

  it("is refused with an empty reason, and the email stays unverified", async () => {
    const setup = identityOnTestDatabase(db);
    const legacy = await adminPlatformFromBeforeEmailKey();

    expect(await verifyEmailCommand(["admin@makam.co.id", "--alasan", "  "], env())).toEqual({
      exitCode: 1,
      output: 'Ditolak: alasan wajib diisi (--alasan "...").',
    });
    const { login } = await logIn(setup, "admin@makam.co.id");
    expect(login.account.id).not.toBe(legacy.accountId);
  });

  it("is refused when another Akun already has that email as its Email Terverifikasi, and nothing changes", async () => {
    const setup = identityOnTestDatabase(db);
    await adminPlatformFromBeforeEmailKey();
    const other = await logIn(setup, "admin@makam.co.id");

    expect(await verifyEmailCommand(["admin@makam.co.id", "--alasan", "Admin Platform lama"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: email ini sudah menjadi Email Terverifikasi Akun lain. Tidak ada yang ditandai.",
    });
    expect((await setup.audit.allEntries()).map((entry) => entry.action)).not.toContain("akun.email_verifikasi");
    expect(await setup.identity.accountByEmail("admin@makam.co.id")).toMatchObject({ id: other.login.account.id });
  });

  it("prints its usage without an email, without --alasan, or with an unknown flag", async () => {
    const usage = { exitCode: 2, output: 'Pakai: verify-email <email Admin Platform> --alasan "<alasan>"' };

    expect(await verifyEmailCommand([], env())).toEqual(usage);
    expect(await verifyEmailCommand(["admin@makam.co.id"], env())).toEqual(usage);
    expect(await verifyEmailCommand(["a@contoh.id", "b@contoh.id", "--alasan", "x"], env())).toEqual(usage);
    expect(await verifyEmailCommand(["admin@makam.co.id", "--salah", "x"], env())).toEqual(usage);
  });

  it("refuses an invalid email", async () => {
    expect(await verifyEmailCommand(["081111111111", "--alasan", "x"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: email tidak valid.",
    });
  });

  it("when the database cannot be reached, says so briefly without the connection string", async () => {
    const result = await verifyEmailCommand(["admin@makam.co.id", "--alasan", "x"], {
      APP_ENV: "test",
      DATABASE_URL: "postgres://makam:rahasia-sekali@127.0.0.1:1/makam",
    });

    expect(result).toEqual({ exitCode: 1, output: "Gagal: perintah berhenti karena galat (Error ECONNREFUSED)." });
    expect(result.output).not.toContain("rahasia");
  });
});
