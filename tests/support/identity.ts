import { FakeClock, FakeFileStore, FakeWhatsAppSender } from "@/adapters/memory";
import type { Database } from "@/db/client";
import { createAuditLog } from "@/domain/audit";
import { createIdentity, type Identity } from "@/domain/identity";
import { wib } from "@/lib/time/jakarta";
import { authenticatorCode } from "./totp";

export const TEST_AUTH_SECRET = "test-secret-for-identity-tests-0123456789abcdef";
/** 32 bytes, base64: the TOTP secret encryption key used in tests. */
export const TEST_TOTP_KEY = Buffer.alloc(32, 7).toString("base64");

/** The identity module on the test Postgres with the fake Clock and in-memory fakes. */
export function identityOnTestDatabase(db: Database, start = wib("2026-10-01 09:00")) {
  const clock = new FakeClock(start);
  const whatsapp = new FakeWhatsAppSender();
  const files = new FakeFileStore({ clock });
  const audit = createAuditLog({ db, clock });
  const identity = createIdentity({
    db,
    clock,
    whatsapp,
    files,
    audit,
    secret: TEST_AUTH_SECRET,
    totpEncryptionKey: TEST_TOTP_KEY,
    baseURL: "http://localhost:3000",
  });
  return { clock, whatsapp, files, audit, identity };
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
  const enrolment = await identity.startTotpEnrolment(cookies);
  if (!enrolment.ok) throw new Error(`enrolment refused: ${enrolment.reason}`);
  const passed = await identity.passTotp(cookies, authenticatorCode(enrolment.secret, clock.now()));
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
