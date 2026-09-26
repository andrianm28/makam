import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import { documentExtension } from "@/lib/files/document-type";
import type { FileStore } from "@/ports/file-store";
import { stafResource, writeRefusal, type Actor } from "./authorize";
import type { Account } from "./login";
import { normalisePhoneNumber, type PhoneNumberRejection } from "./phone-number";
import { identitySession, identityUser } from "./schema";
import { placeholderEmailFor } from "./staff";

/**
 * What a KTP check may be: a photo or a scan. The declared type must match the
 * file's first bytes, so a renamed file of another kind is refused.
 */
const KTP_CHECK_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

/** The largest KTP check file accepted, 10 MB. */
export const KTP_CHECK_MAX_BYTES = 10 * 1024 * 1024;

export type MoveAccountResult =
  | { ok: true; account: Account; ktpCheckFileKey: string }
  | PhoneNumberRejection
  | {
      ok: false;
      reason:
        | "tidak_berwenang"
        | "perlu_totp"
        | "ktp_belum_dicek"
        | "berkas_ktp_wajib"
        | "berkas_ktp_tidak_didukung"
        | "alasan_wajib"
        | "nomor_sama"
        | "akun_tidak_ditemukan"
        /** The Akun is the acting Admin Platform's own. */
        | "akun_sendiri"
        | "nomor_sudah_dipakai"
        /** The FileStore did not take the KTP check (e.g. no live S3 adapter yet): nothing moved. */
        | "berkas_gagal_disimpan";
    };

export interface MoveAccountInput {
  currentPhoneNumber: string;
  newPhoneNumber: string;
  /** The KTP photo or scan the Admin Platform checked against the order data. */
  ktpCheck: { body: Uint8Array; contentType: string };
  /** The Admin Platform confirms the KTP matches the Akun's records. */
  ktpChecked: boolean;
  reason: string;
}

/**
 * Pindah Nomor: Admin Platform moves an Akun to a new WhatsApp number after a
 * KTP check. The Akun keeps its id, so its orders, roles and Entri Audit stay
 * with it. The KTP check goes to the private FileStore first; only once it is
 * stored does the number change, with its Entri Audit, in one transaction.
 * Sessions on the old number end.
 */
export async function moveAccountToNewNumber(
  deps: { db: Database; clock: Clock; files: FileStore; audit: AuditLog },
  by: Actor,
  input: MoveAccountInput,
): Promise<MoveAccountResult> {
  const refusal = writeRefusal(by, "akun.pindah_nomor", stafResource());
  if (refusal) return refusal;
  if (!input.ktpChecked) return { ok: false, reason: "ktp_belum_dicek" };
  if (input.ktpCheck.body.byteLength === 0) return { ok: false, reason: "berkas_ktp_wajib" };
  const extension = documentExtension(input.ktpCheck, KTP_CHECK_TYPES);
  if (!extension || input.ktpCheck.body.byteLength > KTP_CHECK_MAX_BYTES) {
    return { ok: false, reason: "berkas_ktp_tidak_didukung" };
  }
  const reason = input.reason.trim();
  if (!reason) return { ok: false, reason: "alasan_wajib" };

  const current = normalisePhoneNumber(input.currentPhoneNumber);
  if (!current.ok) return current;
  const next = normalisePhoneNumber(input.newPhoneNumber);
  if (!next.ok) return next;
  if (current.phoneNumber === next.phoneNumber) return { ok: false, reason: "nomor_sama" };

  const account = await accountIdByNumber(deps.db, current.phoneNumber);
  if (!account) return { ok: false, reason: "akun_tidak_ditemukan" };
  // Another Admin Platform must move this Akun: no one moves their own number past the KTP check.
  if (account === by.accountId) return { ok: false, reason: "akun_sendiri" };
  if (await accountIdByNumber(deps.db, next.phoneNumber)) return { ok: false, reason: "nomor_sudah_dipakai" };

  const ktpCheckFileKey = `ktp-cek/${account}/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key: ktpCheckFileKey, body: input.ktpCheck.body, contentType: input.ktpCheck.contentType });
  } catch {
    return { ok: false, reason: "berkas_gagal_disimpan" };
  }

  const moved = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [taken] = await tx
      .select({ id: identityUser.id })
      .from(identityUser)
      .where(eq(identityUser.phoneNumber, next.phoneNumber))
      .for("update");
    if (taken) return { ok: false } as const;
    const now = deps.clock.now();
    await tx
      .update(identityUser)
      .set({ phoneNumber: next.phoneNumber, email: placeholderEmailFor(next.phoneNumber), updatedAt: now })
      .where(eq(identityUser.id, account));
    await tx.delete(identitySession).where(eq(identitySession.userId, account));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "akun.pindah_nomor",
      entity: { kind: "akun", id: account },
      before: { phoneNumber: current.phoneNumber },
      after: { phoneNumber: next.phoneNumber, ktpCheckFileKey },
      reason,
    });
    return { ok: true } as const;
  });
  if (!moved.ok) {
    await deps.files.delete(ktpCheckFileKey).catch(() => undefined);
    return { ok: false, reason: "nomor_sudah_dipakai" };
  }

  return { ok: true, account: { id: account, phoneNumber: next.phoneNumber }, ktpCheckFileKey };
}

async function accountIdByNumber(db: Database, phoneNumber: string): Promise<string | null> {
  const [row] = await db.select({ id: identityUser.id }).from(identityUser).where(eq(identityUser.phoneNumber, phoneNumber));
  return row?.id ?? null;
}
