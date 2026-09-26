import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createAuditLog } from "@/domain/audit";
import { FakeEmailSender, FakeFileStore } from "@/adapters/memory";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, emailCodeTo, identityOnTestDatabase, logIn, nextTestIp, TEST_AUTH_SECRET } from "../../../tests/support/identity";
import { authenticatorCode } from "../../../tests/support/totp";
import { createIdentity } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const ADMIN = "admin@makam.co.id";

async function adminPlatformAfterKodeMasuk() {
  const setup = identityOnTestDatabase(db);
  await setup.identity.seedFirstAdminPlatform({ email: ADMIN, phoneNumber: "081111111111" });
  const { login, cookies } = await logIn(setup, ADMIN);
  return { ...setup, login, cookies };
}

async function enrolled() {
  const setup = await adminPlatformAfterKodeMasuk();
  const enrolment = await setup.identity.startTotpEnrolment(await actorOf(setup.identity, setup.cookies));
  if (!enrolment.ok) throw new Error(`enrolment refused: ${enrolment.reason}`);
  const passed = await setup.identity.passTotp(await actorOf(setup.identity, setup.cookies), authenticatorCode(enrolment.secret, setup.clock.now()));
  if (!passed.ok) throw new Error(`TOTP refused: ${passed.reason}`);
  return { ...setup, secret: enrolment.secret };
}

describe("Admin Platform TOTP on top of the Kode Masuk", () => {
  it("an Admin Platform still passes TOTP after a Kode Masuk: with no authenticator it must enrol first", async () => {
    const { identity, cookies } = await adminPlatformAfterKodeMasuk();

    expect(await identity.actorFromCookies(cookies)).toMatchObject({ totp: "perlu_daftar" });
  });

  it("enrolment gives a secret for the authenticator; its current code passes TOTP for this session", async () => {
    const { identity, clock, cookies } = await adminPlatformAfterKodeMasuk();

    const enrolment = await identity.startTotpEnrolment(await actorOf(identity, cookies));
    expect(enrolment).toMatchObject({ ok: true, secret: expect.stringMatching(/^[A-Z2-7]{32}$/) });
    if (!enrolment.ok) throw new Error("unreachable");
    expect(enrolment.otpauthUri).toBe(
      `otpauth://totp/Makam.co.id:Admin%20Platform?secret=${enrolment.secret}&issuer=Makam.co.id&algorithm=SHA1&digits=6&period=30`,
    );
    // The authenticator app shows no phone number.
    expect(enrolment.otpauthUri).not.toMatch(/6281111111111/);

    expect(await identity.passTotp(await actorOf(identity, cookies), authenticatorCode(enrolment.secret, clock.now()))).toEqual({ ok: true });
    expect(await identity.actorFromCookies(cookies)).toMatchObject({ totp: "lolos", roles: ["pemesan", "admin_platform"] });
  });

  it("completing TOTP enrolment is audited on the Akun; the secret is not in the Entri Audit", async () => {
    const { identity, audit, login, secret } = await enrolled();

    const entries = await audit.entriesAbout({ kind: "akun", id: login.account.id });
    expect(entries.filter((entry) => entry.action === "akun.totp_daftar")).toEqual([
      expect.objectContaining({
        actor: { accountId: login.account.id, role: "admin_platform" },
        before: { terdaftar: false },
        after: { terdaftar: true },
      }),
    ]);
    expect(JSON.stringify(entries)).not.toContain(secret);
    void identity;
  });

  it("a wrong code does not pass TOTP", async () => {
    const { identity, clock, cookies } = await adminPlatformAfterKodeMasuk();
    const enrolment = await identity.startTotpEnrolment(await actorOf(identity, cookies));
    if (!enrolment.ok) throw new Error("enrolment refused");
    const right = authenticatorCode(enrolment.secret, clock.now());

    expect(await identity.passTotp(await actorOf(identity, cookies), right === "000000" ? "111111" : "000000")).toEqual({
      ok: false,
      reason: "kode_salah",
    });
    expect(await identity.actorFromCookies(cookies)).toMatchObject({ totp: "perlu_daftar" });
  });

  it("every new Kode Masuk login of an enrolled Admin Platform needs TOTP again", async () => {
    const setup = await enrolled();
    const { identity, clock, secret } = setup;
    clock.advance({ hours: 1 });

    const again = await logIn(setup, ADMIN);
    expect(await identity.actorFromCookies(again.cookies)).toMatchObject({ totp: "perlu_verifikasi" });

    expect(await identity.passTotp(await actorOf(identity, again.cookies), authenticatorCode(secret, clock.now()))).toEqual({ ok: true });
    expect(await identity.actorFromCookies(again.cookies)).toMatchObject({ totp: "lolos" });
  });

  it("an enrolled Admin Platform cannot enrol again (no self-service recovery)", async () => {
    const { identity, cookies } = await enrolled();

    expect(await identity.startTotpEnrolment(await actorOf(identity, cookies))).toEqual({ ok: false, reason: "totp_sudah_terdaftar" });
  });

  it("accepts the code of the 30 s step before or after the Clock's, not two steps away", async () => {
    const setup = await enrolled();
    const { identity, clock, secret } = setup;
    clock.advance({ hours: 1 });
    const now = clock.now();
    const at = (seconds: number) => new Date(now.getTime() + seconds * 1000);

    const first = await logIn(setup, ADMIN);
    expect(await identity.passTotp(await actorOf(identity, first.cookies), authenticatorCode(secret, at(-60)))).toMatchObject({ ok: false });
    expect(await identity.passTotp(await actorOf(identity, first.cookies), authenticatorCode(secret, at(60)))).toMatchObject({ ok: false });
    expect(await identity.passTotp(await actorOf(identity, first.cookies), authenticatorCode(secret, at(-30)))).toEqual({ ok: true });

    clock.advance({ minutes: 2 });
    const second = await logIn(setup, ADMIN);
    expect(await identity.passTotp(await actorOf(identity, second.cookies), authenticatorCode(secret, at(150)))).toEqual({ ok: true });
  });

  it("a TOTP code that was used once is refused the second time", async () => {
    const setup = await enrolled();
    const { identity, clock, secret } = setup;
    clock.advance({ hours: 1 });
    // The code of the next 30 s step: still inside the window one minute from now.
    const code = authenticatorCode(secret, new Date(clock.now().getTime() + 30_000));
    const first = await logIn(setup, ADMIN);
    expect(await identity.passTotp(await actorOf(identity, first.cookies), code)).toEqual({ ok: true });

    clock.advance({ minutes: 1 });
    const second = await logIn(setup, ADMIN);
    expect(await identity.passTotp(await actorOf(identity, second.cookies), code)).toEqual({ ok: false, reason: "kode_sudah_dipakai" });
  });

  it("5 wrong TOTP codes end the session: the Admin Platform must log in with a Kode Masuk again", async () => {
    const setup = await enrolled();
    const { identity, clock, secret } = setup;
    clock.advance({ hours: 1 });
    const { cookies } = await logIn(setup, ADMIN);
    const right = authenticatorCode(secret, clock.now());
    const wrong = right === "000000" ? "111111" : "000000";

    for (let attempt = 1; attempt <= 4; attempt++) {
      expect(await identity.passTotp(await actorOf(identity, cookies), wrong)).toEqual({ ok: false, reason: "kode_salah" });
    }
    expect(await identity.passTotp(await actorOf(identity, cookies), wrong)).toEqual({ ok: false, reason: "sesi_diakhiri" });
    expect(await identity.actorFromCookies(cookies)).toBeNull();
  });

  it("the TOTP secret is sealed with TOTP_ENCRYPTION_KEY: under another key it cannot be used", async () => {
    const { clock, secret } = await enrolled();
    const email = new FakeEmailSender();
    const otherKey = createIdentity({
      db,
      clock,
      email,
      files: new FakeFileStore({ clock }),
      audit: createAuditLog({ db, clock }),
      secret: TEST_AUTH_SECRET,
      totpEncryptionKey: Buffer.alloc(32, 1).toString("base64"),
      baseURL: "http://localhost:3000",
    });
    clock.advance({ hours: 1 });
    await otherKey.requestKodeMasuk({ email: ADMIN, ip: nextTestIp() });
    const login = await otherKey.verifyKodeMasuk({ email: ADMIN, code: emailCodeTo(email, ADMIN) });
    if (!login.ok) throw new Error(login.reason);
    const cookies = login.session.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");

    await expect(otherKey.passTotp(await actorOf(otherKey, cookies), authenticatorCode(secret, clock.now()))).rejects.toThrow();
  });
});

describe("Admin Platform session", () => {
  it("lasts 12 h on the Clock, then the Admin Platform is no longer signed in", async () => {
    const { identity, clock, cookies, login } = await enrolled();

    expect(login.session.expiresAt).toEqual(wib("2026-10-01 21:00"));
    clock.set(wib("2026-10-01 20:59"));
    expect(await identity.actorFromCookies(cookies)).not.toBeNull();
    clock.set(wib("2026-10-01 21:00"));
    expect(await identity.actorFromCookies(cookies)).toBeNull();
  });

  it("the session cookie is kept by the browser for the same 12 h", async () => {
    const { login } = await adminPlatformAfterKodeMasuk();
    const sessionCookie = login.session.cookies.find((cookie) => cookie.name === "makam.session_token");
    expect(sessionCookie?.maxAge).toBe(12 * 60 * 60);
  });
});
