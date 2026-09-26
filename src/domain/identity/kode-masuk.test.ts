import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeEmailSender } from "@/adapters/memory";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  actorOf,
  cookieHeader,
  emailCodeTo,
  identityOnTestDatabase,
  logIn,
  nextTestIp,
} from "../../../tests/support/identity";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("a Kode Masuk to an email", () => {
  it("a Kode Masuk to an unknown email creates the Akun only when entered", async () => {
    const { identity, email } = identityOnTestDatabase(db);

    const sent = await identity.requestKodeMasuk({ email: " Sari@Contoh.id ", ip: nextTestIp() });

    expect(sent).toEqual({
      ok: true,
      email: "sari@contoh.id",
      sentAt: wib("2026-10-01 09:00"),
      expiresAt: wib("2026-10-01 09:10"),
      resendAt: wib("2026-10-01 09:01"),
    });
    expect(email.sent.map((message) => message.to)).toEqual(["sari@contoh.id"]);
    expect(await identity.accountByEmail("sari@contoh.id")).toBeNull();

    const login = await identity.verifyKodeMasuk({ email: "SARI@contoh.id", code: emailCodeTo(email, "sari@contoh.id") });

    expect(login).toMatchObject({ ok: true, accountCreated: true, account: { email: "sari@contoh.id", phoneNumber: null } });
    if (!login.ok) throw new Error("login failed");
    expect(await identity.accountByEmail("Sari@Contoh.id")).toEqual(login.account);
    expect(await identity.actorFromCookies(cookieHeader(login.session.cookies))).toEqual({
      accountId: login.account.id,
      email: "sari@contoh.id",
      phoneNumber: null,
      roles: ["pemesan"],
      lokasiIds: [],
      totp: "tidak_perlu",
      sessionId: expect.any(String),
    });
  });
});

describe("logging in with a Kode Masuk", () => {
  it("a Kode Masuk logs into the Akun of that Email Terverifikasi, however the email is written", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email, clock } = setup;
    const first = await logIn(setup, "sari@contoh.id");
    clock.advance({ days: 3 });

    await identity.requestKodeMasuk({ email: "SARI@Contoh.ID", ip: nextTestIp() });
    const again = await identity.verifyKodeMasuk({ email: " sari@contoh.id", code: emailCodeTo(email, "sari@contoh.id") });

    expect(again).toMatchObject({ ok: true, accountCreated: false, account: first.login.account });
    if (!again.ok) throw new Error("login failed");
    expect(await identity.actorFromCookies(cookieHeader(again.session.cookies))).toMatchObject({
      accountId: first.login.account.id,
    });
  });

  it("the reply is the same for every email: an Akun's Email Terverifikasi and an unknown email both get a Kode Masuk", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email } = setup;
    await logIn(setup, "sari@contoh.id");
    setup.clock.advance({ minutes: 1 });

    const known = await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() });
    const unknown = await identity.requestKodeMasuk({ email: "budi@contoh.id", ip: nextTestIp() });

    expect(known).toEqual({ ...unknown, email: "sari@contoh.id" });
    expect(unknown).toMatchObject({ ok: true, email: "budi@contoh.id" });
    expect(email.sent.slice(-2).map((message) => [message.to, message.subject.startsWith("Kode Masuk")])).toEqual([
      ["sari@contoh.id", true],
      ["budi@contoh.id", true],
    ]);
  });

  it("a wrong Kode Masuk is refused and creates no Akun", async () => {
    const { identity, email } = identityOnTestDatabase(db);
    await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() });
    const code = emailCodeTo(email, "sari@contoh.id");
    const oneDigitOff = code.slice(0, -1) + ((Number(code.at(-1)) + 1) % 10).toString();

    expect(await identity.verifyKodeMasuk({ email: "sari@contoh.id", code: oneDigitOff })).toEqual({
      ok: false,
      reason: "kode_salah",
    });
    expect(await identity.accountByEmail("sari@contoh.id")).toBeNull();
  });

  it("a Kode Masuk sent to one email logs no one into another", async () => {
    const { identity, email } = identityOnTestDatabase(db);
    await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() });

    expect(
      await identity.verifyKodeMasuk({ email: "budi@contoh.id", code: emailCodeTo(email, "sari@contoh.id") }),
    ).toEqual({ ok: false, reason: "kode_salah" });
    expect(await identity.accountByEmail("budi@contoh.id")).toBeNull();
  });

  it("the phone number never logs anyone in: it is no email, and two Akun may give the same one", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity } = setup;

    expect(await identity.requestKodeMasuk({ email: "081234567890", ip: nextTestIp() })).toEqual({
      ok: false,
      reason: "email_tidak_valid",
    });
    const sari = await logIn(setup, "sari@contoh.id", { phoneNumber: "0812-3456-7890" });
    const budi = await logIn(setup, "budi@contoh.id", { phoneNumber: "+62 812 3456 7890" });

    expect(await actorOf(identity, sari.cookies)).toMatchObject({ email: "sari@contoh.id", phoneNumber: "+6281234567890" });
    expect(await actorOf(identity, budi.cookies)).toMatchObject({ email: "budi@contoh.id", phoneNumber: "+6281234567890" });
    expect(budi.login.account.id).not.toBe(sari.login.account.id);
  });
});

describe("Kode Masuk rules", () => {
  it("a code expires 10 minutes after it was sent, and still works just before", async () => {
    const { identity, email, clock } = identityOnTestDatabase(db);
    await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() });
    const code = emailCodeTo(email, "sari@contoh.id");

    clock.set(wib("2026-10-01 09:10"));
    expect(await identity.verifyKodeMasuk({ email: "sari@contoh.id", code })).toEqual({
      ok: false,
      reason: "kode_kedaluwarsa",
    });

    clock.set(wib("2026-10-01 09:11"));
    await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() });
    clock.set(wib("2026-10-01 09:20:59"));
    const fresh = emailCodeTo(email, "sari@contoh.id");
    expect(await identity.verifyKodeMasuk({ email: "sari@contoh.id", code: fresh })).toMatchObject({ ok: true });
  });

  it("the 5th wrong code burns it: even the right code is then refused; 4 wrong codes leave it working", async () => {
    const { identity, email, clock } = identityOnTestDatabase(db);
    await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() });
    const code = emailCodeTo(email, "sari@contoh.id");
    for (let attempt = 1; attempt <= 4; attempt++) {
      expect(await identity.verifyKodeMasuk({ email: "sari@contoh.id", code: otherCode(code) })).toEqual({
        ok: false,
        reason: "kode_salah",
      });
    }
    expect(await identity.verifyKodeMasuk({ email: "sari@contoh.id", code: otherCode(code) })).toEqual({
      ok: false,
      reason: "terlalu_banyak_percobaan",
    });
    expect(await identity.verifyKodeMasuk({ email: "sari@contoh.id", code })).toEqual({
      ok: false,
      reason: "terlalu_banyak_percobaan",
    });

    clock.advance({ minutes: 1 });
    await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() });
    const fresh = emailCodeTo(email, "sari@contoh.id");
    for (let attempt = 1; attempt <= 4; attempt++) {
      await identity.verifyKodeMasuk({ email: "sari@contoh.id", code: otherCode(fresh) });
    }
    expect(await identity.verifyKodeMasuk({ email: "sari@contoh.id", code: fresh })).toMatchObject({ ok: true });
  });

  it("a Kode Masuk signs in once, and only the newest one works", async () => {
    const { identity, email, clock } = identityOnTestDatabase(db);
    await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() });
    const oldCode = emailCodeTo(email, "sari@contoh.id");
    clock.advance({ minutes: 1 });
    await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() });
    const newCode = emailCodeTo(email, "sari@contoh.id");

    if (oldCode !== newCode) {
      expect(await identity.verifyKodeMasuk({ email: "sari@contoh.id", code: oldCode })).toEqual({
        ok: false,
        reason: "kode_salah",
      });
    }
    expect(await identity.verifyKodeMasuk({ email: "sari@contoh.id", code: newCode })).toMatchObject({ ok: true });
    expect(await identity.verifyKodeMasuk({ email: "sari@contoh.id", code: newCode })).toEqual({
      ok: false,
      reason: "kode_salah",
    });
  });
});

describe("the Kode Masuk limits are counted per email and per IP", () => {
  it("per email: a new code 60 s after the last one, not sooner, whatever the IP", async () => {
    const { identity, email, clock } = identityOnTestDatabase(db);
    await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() });

    clock.set(wib("2026-10-01 09:00:59"));
    expect(await identity.requestKodeMasuk({ email: "Sari@contoh.id", ip: nextTestIp() })).toEqual({
      ok: false,
      reason: "tunggu_kirim_ulang",
      retryAt: wib("2026-10-01 09:01"),
    });
    expect(email.sent).toHaveLength(1);

    clock.set(wib("2026-10-01 09:01"));
    expect(await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() })).toMatchObject({ ok: true });
    expect(email.sent).toHaveLength(2);
  });

  it("per email: at most 5 codes in any 60 minutes", async () => {
    const { identity, email, clock } = identityOnTestDatabase(db);
    for (let sent = 1; sent <= 5; sent++) {
      expect(await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() })).toMatchObject({ ok: true });
      clock.advance({ minutes: 2 });
    }

    expect(await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() })).toEqual({
      ok: false,
      reason: "terlalu_sering",
      retryAt: wib("2026-10-01 10:00"),
    });
    expect(email.sent).toHaveLength(5);

    clock.set(wib("2026-10-01 10:00"));
    expect(await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() })).toMatchObject({ ok: true });
  });

  it("per IP: one request per 60 s and 5 per hour, whatever the email; other IPs are not affected", async () => {
    const { identity, clock } = identityOnTestDatabase(db);
    const ip = "203.0.113.9";
    expect(await identity.requestKodeMasuk({ email: "a@contoh.id", ip })).toMatchObject({ ok: true });
    expect(await identity.requestKodeMasuk({ email: "b@contoh.id", ip })).toEqual({
      ok: false,
      reason: "tunggu_kirim_ulang",
      retryAt: wib("2026-10-01 09:01"),
    });
    for (const address of ["c", "d", "e", "f"]) {
      clock.advance({ minutes: 2 });
      expect(await identity.requestKodeMasuk({ email: `${address}@contoh.id`, ip })).toMatchObject({ ok: true });
    }
    clock.advance({ minutes: 2 });

    expect(await identity.requestKodeMasuk({ email: "g@contoh.id", ip })).toEqual({
      ok: false,
      reason: "terlalu_sering",
      retryAt: wib("2026-10-01 10:00"),
    });
    expect(await identity.requestKodeMasuk({ email: "g@contoh.id", ip: "203.0.113.10" })).toMatchObject({ ok: true });
  });

  it("10 wrong codes in 60 minutes lock the email for 60 minutes: no code sent and none accepted, whether or not it has an Akun", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email, clock } = setup;
    await logIn(setup, "sari@contoh.id");
    const wrongTimes = async (address: string, times: number) => {
      const code = emailCodeTo(email, address);
      for (let attempt = 1; attempt <= times; attempt++) {
        await identity.verifyKodeMasuk({ email: address, code: otherCode(code) });
      }
    };

    for (const address of ["sari@contoh.id", "budi@contoh.id"]) {
      clock.set(wib("2026-10-01 09:01"));
      await identity.requestKodeMasuk({ email: address, ip: nextTestIp() });
      await wrongTimes(address, 4);
      clock.set(wib("2026-10-01 09:02"));
      await identity.requestKodeMasuk({ email: address, ip: nextTestIp() });
      await wrongTimes(address, 4);
      clock.set(wib("2026-10-01 09:03"));
      await identity.requestKodeMasuk({ email: address, ip: nextTestIp() });
      const openCode = emailCodeTo(email, address);
      await wrongTimes(address, 1);

      expect(await identity.verifyKodeMasuk({ email: address, code: otherCode(openCode) })).toEqual({
        ok: false,
        reason: "terkunci",
        retryAt: wib("2026-10-01 10:03"),
      });
      expect(await identity.verifyKodeMasuk({ email: address, code: openCode })).toEqual({
        ok: false,
        reason: "terkunci",
        retryAt: wib("2026-10-01 10:03"),
      });
      clock.set(wib("2026-10-01 10:02:59"));
      expect(await identity.requestKodeMasuk({ email: address, ip: nextTestIp() })).toEqual({
        ok: false,
        reason: "terkunci",
        retryAt: wib("2026-10-01 10:03"),
      });
    }

    clock.set(wib("2026-10-01 10:03"));
    await identity.requestKodeMasuk({ email: "sari@contoh.id", ip: nextTestIp() });
    const code = emailCodeTo(email, "sari@contoh.id");
    expect(await identity.verifyKodeMasuk({ email: "sari@contoh.id", code })).toMatchObject({
      ok: true,
      accountCreated: false,
    });
  });
});

describe("when the EmailSender refuses a Kode Masuk", () => {
  it("the person sees gagal kirim and may try again at once from the same IP; it is reported without the address or code", async () => {
    const fake = new FakeEmailSender();
    const reported: string[] = [];
    const { identity } = identityOnTestDatabase(db, {
      email: fake,
      reportError: (event, error) => reported.push(`${event} ${String(error)}`),
    });
    fake.failNextSend();
    const ip = nextTestIp();

    expect(await identity.requestKodeMasuk({ email: "sari@contoh.id", ip })).toEqual({ ok: false, reason: "gagal_kirim" });
    expect(reported).toHaveLength(1);
    expect(reported[0]).not.toContain("sari@contoh.id");

    expect(await identity.requestKodeMasuk({ email: "sari@contoh.id", ip })).toMatchObject({ ok: true });
    const code = emailCodeTo(fake, "sari@contoh.id");
    expect(await identity.verifyKodeMasuk({ email: "sari@contoh.id", code })).toMatchObject({ ok: true });
  });
});

describe("Pemesan session", () => {
  it("lasts 90 days on the Clock, and the browser keeps the cookie as long", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, clock } = setup;
    const { login, cookies } = await logIn(setup, "sari@contoh.id");

    expect(login.session.expiresAt).toEqual(wib("2026-12-30 09:00"));
    expect(login.session.cookies).toContainEqual(
      expect.objectContaining({ name: "makam.session_token", maxAge: 90 * 86_400, httpOnly: true }),
    );
    clock.set(wib("2026-12-30 08:59"));
    expect(await identity.actorFromCookies(cookies)).toMatchObject({ accountId: login.account.id });
    clock.set(wib("2026-12-30 09:00"));
    expect(await identity.actorFromCookies(cookies)).toBeNull();
  });

  it("after Keluar the session no longer signs the Pemesan in", async () => {
    const setup = identityOnTestDatabase(db);
    const { cookies } = await logIn(setup, "sari@contoh.id");

    await setup.identity.endSession(cookies);

    expect(await setup.identity.actorFromCookies(cookies)).toBeNull();
  });

  it("a forged or missing session cookie signs no one in", async () => {
    const setup = identityOnTestDatabase(db);
    const { login } = await logIn(setup, "sari@contoh.id");
    const sessionCookie = login.session.cookies.find((cookie) => cookie.name === "makam.session_token");
    if (!sessionCookie) throw new Error("no session cookie was issued");
    const [token] = decodeURIComponent(sessionCookie.value).split(".");

    expect(await setup.identity.actorFromCookies(null)).toBeNull();
    expect(await setup.identity.actorFromCookies(`makam.session_token=${token}.forged`)).toBeNull();
  });
});

/** A code that is certainly not `code`. */
function otherCode(code: string): string {
  return code === "000000" ? "111111" : "000000";
}
