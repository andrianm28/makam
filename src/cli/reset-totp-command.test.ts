import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { identityOnTestDatabase, logIn, signedInAdminPlatform } from "../../tests/support/identity";
import { resetTotpCommand } from "./reset-totp-command";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const env = () => ({ APP_ENV: "test", DATABASE_URL: inject("databaseUrl") });

describe("npm run reset-totp -- <email> --alasan <reason>", () => {
  it("clears the Admin Platform's TOTP enrolment and ends all its sessions: the next login must enrol again", async () => {
    const setup = identityOnTestDatabase(db);
    const admin = await signedInAdminPlatform(setup);

    const result = await resetTotpCommand(["Admin@Makam.co.id", "--alasan", "HP hilang, dikonfirmasi lewat telepon"], env());

    expect(result).toEqual({
      exitCode: 0,
      output:
        "TOTP Admin Platform admin@makam.co.id direset dan semua sesinya diakhiri. Saat masuk lagi ia mendaftarkan aplikasi authenticator baru.",
    });
    expect(await setup.identity.actorFromCookies(admin.cookies)).toBeNull();
    setup.clock.advance({ minutes: 5 });
    const again = await logIn(setup, "admin@makam.co.id");
    expect(await setup.identity.actorFromCookies(again.cookies)).toMatchObject({ totp: "perlu_daftar" });
  });

  it("records an Entri Audit by ops_cli with the reason and before/after, never the secret", async () => {
    const setup = identityOnTestDatabase(db);
    const admin = await signedInAdminPlatform(setup);

    await resetTotpCommand(["admin@makam.co.id", "--alasan", "HP hilang"], env());

    const entries = await setup.audit.entriesAbout({ kind: "akun", id: admin.actor.accountId });
    // The CLI stamps the system Clock, the test's identity a fake one: pick the entry by its action.
    expect(entries.filter((entry) => entry.action === "akun.totp_reset")).toEqual([
      expect.objectContaining({
        actor: { accountId: admin.actor.accountId, role: "ops_cli" },
        action: "akun.totp_reset",
        before: { terdaftar: true },
        after: { terdaftar: false },
        reason: "HP hilang",
      }),
    ]);
    expect(JSON.stringify(entries)).not.toContain(admin.totpSecret);
  });

  it("is refused for an email that is not an Admin Platform's Email Terverifikasi", async () => {
    const setup = identityOnTestDatabase(db);
    await signedInAdminPlatform(setup);
    await logIn(setup, "pemesan@contoh.id");
    const refused = { exitCode: 1, output: "Ditolak: email ini bukan Email Terverifikasi seorang Admin Platform." };

    expect(await resetTotpCommand(["pemesan@contoh.id", "--alasan", "salah orang"], env())).toEqual(refused);
    expect(await resetTotpCommand(["tidak.ada@contoh.id", "--alasan", "tidak ada"], env())).toEqual(refused);
  });

  it("is refused with an empty reason, and nothing changes", async () => {
    const setup = identityOnTestDatabase(db);
    const admin = await signedInAdminPlatform(setup);

    expect(await resetTotpCommand(["admin@makam.co.id", "--alasan", "  "], env())).toEqual({
      exitCode: 1,
      output: 'Ditolak: alasan wajib diisi (--alasan "...").',
    });
    expect(await setup.identity.actorFromCookies(admin.cookies)).toMatchObject({ totp: "lolos" });
    expect((await setup.audit.allEntries()).map((entry) => entry.action)).not.toContain("akun.totp_reset");
  });

  it("is refused when the Admin Platform has no enrolled authenticator to reset", async () => {
    const setup = identityOnTestDatabase(db);
    await setup.identity.seedFirstAdminPlatform({ email: "admin@makam.co.id", phoneNumber: "081111111111" });

    expect(await resetTotpCommand(["admin@makam.co.id", "--alasan", "HP hilang"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: Admin Platform ini belum mendaftarkan authenticator; tidak ada yang direset.",
    });
  });

  it("prints its usage without an email or without --alasan", async () => {
    const usage = { exitCode: 2, output: 'Pakai: reset-totp <email Admin Platform> --alasan "<alasan>"' };

    expect(await resetTotpCommand([], env())).toEqual(usage);
    expect(await resetTotpCommand(["admin@makam.co.id"], env())).toEqual(usage);
    expect(await resetTotpCommand(["admin@makam.co.id", "--salah", "x"], env())).toEqual(usage);
  });

  it("refuses an invalid email", async () => {
    expect(await resetTotpCommand(["081111111111", "--alasan", "x"], env())).toEqual({
      exitCode: 1,
      output: "Ditolak: email tidak valid.",
    });
  });

  it("when the database cannot be reached, says so briefly without the connection string", async () => {
    const result = await resetTotpCommand(["admin@makam.co.id", "--alasan", "x"], {
      APP_ENV: "test",
      DATABASE_URL: "postgres://makam:rahasia-sekali@127.0.0.1:1/makam",
    });

    expect(result).toEqual({ exitCode: 1, output: "Gagal: perintah berhenti karena galat (Error ECONNREFUSED)." });
    expect(result.output).not.toContain("rahasia");
  });
});
