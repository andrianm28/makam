import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import { documentExtension } from "@/lib/files/document-type";
import type { FileStore } from "@/ports/file-store";
import { stafResource, writeRefusal, type Actor } from "./authorize";
import type { Account } from "./akun-lookup";
import { verifiedEmailTakenAsRefusal } from "./email";
import { normaliseEmail } from "./email-address";
import { identitySession, identityUser } from "./schema";

/**
 * What a KTP check may be: a photo or a scan. The declared type must match the
 * file's first bytes, so a renamed file of another kind is refused.
 */
const KTP_CHECK_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

/** The largest KTP check file accepted, 10 MB. */
export const KTP_CHECK_MAX_BYTES = 10 * 1024 * 1024;

export type RecoverAccountResult =
  | { ok: true; account: Account; ktpCheckFileKey: string }
  | {
      ok: false;
      reason:
        | "tidak_berwenang"
        | "perlu_totp"
        | "ktp_belum_dicek"
        | "berkas_ktp_wajib"
        | "berkas_ktp_tidak_didukung"
        | "alasan_wajib"
        | "email_tidak_valid"
        | "email_sama"
        | "akun_tidak_ditemukan"
        /** The Akun is the acting Admin Platform's own. */
        | "akun_sendiri"
        /** The new email is already another Akun's Email Terverifikasi. */
        | "email_sudah_dipakai"
        /** The FileStore did not take the KTP check (e.g. no live S3 adapter yet): nothing moved. */
        | "berkas_gagal_disimpan";
    };

export interface RecoverAccountInput {
  /**
   * The email on record of the Akun to recover: its Email Terverifikasi, or,
   * for an Akun from before ADR 0004, the email only typed in on it.
   */
  currentEmail: string;
  /** The email the Akun moves to, as its Email Terverifikasi. */
  newEmail: string;
  /** The KTP photo or scan the Admin Platform checked against the Akun's records. */
  ktpCheck: { body: Uint8Array; contentType: string };
  /** The Admin Platform confirms the KTP matches the Akun's records. */
  ktpChecked: boolean;
  reason: string;
}

/**
 * Pemulihan Akun: Admin Platform moves an Akun to a new Email Terverifikasi
 * after a KTP check, for someone who lost access to their email (or an Akun
 * from before ADR 0004 that has none). The Akun keeps its id, so its orders,
 * roles and Entri Audit stay with it. The KTP check goes to the private
 * FileStore first; only once it is stored does the email change, with its
 * Entri Audit, in one transaction. Every session of the Akun ends.
 */
export async function recoverAccount(
  deps: { db: Database; clock: Clock; files: FileStore; audit: AuditLog },
  by: Actor,
  input: RecoverAccountInput,
): Promise<RecoverAccountResult> {
  const refusal = writeRefusal(by, "akun.pemulihan", stafResource());
  if (refusal) return refusal;
  if (!input.ktpChecked) return { ok: false, reason: "ktp_belum_dicek" };
  if (input.ktpCheck.body.byteLength === 0) return { ok: false, reason: "berkas_ktp_wajib" };
  const extension = documentExtension(input.ktpCheck, KTP_CHECK_TYPES);
  if (!extension || input.ktpCheck.body.byteLength > KTP_CHECK_MAX_BYTES) {
    return { ok: false, reason: "berkas_ktp_tidak_didukung" };
  }
  const reason = input.reason.trim();
  if (!reason) return { ok: false, reason: "alasan_wajib" };

  const current = normaliseEmail(input.currentEmail);
  const next = normaliseEmail(input.newEmail);
  if (!current || !next) return { ok: false, reason: "email_tidak_valid" };

  const akun = await akunOnRecord(deps.db, current);
  if (!akun) return { ok: false, reason: "akun_tidak_ditemukan" };
  // Another Admin Platform must recover this Akun: no one moves their own Akun past the KTP check.
  if (akun.id === by.accountId) return { ok: false, reason: "akun_sendiri" };
  if (akun.verified && current === next) return { ok: false, reason: "email_sama" };

  const ktpCheckFileKey = `ktp-cek/${akun.id}/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key: ktpCheckFileKey, body: input.ktpCheck.body, contentType: input.ktpCheck.contentType });
  } catch {
    return { ok: false, reason: "berkas_gagal_disimpan" };
  }

  // The verified-email index is the one rule for "another Akun's key": it refuses the write, which rolls back.
  const moved = await verifiedEmailTakenAsRefusal(() =>
    deps.audit.staffWrite(deps.db, async (tx, record) => {
      const now = deps.clock.now();
      await tx
        .update(identityUser)
        .set({ contactEmail: next, emailVerifiedAt: now, updatedAt: now })
        .where(eq(identityUser.id, akun.id));
      await tx.delete(identitySession).where(eq(identitySession.userId, akun.id));
      await record({
        actor: { accountId: by.accountId, role: "admin_platform" },
        action: "akun.pemulihan",
        entity: { kind: "akun", id: akun.id },
        before: { email: current, terverifikasi: akun.verified },
        after: { email: next, terverifikasi: true, ktpCheckFileKey },
        reason,
      });
      return { ok: true } as const;
    }),
  );
  if (!moved.ok) {
    await deps.files.delete(ktpCheckFileKey).catch(() => undefined);
    return moved;
  }

  return { ok: true, account: { id: akun.id, email: next, phoneNumber: akun.phoneNumber }, ktpCheckFileKey };
}

/**
 * The Akun whose email on record is `email`: the one with it as its Email
 * Terverifikasi, else the most recently updated Akun that only has it typed in.
 */
async function akunOnRecord(db: Database, email: string) {
  const [row] = await db
    .select({ id: identityUser.id, phoneNumber: identityUser.phoneNumber, verifiedAt: identityUser.emailVerifiedAt })
    .from(identityUser)
    .where(eq(sql`lower(${identityUser.contactEmail})`, email))
    .orderBy(sql`${identityUser.emailVerifiedAt} is null`, desc(identityUser.updatedAt))
    .limit(1);
  return row ? { id: row.id, phoneNumber: row.phoneNumber, verified: row.verifiedAt !== null } : null;
}
