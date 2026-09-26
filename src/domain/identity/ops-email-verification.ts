import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { Account } from "./akun-lookup";
import { normaliseEmail } from "./email-address";
import { markEmailOnRecordVerified, verifiedEmailTakenAsRefusal } from "./email";
import { identityStaffRole, identityUser } from "./schema";

export type MarkEmailVerifiedByOpsResult =
  | { ok: true; account: Account }
  | {
      ok: false;
      /**
       * `bukan_admin_platform`: no Admin Platform has this email on record
       * without it being verified (already an Email Terverifikasi, or no such
       * Admin Platform). `email_sudah_dipakai`: another Akun has it as its Email
       * Terverifikasi (the unique index decides, as in Verifikasi Email).
       */
      reason: "email_tidak_valid" | "alasan_wajib" | "bukan_admin_platform" | "email_sudah_dipakai";
    };

/**
 * Ops (`verify-email` CLI) only; never reachable from a route, Server Action or
 * page. The break-glass path for an Admin Platform from before ADR 0004 whose
 * email on record was never verified: with no Email Terverifikasi it cannot
 * log in, and a Pemulihan Akun needs another Admin Platform. Marks that email
 * as its Email Terverifikasi, audited as `ops_cli` with the reason; it then
 * logs in with a Kode Masuk to that email, and still passes TOTP.
 *
 * One transaction: the Akun's row is locked first, then its role is checked
 * and the email marked.
 */
export async function markEmailVerifiedByOps(
  deps: { db: Database; clock: Clock; audit: AuditLog },
  input: { email: string; reason: string },
): Promise<MarkEmailVerifiedByOpsResult> {
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "email_tidak_valid" };
  const reason = input.reason.trim();
  if (!reason) return { ok: false, reason: "alasan_wajib" };

  return verifiedEmailTakenAsRefusal(() =>
    deps.audit.staffWrite(deps.db, async (tx, record) => {
      const [user] = await tx
        .select({ id: identityUser.id, phoneNumber: identityUser.phoneNumber })
        .from(identityUser)
        .innerJoin(
          identityStaffRole,
          and(eq(identityStaffRole.accountId, identityUser.id), eq(identityStaffRole.role, "admin_platform")),
        )
        .where(and(eq(sql`lower(${identityUser.contactEmail})`, email), isNull(identityUser.emailVerifiedAt)))
        .limit(1)
        .for("update", { of: identityUser });
      if (!user) return { ok: false, reason: "bukan_admin_platform" } as const;
      await markEmailOnRecordVerified(tx, record, deps.clock, { accountId: user.id, email, reason });
      return { ok: true, account: { id: user.id, email, phoneNumber: user.phoneNumber } } as const;
    }),
  );
}
