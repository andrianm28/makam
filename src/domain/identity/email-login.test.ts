import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PortNotConfiguredError } from "@/adapters/live/not-configured";
import { FakeEmailSender, type FakeWhatsAppSender } from "@/adapters/memory";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  actorOf,
  emailCodeTo,
  identityOnTestDatabase,
  logInByOtp,
  signedInAdminPlatform,
} from "../../../tests/support/identity";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const IP = "203.0.113.7";
let ipCounter = 0;
/** A fresh IP (benchmarking range), so a helper's request never meets another's per-IP 60 s wait. */
function nextIp(): string {
  ipCounter += 1;
  return `198.18.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

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

describe("Verifikasi Email rules", () => {
  it("an email already verified on another Akun is refused (email_sudah_dipakai) and nothing changes", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email } = setup;
    await pemesanWithEmailTerverifikasi(setup, "081234567890", "sari@contoh.id");
    const { actor: otherActor } = await pemesanWithEmailTerverifikasi(setup, "082222222222", "budi@contoh.id");

    await identity.requestEmailVerification(otherActor, { email: "sari@contoh.id", ip: "198.51.100.30" });
    const refused = await identity.confirmEmailVerification(otherActor, { code: emailCodeTo(email, "sari@contoh.id") });

    expect(refused).toEqual({ ok: false, reason: "email_sudah_dipakai" });
    expect(await identity.accountEmail(otherActor)).toEqual({ email: "budi@contoh.id", verified: true });
    setup.clock.advance({ minutes: 1 });
    const { login } = await logInByEmail(setup, "sari@contoh.id");
    expect(login.account.phoneNumber).toBe("+6281234567890");
  });

  it("two Akun verifying the same email at once: one gets it, the other is refused (email_sudah_dipakai) by the database", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, email } = setup;
    const first = await actorOf(identity, (await logInByOtp(identity, whatsapp, "081234567890")).cookies);
    const second = await actorOf(identity, (await logInByOtp(identity, whatsapp, "082222222222")).cookies);
    await identity.requestEmailVerification(first, { email: "sari@contoh.id", ip: nextIp() });
    const firstCode = emailCodeTo(email, "sari@contoh.id");
    setup.clock.advance({ minutes: 1 });
    await identity.requestEmailVerification(second, { email: "SARI@contoh.id", ip: nextIp() });
    const secondCode = emailCodeTo(email, "sari@contoh.id");

    const results = await Promise.all([
      identity.confirmEmailVerification(first, { code: firstCode }),
      identity.confirmEmailVerification(second, { code: secondCode }),
    ]);

    expect(results).toContainEqual({ ok: true, email: "sari@contoh.id" });
    expect(results).toContainEqual({ ok: false, reason: "email_sudah_dipakai" });
    const emails = [await identity.accountEmail(first), await identity.accountEmail(second)];
    expect(emails.filter((shown) => shown.verified)).toEqual([{ email: "sari@contoh.id", verified: true }]);
  });

  it("a new login email is proven first (Q9): the old Email Terverifikasi works until the new code is entered", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email } = setup;
    const { actor } = await pemesanWithEmailTerverifikasi(setup, "081234567890", "lama@contoh.id");

    await identity.requestEmailVerification(actor, { email: "baru@contoh.id", ip: "198.51.100.50" });
    const newCode = emailCodeTo(email, "baru@contoh.id");
    expect(await identity.accountEmail(actor)).toEqual({ email: "lama@contoh.id", verified: true });
    await logInByEmail(setup, "lama@contoh.id");

    expect(await identity.confirmEmailVerification(actor, { code: newCode })).toEqual({ ok: true, email: "baru@contoh.id" });
    expect(await identity.accountEmail(actor)).toEqual({ email: "baru@contoh.id", verified: true });
    const sends = email.sent.length;
    setup.clock.advance({ minutes: 1 });
    await identity.requestEmailLogin({ email: "lama@contoh.id", ip: "198.51.100.51" });
    expect(email.sent).toHaveLength(sends);
  });

  it("a Pemesan may remove the email, which clears the mark; an Akun Staf keeps a required email", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp } = setup;
    const { actor } = await pemesanWithEmailTerverifikasi(setup);
    const { actor: admin } = await signedInAdminPlatform(setup);

    expect(await identity.removeEmail(actor)).toEqual({ ok: true });
    expect(await identity.accountEmail(actor)).toEqual({ email: null, verified: false });

    await identity.inviteStaff(admin, { phoneNumber: "082222222222", email: "staf@contoh.id", role: "petugas_lapangan" });
    const staff = await logInByOtp(identity, whatsapp, "082222222222");
    const staffActor = await actorOf(identity, staff.cookies);
    expect(await identity.removeEmail(staffActor)).toEqual({ ok: false, reason: "email_wajib" });
    expect(await identity.accountEmail(staffActor)).toEqual({ email: "staf@contoh.id", verified: false });
  });
});

describe("Verifikasi Email in the staff area", () => {
  it("is a staff write: it records an Entri Audit (akun.email_verifikasi) without the code; a Pemesan's records none", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, audit, email, clock } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    await identity.inviteStaff(admin, { phoneNumber: "082222222222", email: "staf@contoh.id", role: "admin_lokasi" });
    const staff = await logInByOtp(identity, whatsapp, "082222222222");
    const staffActor = await actorOf(identity, staff.cookies);
    await identity.requestEmailVerification(staffActor, { email: "staf@contoh.id", ip: IP });
    const code = emailCodeTo(email, "staf@contoh.id");
    const verifiedAt = clock.now();

    await identity.confirmEmailVerification(staffActor, { code });

    const entries = await audit.entriesAbout({ kind: "akun", id: staffActor.accountId });
    expect(entries.at(-1)).toEqual(
      expect.objectContaining({
        at: verifiedAt,
        actor: { accountId: staffActor.accountId, role: "admin_lokasi" },
        action: "akun.email_verifikasi",
        before: { email: "staf@contoh.id", terverifikasi: false },
        after: { email: "staf@contoh.id", terverifikasi: true },
      }),
    );
    expect(JSON.stringify(entries)).not.toContain(code);

    const { actor: pemesan } = await pemesanWithEmailTerverifikasi(setup, "083333333333", "pemesan@contoh.id");
    expect(await audit.entriesAbout({ kind: "akun", id: pemesan.accountId })).toEqual([]);
  });

  it("an Admin Platform must pass TOTP first, as for every other staff action", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, email } = setup;
    await identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });
    const { cookies } = await logInByOtp(identity, whatsapp, "081111111111");
    const beforeTotp = await actorOf(identity, cookies);

    expect(await identity.requestEmailVerification(beforeTotp, { email: "admin@makam.co.id", ip: IP })).toEqual({
      ok: false,
      reason: "perlu_totp",
    });
    expect(await identity.confirmEmailVerification(beforeTotp, { code: "123456" })).toEqual({
      ok: false,
      reason: "perlu_totp",
    });
    expect(await identity.removeEmail(beforeTotp)).toEqual({ ok: false, reason: "perlu_totp" });
    expect(email.sent).toEqual([]);
    expect(await identity.accountEmail(beforeTotp)).toEqual({ email: "admin@makam.co.id", verified: false });
  });

  it("an Akun Staf changes its email only through Verifikasi Email: the Entri Audit shows the old Email Terverifikasi before, the new one after", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, audit, email } = setup;
    const { actor: admin, cookies } = await signedInAdminPlatform(setup);
    await verifyEmailOf(setup, cookies, "admin@makam.co.id");

    await identity.requestEmailVerification(admin, { email: "ops@makam.co.id", ip: nextIp() });
    expect(await identity.accountEmail(admin)).toEqual({ email: "admin@makam.co.id", verified: true });
    await identity.confirmEmailVerification(admin, { code: emailCodeTo(email, "ops@makam.co.id") });

    expect(await identity.accountEmail(admin)).toEqual({ email: "ops@makam.co.id", verified: true });
    expect((await audit.entriesAbout({ kind: "akun", id: admin.accountId })).at(-1)).toEqual(
      expect.objectContaining({
        actor: { accountId: admin.accountId, role: "admin_platform" },
        action: "akun.email_verifikasi",
        before: { email: "admin@makam.co.id", terverifikasi: true },
        after: { email: "ops@makam.co.id", terverifikasi: true },
      }),
    );
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
  const sent = await identity.requestEmailVerification(actor, { email: address, ip: nextIp() });
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

  it("an unknown email and an Akun's unverified email get the identical reply, and no email is sent", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email, clock } = setup;
    // The seed stores the first Admin Platform's email unverified.
    await identity.seedFirstAdminPlatform({ phoneNumber: "081234567890", email: "Ketik@Contoh.id" });
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

/** Verifikasi Email for a signed-in actor, then 1 minute on so the next send to the address is allowed. */
async function verifyEmailOf(setup: ReturnType<typeof identityOnTestDatabase>, cookies: string, address: string) {
  const { identity, email, clock } = setup;
  const sent = await identity.requestEmailVerification(await actorOf(identity, cookies), { email: address, ip: nextIp() });
  if (!sent.ok) throw new Error(`Verifikasi Email not sent: ${sent.reason}`);
  const confirmed = await identity.confirmEmailVerification(await actorOf(identity, cookies), {
    code: emailCodeTo(email, address),
  });
  if (!confirmed.ok) throw new Error(`Verifikasi Email refused: ${confirmed.reason}`);
  clock.advance({ minutes: 1 });
}

async function logInByEmail(setup: ReturnType<typeof identityOnTestDatabase>, address: string, ip = "198.51.100.20") {
  const { identity, email } = setup;
  const before = email.sent.length;
  await identity.requestEmailLogin({ email: address, ip });
  if (email.sent.length === before) throw new Error(`no Kode Masuk was emailed to ${address}`);
  const login = await identity.verifyEmailLogin({ email: address, code: emailCodeTo(email, address) });
  if (!login.ok) throw new Error(`email login failed: ${login.reason}`);
  return { login, cookies: cookieHeader(login.session.cookies) };
}

describe("staff log in by email", () => {
  it.each(["admin_lokasi", "petugas_lapangan", "mitra_jasa"] as const)(
    "a %s with an Email Terverifikasi logs in by email with its roles and the 30-day staff session, no TOTP",
    async (role) => {
      const setup = identityOnTestDatabase(db);
      const { identity, whatsapp, clock } = setup;
      const { actor: admin } = await signedInAdminPlatform(setup);
      await identity.inviteStaff(admin, { phoneNumber: "082222222222", email: "staf@contoh.id", role });
      const byWhatsApp = await logInByOtp(identity, whatsapp, "082222222222");
      await verifyEmailOf(setup, byWhatsApp.cookies, "staf@contoh.id");
      const loggedInAt = clock.now();

      const { login, cookies } = await logInByEmail(setup, "staf@contoh.id");

      expect(login.roles).toEqual(["pemesan", role]);
      expect(login.session.expiresAt).toEqual(new Date(loggedInAt.getTime() + 30 * 86_400_000));
      expect(await identity.actorFromCookies(cookies)).toMatchObject({ roles: ["pemesan", role], totp: "tidak_perlu" });
    },
  );

  it("an Admin Platform who logs in by email must still pass TOTP, and the session lasts 12 hours", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, clock } = setup;
    const { cookies: whatsappSession } = await signedInAdminPlatform(setup);
    await verifyEmailOf(setup, whatsappSession, "admin@makam.co.id");
    const loggedInAt = clock.now();

    const { login, cookies } = await logInByEmail(setup, "admin@makam.co.id");

    expect(login.session.expiresAt).toEqual(new Date(loggedInAt.getTime() + 12 * 3_600_000));
    expect(await identity.actorFromCookies(cookies)).toMatchObject({
      roles: ["pemesan", "admin_platform"],
      totp: "perlu_verifikasi",
    });
  });

  it("open Undangan Staf for the Akun's number are accepted on an email login, audited, and the Akun's other sessions end", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, audit } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { account, cookies: otherDevice } = await pemesanWithEmailTerverifikasi(setup, "082222222222", "sari@contoh.id");
    await identity.inviteStaff(admin, { phoneNumber: "082222222222", email: "sari@contoh.id", role: "mitra_jasa" });

    const { login, cookies } = await logInByEmail(setup, "sari@contoh.id");

    expect(login.roles).toEqual(["pemesan", "mitra_jasa"]);
    expect(await identity.actorFromCookies(cookies)).toMatchObject({ roles: ["pemesan", "mitra_jasa"] });
    expect(await identity.actorFromCookies(otherDevice)).toBeNull();
    expect(await audit.entriesAbout({ kind: "akun", id: account.id })).toContainEqual(
      expect.objectContaining({
        action: "staf.peran_diberikan",
        actor: { accountId: account.id, role: "pemesan" },
        after: expect.objectContaining({ roles: ["mitra_jasa"] }),
      }),
    );
  });
});

describe("the email of an Undangan Staf", () => {
  it("is not an Email Terverifikasi until the staff member verifies it: no Kode Masuk goes to it before", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, email } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    await identity.inviteStaff(admin, { phoneNumber: "082222222222", email: "staf@contoh.id", role: "admin_lokasi" });
    const { cookies } = await logInByOtp(identity, whatsapp, "082222222222");

    expect(await identity.accountEmail(await actorOf(identity, cookies))).toEqual({ email: "staf@contoh.id", verified: false });
    await identity.requestEmailLogin({ email: "staf@contoh.id", ip: IP });
    expect(email.sent).toEqual([]);

    await verifyEmailOf(setup, cookies, "staf@contoh.id");
    expect(await identity.accountEmail(await actorOf(identity, cookies))).toEqual({ email: "staf@contoh.id", verified: true });
    await logInByEmail(setup, "staf@contoh.id");
  });

  it("never replaces an Email Terverifikasi the Akun already has", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity } = setup;
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { actor } = await pemesanWithEmailTerverifikasi(setup, "082222222222", "sari@contoh.id");
    await identity.inviteStaff(admin, { phoneNumber: "082222222222", email: "kerja@contoh.id", role: "mitra_jasa" });

    await logInByEmail(setup, "sari@contoh.id");

    expect(await identity.accountEmail(actor)).toEqual({ email: "sari@contoh.id", verified: true });
  });
});

describe('"Kirim lewat email" after a WhatsApp Kode Masuk', () => {
  it("is offered only when the number's existing Akun has an Email Terverifikasi", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, clock } = setup;
    await pemesanWithEmailTerverifikasi(setup, "081234567890", "sari@contoh.id");
    // An Akun whose email is not verified (the seed stores it unverified).
    await identity.seedFirstAdminPlatform({ phoneNumber: "082222222222", email: "ketik@contoh.id" });
    clock.advance({ minutes: 1 });

    expect(await identity.requestOtp({ phoneNumber: "081234567890" })).toMatchObject({ ok: true, emailFallback: true });
    expect(await identity.requestOtp({ phoneNumber: "082222222222" })).toMatchObject({ ok: true, emailFallback: false });
    expect(await identity.requestOtp({ phoneNumber: "083333333333" })).toMatchObject({ ok: true, emailFallback: false });
  });

  it("sends the email Kode Masuk from 60 s after the WhatsApp code, and entering it logs in like the WhatsApp code", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email, clock } = setup;
    const { account } = await pemesanWithEmailTerverifikasi(setup, "081234567890", "sari@contoh.id");
    const sent = await identity.requestOtp({ phoneNumber: "0812-3456-7890" });
    if (!sent.ok) throw new Error(sent.reason);

    clock.set(new Date(sent.fallbackAt.getTime() - 1_000));
    expect(await identity.requestEmailFallback({ phoneNumber: "081234567890", ip: IP })).toEqual({
      ok: false,
      reason: "tunggu_kirim_ulang",
      retryAt: sent.fallbackAt,
    });
    clock.set(sent.fallbackAt);
    expect(await identity.requestEmailFallback({ phoneNumber: "081234567890", ip: nextIp() })).toMatchObject({ ok: true });
    expect(email.sent.at(-1)).toMatchObject({ to: "sari@contoh.id", subject: expect.stringContaining("Kode Masuk") });

    const login = await identity.verifyOtp({
      phoneNumber: "081234567890",
      code: emailCodeTo(email, "sari@contoh.id"),
      channel: "email",
    });
    expect(login).toMatchObject({ ok: true, accountCreated: false, account });
  });

  it("is refused when no WhatsApp Kode Masuk went to the number in the last 10 minutes, and no email is sent", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email, clock } = setup;
    await pemesanWithEmailTerverifikasi(setup, "081234567890", "sari@contoh.id");
    // The WhatsApp login above sent a Kode Masuk; let it age past its 10 minutes.
    clock.advance({ minutes: 10 });
    const sends = email.sent.length;

    expect(await identity.requestEmailFallback({ phoneNumber: "081234567890", ip: nextIp() })).toEqual({
      ok: false,
      reason: "tanpa_kode_whatsapp",
    });
    const sent = await identity.requestOtp({ phoneNumber: "081234567890" });
    if (!sent.ok) throw new Error(sent.reason);
    clock.set(new Date(sent.sentAt.getTime() + 10 * 60_000));
    expect(await identity.requestEmailFallback({ phoneNumber: "081234567890", ip: nextIp() })).toEqual({
      ok: false,
      reason: "tanpa_kode_whatsapp",
    });
    expect(email.sent).toHaveLength(sends);

    clock.set(new Date(sent.sentAt.getTime() + 10 * 60_000 - 1_000));
    expect(await identity.requestEmailFallback({ phoneNumber: "081234567890", ip: nextIp() })).toMatchObject({ ok: true });
  });

  it("counts against the IP before anything is looked up, so a tanpa_email_terverifikasi answer uses up the IP's 60 s too", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity } = setup;
    await identity.requestOtp({ phoneNumber: "083333333333" });

    expect(await identity.requestEmailFallback({ phoneNumber: "083333333333", ip: IP })).toMatchObject({
      reason: "tanpa_email_terverifikasi",
    });
    expect(await identity.requestEmailFallback({ phoneNumber: "084444444444", ip: IP })).toMatchObject({
      ok: false,
      reason: "tunggu_kirim_ulang",
    });
    expect(await identity.requestEmailLogin({ email: "siapa@contoh.id", ip: IP })).toMatchObject({
      ok: false,
      reason: "tunggu_kirim_ulang",
    });
  });

  it("is refused for a number whose Akun has no Email Terverifikasi, or that has no Akun: the screen points to CS", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, email, clock } = setup;
    await identity.seedFirstAdminPlatform({ phoneNumber: "082222222222", email: "ketik@contoh.id" });
    await identity.requestOtp({ phoneNumber: "082222222222" });
    await identity.requestOtp({ phoneNumber: "083333333333" });
    clock.advance({ minutes: 1 });

    expect(await identity.requestEmailFallback({ phoneNumber: "082222222222", ip: IP })).toEqual({
      ok: false,
      reason: "tanpa_email_terverifikasi",
    });
    expect(await identity.requestEmailFallback({ phoneNumber: "083333333333", ip: "198.51.100.60" })).toEqual({
      ok: false,
      reason: "tanpa_email_terverifikasi",
    });
    expect(email.sent).toEqual([]);
    expect(await identity.verifyOtp({ phoneNumber: "083333333333", code: "123456", channel: "email" })).toEqual({
      ok: false,
      reason: "kode_salah",
    });
    expect(await identity.accountByPhoneNumber("083333333333")).toBeNull();
  });
});

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

  it("per email: a Verifikasi Email code does not hold back a Kode Masuk; the 60 s wait is per kind of code", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, email } = setup;
    const { cookies } = await logInByOtp(identity, whatsapp, "081234567890");
    const actor = await actorOf(identity, cookies);
    await identity.requestEmailVerification(actor, { email: "sari@contoh.id", ip: IP });
    await identity.confirmEmailVerification(actor, { code: emailCodeTo(email, "sari@contoh.id") });

    await identity.requestEmailLogin({ email: "sari@contoh.id", ip: "198.51.100.70" });

    expect(email.sent.at(-1)).toMatchObject({ to: "sari@contoh.id", subject: expect.stringContaining("Kode Masuk") });
    expect(await identity.requestEmailVerification(actor, { email: "sari@contoh.id", ip: IP })).toMatchObject({
      ok: false,
      reason: "tunggu_kirim_ulang",
    });
  });

  it("per IP: a Verifikasi Email request counts against the IP like the email step of Masuk", async () => {
    const setup = identityOnTestDatabase(db);
    const { identity, whatsapp, email } = setup;
    const { cookies } = await logInByOtp(identity, whatsapp, "081234567890");
    await identity.requestEmailLogin({ email: "siapa@contoh.id", ip: IP });

    expect(
      await identity.requestEmailVerification(await actorOf(identity, cookies), { email: "sari@contoh.id", ip: IP }),
    ).toMatchObject({ ok: false, reason: "tunggu_kirim_ulang" });
    expect(email.sent).toEqual([]);
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
