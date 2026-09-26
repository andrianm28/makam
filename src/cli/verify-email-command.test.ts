import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { identityOnTestDatabase, logInByEmail } from "../../tests/support/identity";
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
});
