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

/** A Pemesan logged in by WhatsApp who has verified `address` in the profile. */
async function pemesanWithEmailTerverifikasi(
  setup: ReturnType<typeof identityOnTestDatabase>,
  phoneNumber = "081234567890",
  address = "sari@contoh.id",
) {
  const { identity, whatsapp, email, clock } = setup;
  const { login, cookies } = await logInByOtp(identity, whatsapp, phoneNumber);
  const actor = await actorOf(identity, cookies);
  const sent = await identity.requestEmailVerification(actor, { email: address, ip: IP });
  if (!sent.ok) throw new Error(`Verifikasi Email not sent: ${sent.reason}`);
  const confirmed = await identity.confirmEmailVerification(actor, { code: emailCodeTo(email, address) });
  if (!confirmed.ok) throw new Error(`Verifikasi Email refused: ${confirmed.reason}`);
  // Later sends to the same address and from the same IP are past the 60 s resend wait.
  clock.advance({ minutes: 1 });
  return { account: login.account, actor, cookies };
}

function cookieHeader(cookies: { name: string; value: string }[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

describe("Masuk dengan email", () => {
  it("a Pemesan logs in with the Kode Masuk sent to the Email Terverifikasi: the same Akun, a 90-day session", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email, clock } = setup;
    const { account } = await pemesanWithEmailTerverifikasi(setup);
    const sentAt = clock.now();

    const reply = await identity.requestEmailLogin({ email: "  SARI@contoh.id", ip: IP });

    expect(reply).toEqual({ ok: true, email: "sari@contoh.id", resendAt: new Date(sentAt.getTime() + 60_000) });
    expect(email.sent.at(-1)).toMatchObject({ to: "sari@contoh.id", subject: expect.stringContaining("Kode Masuk") });

    const login = await identity.verifyEmailLogin({ email: "sari@contoh.id", code: emailCodeTo(email, "sari@contoh.id") });

    expect(login).toMatchObject({ ok: true, accountCreated: false, account, roles: ["pemesan"] });
    if (!login.ok) throw new Error(login.reason);
    expect(login.session.expiresAt).toEqual(new Date(sentAt.getTime() + 90 * 86_400_000));
    expect(await identity.actorFromCookies(cookieHeader(login.session.cookies))).toMatchObject({
      accountId: account.id,
      totp: "tidak_perlu",
    });
  });

  it("an unknown email and an email only typed into the profile get the identical reply, and no email is sent", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, email, clock } = setup;
    const { cookies } = await logInByOtp(identity, whatsapp, "081234567890");
    const pemesan = await actorOf(identity, cookies);
    expect(await identity.saveEmail(pemesan, { email: "Ketik@Contoh.id" })).toEqual({ ok: true, email: "ketik@contoh.id" });
    expect(await identity.accountEmail(pemesan)).toEqual({ email: "ketik@contoh.id", verified: false });
    const expected = { ok: true, resendAt: new Date(clock.now().getTime() + 60_000) };

    expect(await identity.requestEmailLogin({ email: "ketik@contoh.id", ip: IP })).toEqual({
      ...expected,
      email: "ketik@contoh.id",
    });
    expect(await identity.requestEmailLogin({ email: "siapa@contoh.id", ip: "198.51.100.1" })).toEqual({
      ...expected,
      email: "siapa@contoh.id",
    });
    expect(email.sent).toEqual([]);
  });
});
