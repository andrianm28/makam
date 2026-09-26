import { randomBytes, randomUUID } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { FakeClock, FakeEmailSender, FakeFileStore } from "@/adapters/memory";
import type { Database } from "@/db/client";
import { createAuditLog } from "@/domain/audit";
import { createIdentity, type Identity, type StaffRole } from "@/domain/identity";
import { wib } from "@/lib/time/jakarta";
import type { EmailSender } from "@/ports/email-sender";
import type { FileStore } from "@/ports/file-store";
import { authenticatorCode } from "./totp";

export const TEST_AUTH_SECRET = "test-secret-for-identity-tests-0123456789abcdef";
/** 32 bytes, base64: the TOTP secret encryption key used in tests. */
export const TEST_TOTP_KEY = Buffer.alloc(32, 7).toString("base64");

let ipCounter = 0;
/** A fresh IP (benchmarking range), so one request never meets another's per-IP 60 s wait. */
export function nextTestIp(): string {
  ipCounter += 1;
  return `198.18.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

/** The identity module on the test Postgres with the fake Clock and in-memory fakes. */
export function identityOnTestDatabase(
  db: Database,
  options: { files?: FileStore; email?: EmailSender; reportError?: (event: string, error: unknown) => void } = {},
) {
  const clock = new FakeClock(wib("2026-10-01 09:00"));
  // A test that hands in its own FakeEmailSender reads the codes from it.
  const fakeEmail = options.email instanceof FakeEmailSender ? options.email : new FakeEmailSender();
  const fakeFiles = new FakeFileStore({ clock });
  const audit = createAuditLog({ db, clock });
  const identity = createIdentity({
    db,
    clock,
    email: options.email ?? fakeEmail,
    files: options.files ?? fakeFiles,
    audit,
    secret: TEST_AUTH_SECRET,
    totpEncryptionKey: TEST_TOTP_KEY,
    baseURL: "http://localhost:3000",
    reportError: options.reportError ?? (() => {}),
  });
  return { clock, email: fakeEmail, files: fakeFiles, audit, identity };
}

export type IdentitySetup = ReturnType<typeof identityOnTestDatabase>;

/**
 * Logs in by Kode Masuk (creating the Akun when the email has none), from a
 * fresh IP; with `phoneNumber`, also records it as the Akun's contact, as a
 * wizard's Data & kirim or Akun Saya would. Returns the login and the Cookie
 * header the browser would send.
 */
export async function logIn(setup: IdentitySetup, address: string, options: { phoneNumber?: string } = {}) {
  const { identity, email } = setup;
  const sent = await identity.requestKodeMasuk({ email: address, ip: nextTestIp() });
  if (!sent.ok) throw new Error(`Kode Masuk not sent: ${sent.reason}`);
  const login = await identity.verifyKodeMasuk({ email: address, code: emailCodeTo(email, address) });
  if (!login.ok) throw new Error(`login failed: ${login.reason}`);
  const cookies = cookieHeader(login.session.cookies);
  if (options.phoneNumber) {
    const saved = await identity.updatePhoneNumber(await actorOf(identity, cookies), { phoneNumber: options.phoneNumber });
    if (!saved.ok) throw new Error(`phone number refused: ${saved.reason}`);
  }
  return { login, cookies };
}

/**
 * The first Admin Platform, seeded, logged in by Kode Masuk and past TOTP: the
 * actor a guarded staff Server Action would hand to the identity module.
 */
export async function signedInAdminPlatform(setup: IdentitySetup, email = "admin@makam.co.id") {
  const { identity, clock } = setup;
  const seeded = await identity.seedFirstAdminPlatform({ email, phoneNumber: "081111111111" });
  if (!seeded.ok) throw new Error(`seed refused: ${seeded.reason}`);
  const { cookies } = await logIn(setup, email);
  const enrolment = await identity.startTotpEnrolment(await actorOf(identity, cookies));
  if (!enrolment.ok) throw new Error(`enrolment refused: ${enrolment.reason}`);
  const passed = await identity.passTotp(await actorOf(identity, cookies), authenticatorCode(enrolment.secret, clock.now()));
  if (!passed.ok) throw new Error(`TOTP refused: ${passed.reason}`);
  const actor = await identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return { actor, cookies, totpSecret: enrolment.secret };
}

/**
 * An Akun as ADR 0003 left it (keyed by a WhatsApp number, with an email only
 * typed in, and a live session): a state no public function can make any more,
 * so it is written directly, as the database held it before migration 0010.
 * Returns its id and the Cookie header of its old session.
 */
export async function akunFromBeforeEmailKey(
  db: Database,
  input: { email: string; phoneNumber: string; roles?: StaffRole[] },
) {
  const accountId = randomUUID();
  const token = randomBytes(16).toString("hex");
  const at = wib("2026-09-20 09:00");
  await db.execute(sql`
    insert into identity_user (id, name, placeholder_email, placeholder_email_verified, phone_number, phone_number_verified, email, created_at, updated_at)
    values (${accountId}, '', ${`${input.phoneNumber.slice(1)}@wa.makam.invalid`}, false, ${input.phoneNumber}, true, ${input.email}, ${at}, ${at})`);
  await db.execute(sql`
    insert into identity_session (id, token, user_id, expires_at, created_at, updated_at)
    values (${randomUUID()}, ${token}, ${accountId}, ${wib("2026-12-20 09:00")}, ${at}, ${at})`);
  for (const role of input.roles ?? []) {
    await db.execute(sql`insert into identity_staff_role (account_id, role, granted_at) values (${accountId}, ${role}, ${at})`);
  }
  const signature = await makeSignature(token, TEST_AUTH_SECRET);
  return { accountId, cookies: `makam.session_token=${encodeURIComponent(`${token}.${signature}`)}` };
}

/** The signed-in actor behind a Cookie header, as `guarded()` would resolve it. */
export async function actorOf(identity: Identity, cookies: string) {
  const actor = await identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return actor;
}

/** What the browser sends back after storing the session cookies. */
export function cookieHeader(cookies: { name: string; value: string }[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

/** The last 6-digit code the fake EmailSender "sent" to an address (any spelling), or undefined. */
export function lastEmailCodeTo(email: FakeEmailSender, to: string): string | undefined {
  const message = email.sent.filter((sent) => sent.to === to.trim().toLowerCase()).at(-1);
  return message?.text.match(/\b(\d{6})\b/)?.[1];
}

/** Like lastEmailCodeTo, but throws when no code was sent. */
export function emailCodeTo(email: FakeEmailSender, to: string): string {
  const code = lastEmailCodeTo(email, to);
  if (!code) throw new Error(`no code was emailed to ${to}`);
  return code;
}
