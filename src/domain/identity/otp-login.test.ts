import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeEmailSender, FakeFileStore, FakeWhatsAppSender } from "@/adapters/memory";
import { createAuditLog } from "@/domain/audit";
import { wib } from "@/lib/time/jakarta";
import type { WhatsAppSender } from "@/ports/whatsapp-sender";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { TEST_AUTH_SECRET, TEST_TOTP_KEY } from "../../../tests/support/identity";
import { createIdentity, type Identity } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

function build(clock: FakeClock, whatsapp: WhatsAppSender): Identity {
  return createIdentity({
    db,
    clock,
    whatsapp,
    email: new FakeEmailSender(),
    files: new FakeFileStore({ clock }),
    audit: createAuditLog({ db, clock }),
    secret: TEST_AUTH_SECRET,
    totpEncryptionKey: TEST_TOTP_KEY,
    baseURL: "http://localhost:3000",
  });
}

function setup() {
  const clock = new FakeClock(wib("2026-10-01 09:00"));
  const whatsapp = new FakeWhatsAppSender();
  const identity = build(clock, whatsapp);
  return { clock, whatsapp, identity };
}

describe("Pemesan OTP login over WhatsApp", () => {
  it("sends the OTP to the WhatsApp number with Meta's kode_verifikasi authentication template", async () => {
    const { whatsapp, identity } = setup();

    const result = await identity.requestOtp({ phoneNumber: "0812-3456-7890" });

    expect(result).toMatchObject({ ok: true, phoneNumber: "+6281234567890" });
    expect(whatsapp.sent).toHaveLength(1);
    const [message] = whatsapp.sent;
    expect(message).toMatchObject({ to: "+6281234567890", template: "kode_verifikasi", language: "id" });
    expect(message.copyCode).toMatch(/^\d{6}$/);
    expect(message.parameters).toEqual([message.copyCode]);
  });

  it("a correct OTP for a number with no account creates the Pemesan account and logs it in", async () => {
    const { whatsapp, identity } = setup();
    await identity.requestOtp({ phoneNumber: "081234567890" });

    const login = await identity.verifyOtp({ phoneNumber: "081234567890", code: lastCode(whatsapp) });

    expect(login).toMatchObject({
      ok: true,
      accountCreated: true,
      account: { phoneNumber: "+6281234567890" },
    });
    if (!login.ok) throw new Error("login failed");
    const actor = await identity.actorFromCookies(cookieHeader(login.session.cookies));
    expect(actor).toEqual({
      accountId: login.account.id,
      phoneNumber: "+6281234567890",
      roles: ["pemesan"],
      totp: "tidak_perlu",
      sessionId: expect.any(String),
    });
  });

  it("a Pemesan with an account logs into that same account, however the number is written", async () => {
    const { clock, whatsapp, identity } = setup();
    const first = await logIn(identity, whatsapp, "081234567890");
    clock.advance({ days: 3 });

    await identity.requestOtp({ phoneNumber: "+62 812 3456 7890" });
    const again = await identity.verifyOtp({ phoneNumber: "6281234567890", code: lastCode(whatsapp) });

    expect(again).toMatchObject({ ok: true, accountCreated: false, account: first.account });
    if (!again.ok) throw new Error("login failed");
    expect(await identity.actorFromCookies(cookieHeader(again.session.cookies))).toMatchObject({
      accountId: first.account.id,
    });
  });
});

describe("OTP limits", () => {
  it("a wrong code is refused and creates no account", async () => {
    const { whatsapp, identity } = setup();
    await identity.requestOtp({ phoneNumber: "081234567890" });

    const login = await identity.verifyOtp({ phoneNumber: "081234567890", code: otherCode(lastCode(whatsapp)) });

    expect(login).toEqual({ ok: false, reason: "kode_salah" });
    expect(await identity.accountByPhoneNumber("081234567890")).toBeNull();
  });

  it("a wrong code of the same length, one digit off the real one, is still refused", async () => {
    const { whatsapp, identity } = setup();
    await identity.requestOtp({ phoneNumber: "081234567890" });
    const code = lastCode(whatsapp);
    const oneDigitOff = code.slice(0, -1) + ((Number(code.at(-1)) + 1) % 10).toString();

    expect(oneDigitOff).toHaveLength(code.length);
    expect(await identity.verifyOtp({ phoneNumber: "081234567890", code: oneDigitOff })).toEqual({
      ok: false,
      reason: "kode_salah",
    });
    expect(await identity.accountByPhoneNumber("081234567890")).toBeNull();
  });

  it("a code expires 10 minutes after it was sent", async () => {
    const { clock, whatsapp, identity } = setup();
    const sent = await identity.requestOtp({ phoneNumber: "081234567890" });
    const code = lastCode(whatsapp);
    expect(sent).toMatchObject({ ok: true, expiresAt: wib("2026-10-01 09:10") });

    clock.set(wib("2026-10-01 09:10"));

    expect(await identity.verifyOtp({ phoneNumber: "081234567890", code })).toEqual({
      ok: false,
      reason: "kode_kedaluwarsa",
    });
  });

  it("5 wrong codes burn the OTP: even the right code is then refused until a new OTP is sent", async () => {
    const { whatsapp, identity } = setup();
    await identity.requestOtp({ phoneNumber: "081234567890" });
    const code = lastCode(whatsapp);

    for (let attempt = 1; attempt <= 4; attempt++) {
      expect(await identity.verifyOtp({ phoneNumber: "081234567890", code: otherCode(code) })).toEqual({
        ok: false,
        reason: "kode_salah",
      });
    }
    expect(await identity.verifyOtp({ phoneNumber: "081234567890", code: otherCode(code) })).toEqual({
      ok: false,
      reason: "terlalu_banyak_percobaan",
    });

    expect(await identity.verifyOtp({ phoneNumber: "081234567890", code })).toEqual({
      ok: false,
      reason: "terlalu_banyak_percobaan",
    });
  });

  it("4 wrong codes still leave the right code working", async () => {
    const { whatsapp, identity } = setup();
    await identity.requestOtp({ phoneNumber: "081234567890" });
    const code = lastCode(whatsapp);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await identity.verifyOtp({ phoneNumber: "081234567890", code: otherCode(code) });
    }

    expect(await identity.verifyOtp({ phoneNumber: "081234567890", code })).toMatchObject({ ok: true });
  });

  it("says when Kirim ulang and the fallback slot open: 60 s after the OTP was sent", async () => {
    const { identity } = setup();

    expect(await identity.requestOtp({ phoneNumber: "081234567890" })).toEqual({
      ok: true,
      phoneNumber: "+6281234567890",
      sentAt: wib("2026-10-01 09:00"),
      expiresAt: wib("2026-10-01 09:10"),
      resendAt: wib("2026-10-01 09:01"),
      fallbackAt: wib("2026-10-01 09:01"),
      // No Akun yet, so no Email Terverifikasi: the slot points to CS.
      emailFallback: false,
    });
  });

  it("when WhatsApp refuses the OTP the Pemesan is told, and may try again at once", async () => {
    const clock = new FakeClock(wib("2026-10-01 09:00"));
    const whatsapp = new FakeWhatsAppSender();
    let down = true;
    const flaky: WhatsAppSender = {
      sendTemplate: async (message) => {
        if (down) throw new Error("kirim.dev unavailable");
        return whatsapp.sendTemplate(message);
      },
      statusOf: (id) => whatsapp.statusOf(id),
      replyText: (reply) => whatsapp.replyText(reply),
    };
    const identity = build(clock, flaky);

    expect(await identity.requestOtp({ phoneNumber: "081234567890" })).toEqual({ ok: false, reason: "gagal_kirim" });

    down = false;
    expect(await identity.requestOtp({ phoneNumber: "081234567890" })).toMatchObject({ ok: true });
    expect(await identity.verifyOtp({ phoneNumber: "081234567890", code: lastCode(whatsapp) })).toMatchObject({
      ok: true,
    });
  });

  it("a new OTP can be sent 60 s after the last one, not sooner", async () => {
    const { clock, whatsapp, identity } = setup();
    await identity.requestOtp({ phoneNumber: "081234567890" });

    clock.set(wib("2026-10-01 09:00:59"));
    expect(await identity.requestOtp({ phoneNumber: "0812-3456-7890" })).toEqual({
      ok: false,
      reason: "tunggu_kirim_ulang",
      retryAt: wib("2026-10-01 09:01"),
    });
    expect(whatsapp.sent).toHaveLength(1);

    clock.set(wib("2026-10-01 09:01"));
    expect(await identity.requestOtp({ phoneNumber: "081234567890" })).toMatchObject({ ok: true });
    expect(whatsapp.sent).toHaveLength(2);
  });

  it("a number gets at most 5 OTPs in any 60 minutes", async () => {
    const { clock, whatsapp, identity } = setup();
    for (let sent = 1; sent <= 5; sent++) {
      expect(await identity.requestOtp({ phoneNumber: "081234567890" })).toMatchObject({ ok: true });
      clock.advance({ minutes: 2 });
    }

    // 09:10, and the first OTP went at 09:00.
    expect(await identity.requestOtp({ phoneNumber: "081234567890" })).toEqual({
      ok: false,
      reason: "terlalu_sering",
      retryAt: wib("2026-10-01 10:00"),
    });
    expect(whatsapp.sent).toHaveLength(5);

    clock.set(wib("2026-10-01 10:00"));
    expect(await identity.requestOtp({ phoneNumber: "081234567890" })).toMatchObject({ ok: true });
  });

  // A number with no Akun yet is locked by itself; once it has an Akun, the lock is the Akun's across
  // WhatsApp and email (decision Q10, ticket 67: email-login.test.ts, "lockout per Akun across channels").
  it("10 wrong codes within 60 minutes lock a number with no Akun yet for 60 minutes: no OTP is sent and no code accepted", async () => {
    const { clock, whatsapp, identity } = setup();
    const wrongTimes = async (times: number) => {
      const code = lastCode(whatsapp);
      for (let attempt = 1; attempt <= times; attempt++) {
        await identity.verifyOtp({ phoneNumber: "081234567890", code: otherCode(code) });
      }
    };
    await identity.requestOtp({ phoneNumber: "081234567890" });
    await wrongTimes(4);
    clock.advance({ minutes: 1 });
    await identity.requestOtp({ phoneNumber: "081234567890" });
    await wrongTimes(4);
    clock.advance({ minutes: 1 });
    await identity.requestOtp({ phoneNumber: "081234567890" });
    const openCode = lastCode(whatsapp);
    await wrongTimes(1);
    clock.set(wib("2026-10-01 09:03"));

    expect(await identity.verifyOtp({ phoneNumber: "081234567890", code: otherCode(openCode) })).toEqual({
      ok: false,
      reason: "terkunci",
      retryAt: wib("2026-10-01 10:03"),
    });
    expect(await identity.verifyOtp({ phoneNumber: "081234567890", code: openCode })).toEqual({
      ok: false,
      reason: "terkunci",
      retryAt: wib("2026-10-01 10:03"),
    });
    clock.set(wib("2026-10-01 10:02:59"));
    expect(await identity.requestOtp({ phoneNumber: "081234567890" })).toEqual({
      ok: false,
      reason: "terkunci",
      retryAt: wib("2026-10-01 10:03"),
    });

    clock.set(wib("2026-10-01 10:03"));
    await identity.requestOtp({ phoneNumber: "081234567890" });
    expect(await identity.verifyOtp({ phoneNumber: "081234567890", code: lastCode(whatsapp) })).toMatchObject({
      ok: true,
    });
  });

  it("only the newest OTP works once a new one is sent", async () => {
    const { clock, whatsapp, identity } = setup();
    await identity.requestOtp({ phoneNumber: "081234567890" });
    const oldCode = lastCode(whatsapp);
    clock.advance({ minutes: 1 });
    await identity.requestOtp({ phoneNumber: "081234567890" });
    const newCode = lastCode(whatsapp);

    if (oldCode !== newCode) {
      expect(await identity.verifyOtp({ phoneNumber: "081234567890", code: oldCode })).toEqual({
        ok: false,
        reason: "kode_salah",
      });
    }
    expect(await identity.verifyOtp({ phoneNumber: "081234567890", code: newCode })).toMatchObject({ ok: true });
  });

  it("a code still works just before its 10 minutes are up", async () => {
    const { clock, whatsapp, identity } = setup();
    await identity.requestOtp({ phoneNumber: "081234567890" });
    clock.set(wib("2026-10-01 09:09:59"));

    expect(await identity.verifyOtp({ phoneNumber: "081234567890", code: lastCode(whatsapp) })).toMatchObject({
      ok: true,
    });
  });
});

describe("Pemesan session", () => {
  it("lasts 90 days on the Clock, then the Pemesan is no longer signed in", async () => {
    const { clock, whatsapp, identity } = setup();
    const login = await logIn(identity, whatsapp, "081234567890");
    const cookies = cookieHeader(login.session.cookies);

    expect(login.session.expiresAt).toEqual(wib("2026-12-30 09:00"));

    clock.set(wib("2026-12-30 08:59"));
    expect(await identity.actorFromCookies(cookies)).toMatchObject({ accountId: login.account.id });

    clock.set(wib("2026-12-30 09:00"));
    expect(await identity.actorFromCookies(cookies)).toBeNull();
  });

  it("the session cookie is kept by the browser for the same 90 days", async () => {
    const { whatsapp, identity } = setup();
    const login = await logIn(identity, whatsapp, "081234567890");

    expect(login.session.cookies).toContainEqual(
      expect.objectContaining({ name: "makam.session_token", maxAge: 90 * 86_400, httpOnly: true }),
    );
  });

  it("after Keluar the session no longer signs the Pemesan in", async () => {
    const { whatsapp, identity } = setup();
    const login = await logIn(identity, whatsapp, "081234567890");
    const cookies = cookieHeader(login.session.cookies);

    await identity.endSession(cookies);

    expect(await identity.actorFromCookies(cookies)).toBeNull();
  });

  it("a forged or missing session cookie signs no one in", async () => {
    const { whatsapp, identity } = setup();
    const login = await logIn(identity, whatsapp, "081234567890");
    const sessionCookie = login.session.cookies.find((cookie) => cookie.name === "makam.session_token");
    if (!sessionCookie) throw new Error("no session cookie was issued");
    const [token] = decodeURIComponent(sessionCookie.value).split(".");

    expect(await identity.actorFromCookies(null)).toBeNull();
    expect(await identity.actorFromCookies(`makam.session_token=${token}.forged`)).toBeNull();
  });
});

async function logIn(identity: Identity, whatsapp: FakeWhatsAppSender, phoneNumber: string) {
  await identity.requestOtp({ phoneNumber });
  const login = await identity.verifyOtp({ phoneNumber, code: lastCode(whatsapp) });
  if (!login.ok) throw new Error(`login failed: ${login.reason}`);
  return login;
}

/** A code that is certainly not `code`. */
function otherCode(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

function lastCode(whatsapp: FakeWhatsAppSender): string {
  const code = whatsapp.sent.at(-1)?.copyCode;
  if (!code) throw new Error("no OTP was sent");
  return code;
}

/** What the browser sends back after storing the session cookies. */
function cookieHeader(cookies: { name: string; value: string }[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
