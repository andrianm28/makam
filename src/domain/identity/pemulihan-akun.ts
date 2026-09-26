import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { EmailSender } from "@/ports/email-sender";
import { documentExtension } from "@/lib/files/document-type";
import type { FileStore } from "@/ports/file-store";
import { stafResource, writeRefusal, type Actor } from "./authorize";
import type { Account } from "./akun-lookup";
import { verifiedEmailTakenAsRefusal } from "./email";
import { normaliseEmail } from "./email-address";
import { pemulihanAkunNoticeMessage } from "./email-templates";
import { identitySession, identityUser } from "./schema";

/**
 * What a KTP check may be: a photo or a scan. The declared type must match the
 * file's first bytes, so a renamed file of another kind is refused.
 */
const KTP_CHECK_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

/** The largest KTP check file accepted, 10 MB. */
export const KTP_CHECK_MAX_BYTES = 10 * 1024 * 1024;

export type RecoverAccountResult =
  | {
      ok: true;
      account: Account;
      ktpCheckFileKey: string;
      /** The notice to the Akun's old email: sent, refused by the EmailSender (reported), or no email on record. */
      notice: "terkirim" | "gagal" | "tanpa_email";
    }
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
        /** The email is on record on more than one Akun: pick the Akun by its id instead. */
        | "akun_ganda"
        /** The Akun is the acting Admin Platform's own. */
        | "akun_sendiri"
        /** The new email is already another Akun's Email Terverifikasi. */
        | "email_sudah_dipakai"
        /** The FileStore did not take the KTP check (e.g. no live S3 adapter yet): nothing moved. */
        | "berkas_gagal_disimpan";
    };

export interface RecoverAccountInput {
  /**
   * The Akun to recover: by its id (e.g. from the staff roster, which marks
   * an Akun Staf "Perlu Pemulihan Akun"; the only way to an Akun with no email
   * on record), or by its email on record: its Email Terverifikasi, or, for an
   * Akun from before ADR 0004, the email only typed in on it. An email on
   * record of more than one Akun is refused (`akun_ganda`).
   */
  akun: { accountId: string } | { email: string };
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
 * Entri Audit, in one transaction. Every session of the Akun ends, and its old
 * email (if any) gets a notice that the Akun was moved (without the new email).
 */
export async function recoverAccount(
  deps: {
    db: Database;
    clock: Clock;
    files: FileStore;
    audit: AuditLog;
    email: EmailSender;
    reportError: (event: string, error: unknown) => void;
  },
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

  const next = normaliseEmail(input.newEmail);
  if (!next) return { ok: false, reason: "email_tidak_valid" };

  const found = await akunToRecover(deps.db, input.akun);
  if (!found.ok) return found;
  const akun = found.akun;
  // Another Admin Platform must recover this Akun: no one moves their own Akun past the KTP check.
  if (akun.id === by.accountId) return { ok: false, reason: "akun_sendiri" };
  if (akun.verified && akun.email === next) return { ok: false, reason: "email_sama" };

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
        before: { email: akun.email, terverifikasi: akun.verified },
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

  return {
    ok: true,
    account: { id: akun.id, email: next, phoneNumber: akun.phoneNumber },
    ktpCheckFileKey,
    notice: await noticeToOldEmail(deps, akun.email, next),
  };
}

/**
 * Tells the old email that the Akun was moved, so a holder who did not ask
 * for it can reach CS. Carries no new email and no code. Sent directly
 * through EmailSender (the message log arrives with the Notifications
 * module); a refused send is reported without the address.
 */
async function noticeToOldEmail(
  deps: { email: EmailSender; reportError: (event: string, error: unknown) => void },
  oldEmail: string | null,
  newEmail: string,
): Promise<"terkirim" | "gagal" | "tanpa_email"> {
  if (!oldEmail || oldEmail === newEmail) return "tanpa_email";
  try {
    await deps.email.send({ to: oldEmail, ...pemulihanAkunNoticeMessage() });
    return "terkirim";
  } catch (error) {
    deps.reportError("pemberitahuan Pemulihan Akun tidak terkirim", error);
    return "gagal";
  }
}

type AkunToRecover = { id: string; email: string | null; phoneNumber: string | null; verified: boolean };

/** The Akun to recover, by its id or by an email on record of exactly one Akun. */
async function akunToRecover(
  db: Database,
  akun: RecoverAccountInput["akun"],
): Promise<{ ok: true; akun: AkunToRecover } | { ok: false; reason: "email_tidak_valid" | "akun_tidak_ditemukan" | "akun_ganda" }> {
  const columns = {
    id: identityUser.id,
    email: identityUser.contactEmail,
    phoneNumber: identityUser.phoneNumber,
    verifiedAt: identityUser.emailVerifiedAt,
  };
  let rows;
  if ("accountId" in akun) {
    rows = await db.select(columns).from(identityUser).where(eq(identityUser.id, akun.accountId));
  } else {
    const email = normaliseEmail(akun.email);
    if (!email) return { ok: false, reason: "email_tidak_valid" };
    rows = await db.select(columns).from(identityUser).where(eq(sql`lower(${identityUser.contactEmail})`, email)).limit(2);
  }
  if (rows.length === 0) return { ok: false, reason: "akun_tidak_ditemukan" };
  if (rows.length > 1) return { ok: false, reason: "akun_ganda" };
  const [row] = rows;
  return {
    ok: true,
    akun: { id: row.id, email: row.email?.toLowerCase() ?? null, phoneNumber: row.phoneNumber, verified: row.verifiedAt !== null },
  };
}

/** An Akun as the Pemulihan Akun screen shows it before the move. */
export interface AccountOnRecord {
  id: string;
  /** The email on record: its Email Terverifikasi, or one only typed in, or none. */
  email: string | null;
  emailTerverifikasi: boolean;
  phoneNumber: string | null;
}

/** The Akun with this id as its records hold it (for the Admin Platform's Pemulihan Akun screen), or null. */
export async function accountOnRecord(deps: { db: Database }, accountId: string): Promise<AccountOnRecord | null> {
  const found = await akunToRecover(deps.db, { accountId });
  if (!found.ok) return null;
  const { id, email, phoneNumber, verified } = found.akun;
  return { id, email, emailTerverifikasi: verified, phoneNumber };
}
