import { and, eq, isNotNull, ne } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditAction, AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { EmailSender } from "@/ports/email-sender";
import { ownAkunRefusal, staffRoles, type Actor } from "./authorize";
import { verifikasiEmailMessage } from "./email-templates";
import { akunLockKey, checkCode, claimIpRequest, issueCode, type CodeRejection, type LimitRefusal } from "./otp";
import { identityUser } from "./schema";
import { normaliseEmail } from "./staff";

/*
 * The Akun's own email: the profile field (Akun Saya, and the staff area for
 * an Akun Staf) and Verifikasi Email. For an Akun Staf every change is a staff
 * write with an Entri Audit; a Pemesan's records none.
 */

export interface EmailDeps {
  db: Database;
  clock: Clock;
  email: EmailSender;
  audit: AuditLog;
  secret: string;
}

/** The Akun's email as Akun Saya and the staff area show it. */
export interface AccountEmail {
  email: string | null;
  /** True when `email` is the Akun's Email Terverifikasi. */
  verified: boolean;
}

export async function accountEmail(deps: { db: Database }, by: Actor): Promise<AccountEmail> {
  const [row] = await deps.db
    .select({ email: identityUser.contactEmail, verifiedAt: identityUser.emailVerifiedAt })
    .from(identityUser)
    .where(eq(identityUser.id, by.accountId));
  return { email: row?.email ?? null, verified: Boolean(row?.email && row.verifiedAt) };
}

/** Refused before TOTP (an Admin Platform), or for anyone but the Akun itself. */
type OwnAkunRefusal = { ok: false; reason: "tidak_berwenang" | "perlu_totp" };

export type SaveEmailResult = { ok: true; email: string } | { ok: false; reason: "email_tidak_valid" } | OwnAkunRefusal;

/**
 * The profile's email field: stores the typed email on the Akun, unverified.
 * A different email clears the verified mark; the same email keeps it.
 */
export async function saveEmail(deps: EmailDeps, by: Actor, input: { email: string }): Promise<SaveEmailResult> {
  const refusal = ownAkunRefusal(by, "akun.email");
  if (refusal) return refusal;
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "email_tidak_valid" };
  const now = deps.clock.now();
  await writeAkunEmail<never>(deps, by, "akun.email_ubah", async (tx, before) => {
    const terverifikasi = before.email === email && before.terverifikasi;
    await tx
      .update(identityUser)
      .set({ contactEmail: email, emailVerifiedAt: terverifikasi ? undefined : null, updatedAt: now })
      .where(eq(identityUser.id, by.accountId));
    return { ok: true, after: { email, terverifikasi } } as const;
  });
  return { ok: true, email };
}

export type RemoveEmailResult = { ok: true } | { ok: false; reason: "email_wajib" } | OwnAkunRefusal;

/** Removes the Akun's email and its verified mark. An Akun Staf must keep one. */
export async function removeEmail(deps: EmailDeps, by: Actor): Promise<RemoveEmailResult> {
  const refusal = ownAkunRefusal(by, "akun.email");
  if (refusal) return refusal;
  if (by.roles.some((role) => role !== "pemesan")) return { ok: false, reason: "email_wajib" };
  const now = deps.clock.now();
  await deps.db
    .update(identityUser)
    .set({ contactEmail: null, emailVerifiedAt: null, updatedAt: now })
    .where(eq(identityUser.id, by.accountId));
  return { ok: true };
}

export type RequestEmailVerificationResult =
  | { ok: true; email: string; sentAt: Date; expiresAt: Date; resendAt: Date }
  | { ok: false; reason: "email_tidak_valid" | "gagal_kirim" }
  | LimitRefusal
  | OwnAkunRefusal;

/**
 * Verifikasi Email, step 1: sends a code to the email typed (the Akun's own, or
 * a new one). Nothing on the Akun changes until the code is entered, so an
 * Email Terverifikasi stays in use until its replacement is proven (decision Q9).
 */
export async function requestEmailVerification(
  deps: EmailDeps,
  by: Actor,
  input: { email: string; ip: string },
): Promise<RequestEmailVerificationResult> {
  const refusal = ownAkunRefusal(by, "akun.email");
  if (refusal) return refusal;
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "email_tidak_valid" };
  const ip = await claimIpRequest(deps, input.ip);
  if (!ip.ok) return ip;

  const issued = await issueCode(
    deps,
    { channel: "email", target: email, purpose: "verifikasi_email", lockKey: akunLockKey(by.accountId) },
    (code) => deps.email.send({ to: email, ...verifikasiEmailMessage(code) }),
  );
  if (!issued.ok) return issued.reason === "gagal_kirim" ? { ok: false, reason: "gagal_kirim" } : issued;
  return { ok: true, email, sentAt: issued.sentAt, expiresAt: issued.expiresAt, resendAt: issued.resendAt };
}

export type ConfirmEmailVerificationResult =
  | { ok: true; email: string }
  | CodeRejection
  /** Another Akun already has this Email Terverifikasi; Admin Platform resolves it through CS. */
  | { ok: false; reason: "email_sudah_dipakai" }
  | OwnAkunRefusal;

/**
 * Verifikasi Email, step 2: the code sent in step 1 makes its email the Akun's
 * Email Terverifikasi (replacing any earlier email). Refused, with nothing
 * changed, when another Akun already has that Email Terverifikasi.
 */
export async function confirmEmailVerification(
  deps: EmailDeps,
  by: Actor,
  input: { code: string },
): Promise<ConfirmEmailVerificationResult> {
  const refusal = ownAkunRefusal(by, "akun.email");
  if (refusal) return refusal;
  const lockKey = akunLockKey(by.accountId);
  const checked = await checkCode(deps, { lookup: { purpose: "verifikasi_email", lockKey }, lockKey, code: input.code });
  if (!checked.ok) return checked;
  const email = checked.target;
  const now = deps.clock.now();

  try {
    const written = await writeAkunEmail<{ ok: false; reason: "email_sudah_dipakai" }>(deps, by, "akun.email_verifikasi", async (tx) => {
      if (await verifiedOnAnotherAkun(tx, email, by.accountId)) return { ok: false, reason: "email_sudah_dipakai" } as const;
      await tx
        .update(identityUser)
        .set({ contactEmail: email, emailVerifiedAt: now, updatedAt: now })
        .where(eq(identityUser.id, by.accountId));
      return { ok: true, after: { email, terverifikasi: true } } as const;
    });
    return written.ok ? { ok: true, email } : written;
  } catch (error) {
    // Another Akun verified it in the meantime: the database's unique index refused this one.
    if (isVerifiedEmailTaken(error)) return { ok: false, reason: "email_sudah_dipakai" };
    throw error;
  }
}

type EmailSnapshot = { email: string | null; terverifikasi: boolean };

/**
 * One change to the Akun's email in a transaction. For an Akun Staf it is a
 * staff write: `audit.staffWrite` records `action` with the email before and
 * after (never a code), under the first staff role the Akun holds.
 */
async function writeAkunEmail<R extends { ok: false; reason: string }>(
  deps: EmailDeps,
  by: Actor,
  action: Extract<AuditAction, "akun.email_verifikasi" | "akun.email_ubah">,
  change: (tx: Database, before: EmailSnapshot) => Promise<{ ok: true; after: EmailSnapshot } | R>,
): Promise<{ ok: true } | R> {
  const run = async (tx: Database) => {
    const [row] = await tx
      .select({ email: identityUser.contactEmail, verifiedAt: identityUser.emailVerifiedAt })
      .from(identityUser)
      .where(eq(identityUser.id, by.accountId))
      .for("update");
    const before = { email: row?.email ?? null, terverifikasi: Boolean(row?.email && row.verifiedAt) };
    return { before, changed: await change(tx, before) };
  };

  const staffRole = staffRoles.find((role) => by.roles.includes(role));
  if (!staffRole) {
    const { changed } = await deps.db.transaction(run);
    return changed.ok ? { ok: true } : changed;
  }
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const { before, changed } = await run(tx);
    if (!changed.ok) return changed;
    await record({
      actor: { accountId: by.accountId, role: staffRole },
      action,
      entity: { kind: "akun", id: by.accountId },
      before,
      after: changed.after,
      reason: null,
    });
    return { ok: true } as const;
  });
}

async function verifiedOnAnotherAkun(db: Database, email: string, accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: identityUser.id })
    .from(identityUser)
    .where(and(eq(identityUser.contactEmail, email), isNotNull(identityUser.emailVerifiedAt), ne(identityUser.id, accountId)));
  return Boolean(row);
}

/** True for the unique violation of identity_user_verified_email_idx (a verified email belongs to one Akun). */
function isVerifiedEmailTaken(error: unknown): boolean {
  let current: unknown = error;
  while (typeof current === "object" && current !== null) {
    const { code, constraint, cause } = current as { code?: string; constraint?: string; cause?: unknown };
    if (code === "23505" && constraint === "identity_user_verified_email_idx") return true;
    current = cause;
  }
  return false;
}
