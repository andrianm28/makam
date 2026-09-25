import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PortNotConfiguredError } from "@/adapters/live/not-configured";
import { FakeEmailSender, type FakeWhatsAppSender } from "@/adapters/memory";
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

  it("never creates an Akun: an email that is no Akun's Email Terverifikasi logs no one in", async () => {
    const { identity } = identityOnTestDatabase(db);
    await identity.requestEmailLogin({ email: "baru@contoh.id", ip: IP });

    expect(await identity.verifyEmailLogin({ email: "baru@contoh.id", code: "123456" })).toEqual({
      ok: false,
      reason: "kode_salah",
    });
    expect(await identity.staffAccounts()).toEqual([]);
  });
});

/** A code that is certainly not `code`. */
function otherCode(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

describe("when EmailSender refuses (staging and production until ticket 68)", () => {
  it("the email step still gives the same reply, the failure counts against no limit, and it is reported without the address or code", async () => {
    const fake = new FakeEmailSender();
    let down = true;
    const reported: string[] = [];
    const setup = identityOnTestDatabase(db, {
      email: {
        send: async (message) => {
          if (down) throw new PortNotConfiguredError("EmailSender (SumoPod SMTP)");
          return fake.send(message);
        },
      },
      reportError: (event, error) => reported.push(`${event} ${String(error)}`),
    });
    const { identity, whatsapp, clock } = setup;
    // Verified while the sender still worked.
    down = false;
    const { cookies } = await logInByOtp(identity, whatsapp, "081234567890");
    await identity.requestEmailVerification(await actorOf(identity, cookies), { email: "sari@contoh.id", ip: IP });
    await identity.confirmEmailVerification(await actorOf(identity, cookies), { code: emailCodeTo(fake, "sari@contoh.id") });
    clock.advance({ minutes: 1 });
    down = true;

    expect(await identity.requestEmailLogin({ email: "sari@contoh.id", ip: IP })).toEqual({
      ok: true,
      email: "sari@contoh.id",
      resendAt: new Date(clock.now().getTime() + 60_000),
    });
    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain("PortNotConfiguredError");
    expect(reported[0]).not.toContain("sari@contoh.id");

    down = false;
    await identity.requestEmailLogin({ email: "sari@contoh.id", ip: "198.51.100.6" });
    expect(fake.sent.at(-1)).toMatchObject({ to: "sari@contoh.id", subject: expect.stringContaining("Kode Masuk") });
  });
});

describe("lockout per Akun across channels (decision Q10)", () => {
  it("10 wrong Kode Masuk in 60 minutes by WhatsApp and email together lock the Akun for 60 minutes on both channels", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, email, clock } = setup;
    await pemesanWithEmailTerverifikasi(setup);

    await identity.requestOtp({ phoneNumber: "081234567890" });
    const whatsappCode = lastWhatsAppCode(whatsapp);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await identity.verifyOtp({ phoneNumber: "081234567890", code: otherCode(whatsappCode) });
    }
    await identity.requestEmailLogin({ email: "sari@contoh.id", ip: IP });
    const emailCode = emailCodeTo(email, "sari@contoh.id");
    for (let attempt = 1; attempt <= 4; attempt++) {
      await identity.verifyEmailLogin({ email: "sari@contoh.id", code: otherCode(emailCode) });
    }
    clock.advance({ minutes: 1 });
    await identity.requestOtp({ phoneNumber: "081234567890" });
    const openCode = lastWhatsAppCode(whatsapp);
    await identity.verifyOtp({ phoneNumber: "081234567890", code: otherCode(openCode) });
    const lockedAt = clock.now();

    expect(await identity.verifyEmailLogin({ email: "sari@contoh.id", code: otherCode(emailCode) })).toEqual({
      ok: false,
      reason: "terkunci",
      retryAt: new Date(lockedAt.getTime() + 60 * 60_000),
    });
    expect(await identity.verifyOtp({ phoneNumber: "081234567890", code: openCode })).toMatchObject({
      ok: false,
      reason: "terkunci",
    });
    expect(await identity.requestOtp({ phoneNumber: "081234567890" })).toMatchObject({ ok: false, reason: "terkunci" });
    // A locked-out email gets the same reply as any other, and no code.
    const sends = email.sent.length;
    clock.advance({ minutes: 2 });
    expect(await identity.requestEmailLogin({ email: "sari@contoh.id", ip: "198.51.100.4" })).toEqual({
      ok: true,
      email: "sari@contoh.id",
      resendAt: new Date(clock.now().getTime() + 60_000),
    });
    expect(email.sent).toHaveLength(sends);

    clock.set(new Date(lockedAt.getTime() + 60 * 60_000));
    await identity.requestEmailLogin({ email: "sari@contoh.id", ip: "198.51.100.5" });
    expect(
      await identity.verifyEmailLogin({ email: "sari@contoh.id", code: emailCodeTo(email, "sari@contoh.id") }),
    ).toMatchObject({ ok: true });
  });
});

function lastWhatsAppCode(whatsapp: FakeWhatsAppSender): string {
  const code = whatsapp.sent.at(-1)?.copyCode;
  if (!code) throw new Error("no WhatsApp code was sent");
  return code;
}

describe("email Kode Masuk rules (the WhatsApp values)", () => {
  it("a code expires 10 minutes after it was sent", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email, clock } = setup;
    await pemesanWithEmailTerverifikasi(setup);
    const sentAt = clock.now();
    await identity.requestEmailLogin({ email: "sari@contoh.id", ip: IP });
    const code = emailCodeTo(email, "sari@contoh.id");

    clock.set(new Date(sentAt.getTime() + 10 * 60_000));

    expect(await identity.verifyEmailLogin({ email: "sari@contoh.id", code })).toEqual({
      ok: false,
      reason: "kode_kedaluwarsa",
    });
  });

  it("the 5th wrong code burns it: even the right code is then refused", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email } = setup;
    await pemesanWithEmailTerverifikasi(setup);
    await identity.requestEmailLogin({ email: "sari@contoh.id", ip: IP });
    const code = emailCodeTo(email, "sari@contoh.id");

    for (let attempt = 1; attempt <= 4; attempt++) {
      expect(await identity.verifyEmailLogin({ email: "sari@contoh.id", code: otherCode(code) })).toEqual({
        ok: false,
        reason: "kode_salah",
      });
    }
    expect(await identity.verifyEmailLogin({ email: "sari@contoh.id", code: otherCode(code) })).toEqual({
      ok: false,
      reason: "terlalu_banyak_percobaan",
    });
    expect(await identity.verifyEmailLogin({ email: "sari@contoh.id", code })).toEqual({
      ok: false,
      reason: "terlalu_banyak_percobaan",
    });
  });

  it("per email: a new code 60 s after the last one, not sooner; the reply stays the same", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email, clock } = setup;
    await pemesanWithEmailTerverifikasi(setup);
    const start = clock.now();
    await identity.requestEmailLogin({ email: "sari@contoh.id", ip: IP });
    const sends = email.sent.length;

    clock.set(new Date(start.getTime() + 59_000));
    expect(await identity.requestEmailLogin({ email: "sari@contoh.id", ip: "198.51.100.2" })).toEqual({
      ok: true,
      email: "sari@contoh.id",
      resendAt: new Date(start.getTime() + 119_000),
    });
    expect(email.sent).toHaveLength(sends);

    clock.set(new Date(start.getTime() + 60_000));
    await identity.requestEmailLogin({ email: "sari@contoh.id", ip: "198.51.100.3" });
    expect(email.sent).toHaveLength(sends + 1);
  });

  it("per email: at most 5 codes in any 60 minutes", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email, clock } = setup;
    await pemesanWithEmailTerverifikasi(setup);
    // The Verifikasi Email code already went to this address; 4 more fill the hour.
    const before = email.sent.length;
    for (let request = 1; request <= 5; request++) {
      await identity.requestEmailLogin({ email: "sari@contoh.id", ip: `198.51.100.${request}` });
      clock.advance({ minutes: 2 });
    }

    expect(email.sent).toHaveLength(before + 4);
  });

  it("per IP: one request for an emailed code per 60 s and 5 per hour, whatever the email; other IPs are not affected", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, clock } = setup;
    const start = clock.now();

    expect(await identity.requestEmailLogin({ email: "satu@contoh.id", ip: IP })).toMatchObject({ ok: true });
    expect(await identity.requestEmailLogin({ email: "dua@contoh.id", ip: IP })).toEqual({
      ok: false,
      reason: "tunggu_kirim_ulang",
      retryAt: new Date(start.getTime() + 60_000),
    });
    expect(await identity.requestEmailLogin({ email: "dua@contoh.id", ip: "198.51.100.9" })).toMatchObject({ ok: true });

    for (let request = 2; request <= 5; request++) {
      clock.advance({ minutes: 1 });
      expect(await identity.requestEmailLogin({ email: `ke${request}@contoh.id`, ip: IP })).toMatchObject({ ok: true });
    }
    clock.advance({ minutes: 1 });
    expect(await identity.requestEmailLogin({ email: "enam@contoh.id", ip: IP })).toEqual({
      ok: false,
      reason: "terlalu_sering",
      retryAt: new Date(start.getTime() + 60 * 60_000),
    });
  });
});
