import { FakeClock, FakeEmailSender, FakeFileStore, FakeWhatsAppSender } from "@/adapters/memory";
import type { Database } from "@/db/client";
import { createAuditLog } from "@/domain/audit";
import { createIdentity, type Identity } from "@/domain/identity";
import { wib } from "@/lib/time/jakarta";
import type { EmailSender } from "@/ports/email-sender";
import type { FileStore } from "@/ports/file-store";
import { authenticatorCode } from "./totp";

export const TEST_AUTH_SECRET = "test-secret-for-identity-tests-0123456789abcdef";
/** 32 bytes, base64: the TOTP secret encryption key used in tests. */
export const TEST_TOTP_KEY = Buffer.alloc(32, 7).toString("base64");

/**
 * Runs the identity module's detached tasks (the email step's lookup and send)
 * at once without the caller waiting, like production; `settled()` waits for
 * every task started so far.
 */
export function detachedTasks() {
  const pending = new Set<Promise<void>>();
  return {
    run(task: () => Promise<void>) {
      const running = task().finally(() => pending.delete(running));
      pending.add(running);
    },
    async settled() {
      while (pending.size > 0) await Promise.all([...pending]);
    },
  };
}

/** The identity module on the test Postgres with the fake Clock and in-memory fakes. */
export function identityOnTestDatabase(
  db: Database,
  options: { files?: FileStore; email?: EmailSender; reportError?: (event: string, error: unknown) => void } = {},
) {
  const clock = new FakeClock(wib("2026-10-01 09:00"));
  const whatsapp = new FakeWhatsAppSender();
  const fakeEmail = new FakeEmailSender();
  const fakeFiles = new FakeFileStore({ clock });
  const files = options.files ?? fakeFiles;
  const audit = createAuditLog({ db, clock });
  const detached = detachedTasks();
  const identity = createIdentity({
    db,
    clock,
    whatsapp,
    email: options.email ?? fakeEmail,
    files,
    audit,
    secret: TEST_AUTH_SECRET,
    totpEncryptionKey: TEST_TOTP_KEY,
    baseURL: "http://localhost:3000",
    reportError: options.reportError ?? (() => {}),
    runDetached: (task) => detached.run(task),
  });
  return { clock, whatsapp, email: fakeEmail, files: fakeFiles, audit, identity, settled: () => detached.settled() };
}

/**
 * The first Admin Platform, seeded, logged in by OTP and past TOTP: the actor
 * a guarded staff Server Action would hand to the identity module.
 */
export async function signedInAdminPlatform(
  setup: ReturnType<typeof identityOnTestDatabase>,
  phoneNumber = "081111111111",
) {
  const { identity, whatsapp, clock } = setup;
  const seeded = await identity.seedFirstAdminPlatform({ phoneNumber, email: "admin@makam.co.id" });
  if (!seeded.ok) throw new Error(`seed refused: ${seeded.reason}`);
  const { cookies } = await logInByOtp(identity, whatsapp, phoneNumber);
  const enrolment = await identity.startTotpEnrolment(await actorOf(identity, cookies));
  if (!enrolment.ok) throw new Error(`enrolment refused: ${enrolment.reason}`);
  const passed = await identity.passTotp(await actorOf(identity, cookies), authenticatorCode(enrolment.secret, clock.now()));
  if (!passed.ok) throw new Error(`TOTP refused: ${passed.reason}`);
  const actor = await identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return { actor, cookies, totpSecret: enrolment.secret };
}

/** The last login OTP the fake WhatsAppSender "sent" to a number. */
export function lastOtpTo(whatsapp: FakeWhatsAppSender, phoneNumber: string): string {
  const code = whatsapp.sent
    .filter((message) => message.template === "kode_verifikasi" && message.to === phoneNumber)
    .at(-1)?.copyCode;
  if (!code) throw new Error(`no OTP was sent to ${phoneNumber}`);
  return code;
}

/** Logs a number in by WhatsApp OTP; returns the login and the Cookie header the browser would send. */
export async function logInByOtp(identity: Identity, whatsapp: FakeWhatsAppSender, phoneNumber: string) {
  const sent = await identity.requestOtp({ phoneNumber });
  if (!sent.ok) throw new Error(`OTP not sent: ${sent.reason}`);
  const login = await identity.verifyOtp({ phoneNumber, code: lastOtpTo(whatsapp, sent.phoneNumber) });
  if (!login.ok) throw new Error(`login failed: ${login.reason}`);
  return { login, cookies: login.session.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ") };
}

/** The signed-in actor behind a Cookie header, as `guarded()` would resolve it. */
export async function actorOf(identity: Identity, cookies: string) {
  const actor = await identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return actor;
}

/** The last 6-digit code the fake EmailSender "sent" to an address (any spelling), or undefined. */
export function lastEmailCodeTo(email: FakeEmailSender, to: string): string | undefined {
  const message = email.sent.filter((sent) => sent.to === to.trim().toLowerCase()).at(-1);
  return message?.text.match(/\b(\d{6})\b/)?.[1];
}

/** Logs in by email (Masuk dengan email) with the code the fake EmailSender "sent"; returns the login and its Cookie header. */
export async function logInByEmail(setup: ReturnType<typeof identityOnTestDatabase>, address: string, ip = "198.51.100.20") {
  const { identity, email } = setup;
  const before = email.sent.length;
  await identity.requestEmailLogin({ email: address, ip });
  await setup.settled();
  if (email.sent.length === before) throw new Error(`no Kode Masuk was emailed to ${address}`);
  const login = await identity.verifyEmailLogin({ email: address, code: emailCodeTo(email, address) });
  if (!login.ok) throw new Error(`email login failed: ${login.reason}`);
  return { login, cookies: login.session.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ") };
}

/** Like lastEmailCodeTo, but throws when no code was sent. */
export function emailCodeTo(email: FakeEmailSender, to: string): string {
  const code = lastEmailCodeTo(email, to);
  if (!code) throw new Error(`no code was emailed to ${to}`);
  return code;
}
