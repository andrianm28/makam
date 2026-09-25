import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeWhatsAppSender } from "@/adapters/memory";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { createIdentity, type Identity } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const AUTH_SECRET = "test-secret-for-identity-tests-0123456789abcdef";

function setup() {
  const clock = new FakeClock(wib("2026-10-01 09:00"));
  const whatsapp = new FakeWhatsAppSender();
  const identity = createIdentity({ db, clock, whatsapp, secret: AUTH_SECRET, baseURL: "http://localhost:3000" });
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

  it("a forged or missing session cookie signs no one in", async () => {
    const { whatsapp, identity } = setup();
    const login = await logIn(identity, whatsapp, "081234567890");
    const [token] = login.session.cookies.map((cookie) => decodeURIComponent(cookie.value).split(".")[0]);

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
