import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { identityOnTestDatabase, logInByOtp } from "../../../tests/support/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("seeding the first Admin Platform", () => {
  it("creates the first Admin Platform with its WhatsApp number and email; its OTP login holds the role", async () => {
    const { identity, whatsapp } = identityOnTestDatabase(db);

    const seeded = await identity.seedFirstAdminPlatform({ phoneNumber: "0811-1111-1111", email: "Admin@Makam.co.id" });

    expect(seeded).toMatchObject({ ok: true, account: { phoneNumber: "+6281111111111" } });
    const { cookies } = await logInByOtp(identity, whatsapp, "081111111111");
    expect(await identity.actorFromCookies(cookies)).toMatchObject({
      phoneNumber: "+6281111111111",
      roles: ["pemesan", "admin_platform"],
    });
    expect(await identity.staffAccounts()).toEqual([
      {
        accountId: expect.any(String),
        phoneNumber: "+6281111111111",
        email: "admin@makam.co.id",
        roles: ["admin_platform"],
        deactivated: false,
      },
    ]);
  });

  it("is refused once an Admin Platform exists: every later one comes by Undangan Staf", async () => {
    const { identity } = identityOnTestDatabase(db);
    await identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });

    expect(await identity.seedFirstAdminPlatform({ phoneNumber: "082222222222", email: "dua@makam.co.id" })).toEqual({
      ok: false,
      reason: "admin_platform_sudah_ada",
    });
    expect(await identity.accountByPhoneNumber("082222222222")).toBeNull();
  });

  it("needs a valid email and a +62 WhatsApp number", async () => {
    const { identity } = identityOnTestDatabase(db);

    expect(await identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "" })).toEqual({
      ok: false,
      reason: "email_tidak_valid",
    });
    expect(await identity.seedFirstAdminPlatform({ phoneNumber: "12", email: "admin@makam.co.id" })).toEqual({
      ok: false,
      reason: "nomor_tidak_valid",
    });
    expect(await identity.staffAccounts()).toEqual([]);
  });
});
