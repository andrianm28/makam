import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, emailCodeTo, identityOnTestDatabase, logInByOtp } from "../../../tests/support/identity";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const IP = "203.0.113.7";

describe("Verifikasi Email in the Akun Saya profile", () => {
  it("a code goes to the typed email, and entering it makes that email the Akun's Email Terverifikasi", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, email } = setup;
    const { cookies } = await logInByOtp(identity, whatsapp, "081234567890");
    const pemesan = await actorOf(identity, cookies);

    const sent = await identity.requestEmailVerification(pemesan, { email: " Sari@Contoh.id ", ip: IP });

    expect(sent).toMatchObject({ ok: true, email: "sari@contoh.id", resendAt: wib("2026-10-01 09:01") });
    expect(email.sent).toHaveLength(1);
    expect(await identity.accountEmail(pemesan)).toEqual({ email: null, verified: false });

    const confirmed = await identity.confirmEmailVerification(pemesan, { code: emailCodeTo(email, "sari@contoh.id") });

    expect(confirmed).toEqual({ ok: true, email: "sari@contoh.id" });
    expect(await identity.accountEmail(pemesan)).toEqual({ email: "sari@contoh.id", verified: true });
  });
});
