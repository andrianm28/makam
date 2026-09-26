import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog, RecordEntry } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { EmailSender } from "@/ports/email-sender";
import { akunResource, staffRoles, writeRefusal, type Actor, type WriteRefusal } from "./authorize";
import { verifikasiEmailMessage } from "./email-templates";
import { normaliseEmail } from "./email-address";
import { akunLockKey } from "./lock-key";
import type { Account } from "./login";
import { checkCode, claimIpRequest, issueCode, type CodeRejection, type LimitRefusal } from "./otp";
import { normalisePhoneNumber, type PhoneNumberRejection } from "./phone-number";
import { identityStaffRole, identityUser } from "./schema";

/*
 * The Akun's own email (Akun Saya, and the staff area for an Akun Staf). It is
 * added or changed only through Verifikasi Email, so the Akun's email is its
 * Email Terverifikasi unless an Undangan Staf or the seed set it (unverified).
 * A Pemesan may remove it; an Akun Staf may not (decision, 2026-09-25). For an
 * Akun Staf a verification is a staff write with an Entri Audit; a Pemesan's
 * records none.
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


export type RemoveEmailResult = { ok: true } | { ok: false; reason: "email_wajib" } | WriteRefusal;

/** Removes the Akun's email and its verified mark. An Akun Staf must keep one. */
export async function removeEmail(deps: EmailDeps, by: Actor): Promise<RemoveEmailResult> {
  const refusal = writeRefusal(by, "akun.email", akunResource(by.accountId));
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
  | WriteRefusal;

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
  const refusal = writeRefusal(by, "akun.email", akunResource(by.accountId));
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
  | WriteRefusal;

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
  const refusal = writeRefusal(by, "akun.email", akunResource(by.accountId));
  if (refusal) return refusal;
  const lockKey = akunLockKey(by.accountId);
  const checked = await checkCode(deps, { lookup: { purpose: "verifikasi_email", lockKey }, code: input.code });
  if (!checked.ok) return checked;
  const email = checked.target;

  try {
    await markVerified(deps, by, email);
    return { ok: true, email };
  } catch (error) {
    // The database's unique index is the one rule: another Akun has this Email Terverifikasi
    // (already, or it won a race), so this transaction rolled back and nothing changed.
    if (isVerifiedEmailTaken(error)) return { ok: false, reason: "email_sudah_dipakai" };
    throw error;
  }
}

/**
 * Makes `email` the Akun's Email Terverifikasi in one transaction. For an Akun
 * Staf it is a staff write: `audit.staffWrite` records `akun.email_verifikasi`
 * with the email before and after (never a code), under the first staff role
 * the Akun holds.
 */
async function markVerified(deps: EmailDeps, by: Actor, email: string): Promise<void> {
  const now = deps.clock.now();
  const write = async (tx: Database) => {
    const [row] = await tx
      .select({ email: identityUser.contactEmail, verifiedAt: identityUser.emailVerifiedAt })
      .from(identityUser)
      .where(eq(identityUser.id, by.accountId))
      .for("update");
    await tx
      .update(identityUser)
      .set({ contactEmail: email, emailVerifiedAt: now, updatedAt: now })
      .where(eq(identityUser.id, by.accountId));
    return { email: row?.email ?? null, terverifikasi: Boolean(row?.email && row.verifiedAt) };
  };

  const staffRole = staffRoles.find((role) => by.roles.includes(role));
  if (!staffRole) {
    await deps.db.transaction(write);
    return;
  }
  await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const before = await write(tx);
    await record({
      actor: { accountId: by.accountId, role: staffRole },
      action: "akun.email_verifikasi",
      entity: { kind: "akun", id: by.accountId },
      before,
      after: { email, terverifikasi: true },
      reason: null,
    });
    return { ok: true } as const;
  });
}

export type MarkEmailVerifiedByOpsResult =
  | { ok: true; account: Account; email: string }
  | PhoneNumberRejection
  | { ok: false; reason: "alasan_wajib" | "bukan_admin_platform" }
  | OpsEmailVerificationRefusal;

/**
 * Why the email on record cannot be marked: the Akun has none, it already is
 * the Akun's Email Terverifikasi, or another Akun already has it as its Email
 * Terverifikasi (the unique index decides, as in Verifikasi Email).
 */
export type OpsEmailVerificationRefusal = {
  ok: false;
  reason: "tanpa_email" | "sudah_terverifikasi" | "email_sudah_dipakai";
};

/**
 * Ops (`verify-email` CLI): marks the email on record of an existing Admin
 * Platform as its Email Terverifikasi, audited as `ops_cli` with the reason.
 * The bootstrap path before the live WhatsApp adapter: with it the Admin
 * Platform logs in by email, and still passes TOTP.
 */
export async function markEmailVerifiedByOps(
  deps: { db: Database; clock: Clock; audit: AuditLog },
  input: { phoneNumber: string; reason: string },
): Promise<MarkEmailVerifiedByOpsResult> {
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const { phoneNumber } = normalised;
  const reason = input.reason.trim();
  if (!reason) return { ok: false, reason: "alasan_wajib" };

  return verifiedEmailTakenAsRefusal(() =>
    deps.audit.staffWrite(deps.db, async (tx, record) => {
      const [user] = await tx
        .select({ id: identityUser.id })
        .from(identityUser)
        .where(eq(identityUser.phoneNumber, phoneNumber));
      const [adminPlatform] = user
        ? await tx
            .select({ accountId: identityStaffRole.accountId })
            .from(identityStaffRole)
            .where(and(eq(identityStaffRole.accountId, user.id), eq(identityStaffRole.role, "admin_platform")))
        : [];
      if (!user || !adminPlatform) {
        return { ok: false, reason: "bukan_admin_platform" } as const;
      }
      const marked = await recordOpsEmailVerification(tx, record, deps.clock, {
        accountId: user.id,
        actorRole: "ops_cli",
        reason,
      });
      if (!marked.ok) return marked;
      return { ok: true, account: { id: user.id, phoneNumber }, email: marked.email } as const;
    }),
  );
}

/**
 * Runs a staff write that may mark an Email Terverifikasi: when the database's
 * unique index refuses it (another Akun has that Email Terverifikasi, already
 * or by winning a race), the transaction has rolled back and this is the refusal.
 */
export async function verifiedEmailTakenAsRefusal<T>(
  write: () => Promise<T>,
): Promise<T | { ok: false; reason: "email_sudah_dipakai" }> {
  try {
    return await write();
  } catch (error) {
    if (isVerifiedEmailTaken(error)) return { ok: false, reason: "email_sudah_dipakai" };
    throw error;
  }
}

/**
 * Inside a staff write: makes the Akun's email on record its Email
 * Terverifikasi and records `akun.email_verifikasi` (before/after
 * `terverifikasi`, the reason; never a code). Used by `verify-email` (ops_cli)
 * and by `seed:admin --email-terverifikasi` (seed_cli).
 */
export async function recordOpsEmailVerification(
  tx: Database,
  record: RecordEntry,
  clock: Clock,
  input: { accountId: string; actorRole: "ops_cli" | "seed_cli"; reason: string },
): Promise<{ ok: true; email: string } | OpsEmailVerificationRefusal> {
  const [row] = await tx
    .select({ email: identityUser.contactEmail, verifiedAt: identityUser.emailVerifiedAt })
    .from(identityUser)
    .where(eq(identityUser.id, input.accountId))
    .for("update");
  const email = row?.email;
  if (!email) return { ok: false, reason: "tanpa_email" };
  if (row.verifiedAt) return { ok: false, reason: "sudah_terverifikasi" };
  const now = clock.now();
  await tx.update(identityUser).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(identityUser.id, input.accountId));
  await record({
    // No one is signed in: the entry names the Akun, acting as the CLI.
    actor: { accountId: input.accountId, role: input.actorRole },
    action: "akun.email_verifikasi",
    entity: { kind: "akun", id: input.accountId },
    before: { terverifikasi: false },
    after: { terverifikasi: true },
    reason: input.reason,
  });
  return { ok: true, email };
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
