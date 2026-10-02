import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { EmailSender } from "@/ports/email-sender";
import type { Role } from "./authorize";
import type { MakamAuth } from "./better-auth";
import { akunOfVerifiedEmail, placeholderEmailFor, type Account } from "./akun-lookup";
import { kodeMasukEmailMessage } from "./email-templates";
import { normaliseEmail } from "./email-address";
import { acceptOpenInvites } from "./invites";
import { emailLockKey } from "./lock-key";
import { checkCode, sendEmailCode, type CodeRejection, type LimitRefusal } from "./otp";
import { identityUser } from "./schema";
import { startSession, type SessionCookie } from "./sessions";
import { rolesOf } from "./staff";

export interface KodeMasukDeps {
  auth: MakamAuth;
  db: Database;
  clock: Clock;
  audit: AuditLog;
  secret: string;
  email: EmailSender;
  /** Reports a Kode Masuk that could not be sent; gets no address and no code. */
  reportError: (event: string, error: unknown) => void;
}

/** The reply to a request for a Kode Masuk: the same for every email, known or not. */
export type RequestKodeMasukResult =
  | { ok: true; email: string; sentAt: Date; expiresAt: Date; resendAt: Date }
  | { ok: false; reason: "email_tidak_valid" | "gagal_kirim" }
  | LimitRefusal;

/**
 * Sends a Kode Masuk to an email (Masuk, and Kirim in the wizards), whether or
 * not an Akun has it as its Email Terverifikasi: nothing is looked up, so the
 * reply says nothing about the email. Sent directly through EmailSender (no
 * message log, no retry); a failed send is "gagal kirim" and counts against no
 * limit, per email or per IP.
 */
export async function requestKodeMasuk(
  deps: KodeMasukDeps,
  input: { email: string; ip: string },
): Promise<RequestKodeMasukResult> {
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "email_tidak_valid" };
  const sent = await sendEmailCode(deps, {
    ip: input.ip,
    request: { target: email, purpose: "masuk", lockKey: emailLockKey(email) },
    deliver: (code) => deps.email.send({ to: email, ...kodeMasukEmailMessage(code) }),
    failureEvent: "Kode Masuk tidak terkirim",
  });
  if (!sent.ok) return sent;
  return { ok: true, email, sentAt: sent.sentAt, expiresAt: sent.expiresAt, resendAt: sent.resendAt };
}

export type VerifyKodeMasukResult =
  | {
      ok: true;
      account: Account;
      /** True when this Kode Masuk created the Akun (the email was no Akun's Email Terverifikasi yet). */
      accountCreated: boolean;
      /** Every role the Akun holds after this login (open Undangan Staf accepted). */
      roles: Role[];
      session: { expiresAt: Date; cookies: SessionCookie[] };
    }
  | CodeRejection;

/**
 * A correct Kode Masuk logs into the Akun whose Email Terverifikasi it was
 * sent to, or creates that Akun when there is none: entering the code proves
 * the email. Open Undangan Staf to the email are accepted, and the session
 * gets the strictest length of the roles now held.
 *
 * A wizard's Kirim passes the name it asked for (`name`); it fills the Akun's
 * name when it has none, and never replaces one an Akun Saya profile already
 * holds. Masuk knows no name and passes none.
 */
export async function verifyKodeMasuk(
  deps: KodeMasukDeps,
  input: { email: string; code: string; name?: string },
): Promise<VerifyKodeMasukResult> {
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "kode_salah" };
  const checked = await checkCode(deps, {
    lookup: { purpose: "masuk", target: email, lockKey: emailLockKey(email) },
    code: input.code,
  });
  if (!checked.ok) return checked;

  const existing = await akunOfVerifiedEmail(deps.db, email);
  const account = existing ?? (await createAkun(deps, email));
  await nameAkun(deps, account.id, input.name);

  // Invites first, so the new session gets the length of the strictest role the Akun now holds.
  await acceptOpenInvites(deps, account);
  const roles = await rolesOf(deps.db, account.id);
  const { expiresAt, cookies } = await startSession(deps, account.id);

  return { ok: true, account, accountCreated: !existing, roles, session: { expiresAt, cookies } };
}

/**
 * The name a wizard learned for the Akun, kept when the Akun has none: the
 * first name a person gives is theirs, and a later checkout never overwrites
 * it. What the Kontak Siaga's card says about a family member is then there.
 */
async function nameAkun(deps: { db: Database; clock: Clock }, accountId: string, typed: string | undefined) {
  const name = typed?.trim() ?? "";
  if (name === "") return;
  const [row] = await deps.db
    .select({ name: identityUser.name })
    .from(identityUser)
    .where(eq(identityUser.id, accountId));
  if (!row || row.name !== "") return;
  await deps.db.update(identityUser).set({ name, updatedAt: deps.clock.now() }).where(eq(identityUser.id, accountId));
}

/**
 * Dev seed only: fills an Akun's name when it still has none, the same rule a
 * wizard's Kirim applies through `verifyKodeMasuk`, but without a Kode Masuk.
 * A seed's second run over a fixture Akun must reproduce the mock's Kontak
 * Siaga name without asking for another code inside the 60 s resend window.
 * Never call this from app code (AGENTS.md's dev-seed exception).
 */
export async function nameAkunForSeed(
  deps: { db: Database; clock: Clock },
  input: { email: string; name: string },
): Promise<{ ok: true } | { ok: false; reason: "akun_tidak_ada" }> {
  const email = normaliseEmail(input.email);
  const akun = email ? await akunOfVerifiedEmail(deps.db, email) : null;
  if (!akun) return { ok: false, reason: "akun_tidak_ada" };
  await nameAkun(deps, akun.id, input.name);
  return { ok: true };
}

/** Creates the Akun of a just-proven email; when another login created it first, that Akun. */
async function createAkun(deps: KodeMasukDeps, email: string): Promise<Account> {
  const id = randomUUID();
  const now = deps.clock.now();
  await deps.db
    .insert(identityUser)
    .values({
      id,
      name: "",
      email: placeholderEmailFor(id),
      emailVerified: false,
      contactEmail: email,
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    // Two first logins at once: the verified-email index lets one Akun through.
    .onConflictDoNothing();
  const akun = await akunOfVerifiedEmail(deps.db, email);
  if (!akun) throw new Error("The Akun of a proven email was neither created nor found");
  return akun;
}


