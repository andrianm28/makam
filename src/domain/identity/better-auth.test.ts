import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "@/adapters/memory";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { createBetterAuth } from "./better-auth";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/*
 * The seam here is the identity module's Better Auth engine (createBetterAuth)
 * and Better Auth's own adapter, because no public identity function writes
 * these rows yet. The Clock is years away from the system date, so a system
 * timestamp can never pass for a Clock one.
 */
function setup() {
  const clock = new FakeClock(wib("2031-03-01 09:00"));
  const auth = createBetterAuth({
    db,
    clock,
    secret: "test-secret-for-identity-tests-0123456789abcdef",
    baseURL: "http://localhost:3000",
    verifyCode: async () => {
      throw new Error("not used here");
    },
  });
  return { clock, auth };
}

async function someUser(auth: ReturnType<typeof setup>["auth"]) {
  const context = await auth.$context;
  return context.internalAdapter.createUser(
    { email: "6281234567890@wa.makam.invalid", name: "" },
    { method: "phone-number" },
  );
}

describe("every row Better Auth writes carries Clock time, never system time", () => {
  it("a verification value is stamped with the Clock when created and when updated", async () => {
    const { clock, auth } = setup();
    const context = await auth.$context;

    await context.internalAdapter.createVerificationValue({
      identifier: "+6281234567890",
      value: "x",
      expiresAt: wib("2031-03-01 09:10"),
    });
    expect(await context.internalAdapter.findVerificationValue("+6281234567890")).toMatchObject({
      createdAt: wib("2031-03-01 09:00"),
      updatedAt: wib("2031-03-01 09:00"),
    });

    clock.set(wib("2031-03-01 09:05"));
    await context.internalAdapter.updateVerificationByIdentifier("+6281234567890", { value: "y" });
    expect(await context.internalAdapter.findVerificationValue("+6281234567890")).toMatchObject({
      value: "y",
      createdAt: wib("2031-03-01 09:00"),
      updatedAt: wib("2031-03-01 09:05"),
    });
  });

  it("a session update is stamped with the Clock", async () => {
    const { clock, auth } = setup();
    const context = await auth.$context;
    const user = await someUser(auth);
    const session = await context.internalAdapter.createSession(user.id);

    clock.set(wib("2031-03-02 10:00"));
    await context.internalAdapter.updateSession(session.token, { userAgent: "Pemesan phone" });

    expect((await context.internalAdapter.findSession(session.token))?.session).toMatchObject({
      userAgent: "Pemesan phone",
      createdAt: wib("2031-03-01 09:00"),
      updatedAt: wib("2031-03-02 10:00"),
    });
  });

  it("a login-provider account is stamped with the Clock when created and when updated", async () => {
    const { clock, auth } = setup();
    const context = await auth.$context;
    const user = await someUser(auth);

    const account = await context.internalAdapter.createAccount({
      userId: user.id,
      providerId: "phone-number",
      accountId: user.id,
    });
    expect(account).toMatchObject({ createdAt: wib("2031-03-01 09:00"), updatedAt: wib("2031-03-01 09:00") });

    clock.set(wib("2031-03-03 08:00"));
    await context.internalAdapter.updateAccount(account.id, { scope: "otp" });
    expect(await context.internalAdapter.findAccountByUserId(user.id)).toEqual([
      expect.objectContaining({ scope: "otp", createdAt: wib("2031-03-01 09:00"), updatedAt: wib("2031-03-03 08:00") }),
    ]);
  });
});
