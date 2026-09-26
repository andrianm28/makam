import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import {
  actorOf,
  emailCodeTo,
  identityOnTestDatabase,
  logInByEmail,
  logInByOtp,
  signedInAdminPlatform,
} from "../../tests/support/identity";
import { verifyEmailCommand } from "./verify-email-command";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const env = () => ({ APP_ENV: "test", DATABASE_URL: inject("databaseUrl") });

describe('npm run verify-email -- <phone> --alasan "<reason>"', () => {
  it("makes the seeded Admin Platform's email its Email Terverifikasi: an email login then works, and TOTP is still required", async () => {
    const setup = identityOnTestDatabase(db);
    await setup.identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });

    const result = await verifyEmailCommand(["0811-1111-1111", "--alasan", "Bootstrap staging sebelum WhatsApp live"], env());

    expect(result).toEqual({
      exitCode: 0,
      output:
        "Email admin@makam.co.id milik Admin Platform +6281111111111 kini Email Terverifikasi. Masuk lewat /masuk dengan email, lalu daftarkan TOTP.",
    });
    const { login, cookies } = await logInByEmail(setup, "admin@makam.co.id");
    expect(login.roles).toEqual(["pemesan", "admin_platform"]);
    expect(await setup.identity.actorFromCookies(cookies)).toMatchObject({ totp: "perlu_daftar" });
  });

  it("records an Entri Audit by ops_cli: akun.email_verifikasi, terverifikasi false to true, with the reason", async () => {
    const setup = identityOnTestDatabase(db);
    const seeded = await setup.identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });
    if (!seeded.ok) throw new Error(seeded.reason);

    await verifyEmailCommand(["081111111111", "--alasan", "Bootstrap staging"], env());

    const entries = await setup.audit.entriesAbout({ kind: "akun", id: seeded.account.id });
    expect(entries.filter((entry) => entry.action === "akun.email_verifikasi")).toEqual([
      expect.objectContaining({
        actor: { accountId: seeded.account.id, role: "ops_cli" },
        entity: { kind: "akun", id: seeded.account.id },
        before: { terverifikasi: false },
        after: { terverifikasi: true },
        reason: "Bootstrap staging",
      }),
    ]);
  });

  it("is refused for an Akun that is not an Admin Platform, and for a number with no Akun", async () => {
    const setup = identityOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await setup.identity.inviteStaff(admin, { phoneNumber: "082222222222", email: "staf@contoh.id", role: "mitra_jasa" });
    await logInByOtp(setup.identity, setup.whatsapp, "082222222222");
    const refused = { exitCode: 1, output: "Ditolak: nomor ini bukan Admin Platform." };

    expect(await verifyEmailCommand(["082222222222", "--alasan", "salah orang"], env())).toEqual(refused);
    expect(await verifyEmailCommand(["089999999999", "--alasan", "tidak ada"], env())).toEqual(refused);
    expect(await setup.identity.accountByPhoneNumber("089999999999")).toBeNull();
    await setup.identity.requestEmailLogin({ email: "staf@contoh.id", ip: "198.51.100.30" });
    await setup.settled();
    expect(setup.email.sent).toEqual([]);
  });

  it("is refused with an empty reason, and the email stays unverified", async () => {
    const setup = identityOnTestDatabase(db);
    await setup.identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });

    expect(await verifyEmailCommand(["081111111111", "--alasan", "  "], env())).toEqual({
      exitCode: 1,
      output: 'Ditolak: alasan wajib diisi (--alasan "...").',
    });
    await setup.identity.requestEmailLogin({ email: "admin@makam.co.id", ip: "198.51.100.31" });
    await setup.settled();
    expect(setup.email.sent).toEqual([]);
    expect((await setup.audit.allEntries()).map((entry) => entry.action)).not.toContain("akun.email_verifikasi");
  });

  it("is refused when another Akun already has that email as its Email Terverifikasi, and nothing changes", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, email } = setup;
    const { cookies } = await logInByOtp(identity, whatsapp, "082222222222");
    await identity.requestEmailVerification(await actorOf(identity, cookies), { email: "admin@makam.co.id", ip: "198.51.100.32" });
    const confirmed = await identity.confirmEmailVerification(await actorOf(identity, cookies), {
      code: emailCodeTo(email, "admin@makam.co.id"),
    });
    if (!confirmed.ok) throw new Error(confirmed.reason);
    await identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });

    expect(await verifyEmailCommand(["081111111111", "--alasan", "Bootstrap staging"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: email ini sudah menjadi Email Terverifikasi Akun lain. Tidak ada yang ditandai.",
    });
    expect((await setup.audit.allEntries()).map((entry) => entry.action)).not.toContain("akun.email_verifikasi");
    const { login } = await logInByEmail(setup, "admin@makam.co.id");
    expect(login.roles).toEqual(["pemesan"]);
  });

  it("is refused when the email is already its Email Terverifikasi, so every entry's before is true to life", async () => {
    const setup = identityOnTestDatabase(db);
    await setup.identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });
    await verifyEmailCommand(["081111111111", "--alasan", "Bootstrap staging"], env());

    expect(await verifyEmailCommand(["081111111111", "--alasan", "lagi"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: email Admin Platform ini sudah Email Terverifikasi. Tidak ada yang diubah.",
    });
    const actions = (await setup.audit.allEntries()).map((entry) => entry.action);
    expect(actions.filter((action) => action === "akun.email_verifikasi")).toHaveLength(1);
  });

  it("prints its usage without a number, without --alasan, or with an unknown flag", async () => {
    const usage = { exitCode: 2, output: 'Pakai: verify-email <nomor WhatsApp +62> --alasan "<alasan>"' };

    expect(await verifyEmailCommand([], env())).toEqual(usage);
    expect(await verifyEmailCommand(["081111111111"], env())).toEqual(usage);
    expect(await verifyEmailCommand(["081111111111", "082222222222", "--alasan", "x"], env())).toEqual(usage);
    expect(await verifyEmailCommand(["081111111111", "--salah", "x"], env())).toEqual(usage);
  });

  it("refuses an invalid number with the shared phone-number message", async () => {
    expect(await verifyEmailCommand(["12", "--alasan", "x"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: Nomor WhatsApp tidak valid.",
    });
  });

  it("when the database cannot be reached, says so briefly without the connection string", async () => {
    const result = await verifyEmailCommand(["081111111111", "--alasan", "x"], {
      APP_ENV: "test",
      DATABASE_URL: "postgres://makam:rahasia-sekali@127.0.0.1:1/makam",
    });

    expect(result).toEqual({ exitCode: 1, output: "Gagal: perintah berhenti karena galat (Error ECONNREFUSED)." });
    expect(result.output).not.toContain("rahasia");
  });
});
