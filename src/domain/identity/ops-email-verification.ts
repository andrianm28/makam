import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import { markEmailOnRecordVerified, verifiedEmailTakenAsRefusal } from "./email";
import type { Account } from "./login";
import { normalisePhoneNumber, type PhoneNumberRejection } from "./phone-number";
import { identityUser } from "./schema";
import { rolesOf } from "./staff";

export type MarkEmailVerifiedByOpsResult =
  | { ok: true; account: Account; email: string }
  | PhoneNumberRejection
  | {
      ok: false;
      /**
       * `sudah_terverifikasi`: the email on record already is its Email Terverifikasi.
       * `email_sudah_dipakai`: another Akun has it as its Email Terverifikasi (the
       * unique index decides, as in Verifikasi Email).
       */
      reason: "alasan_wajib" | "bukan_admin_platform" | "sudah_terverifikasi" | "email_sudah_dipakai";
    };

/**
 * Ops (`verify-email` CLI) only; never reachable from a route, Server Action or
 * page. Marks the email on record of an existing Admin Platform as its Email
 * Terverifikasi, audited as `ops_cli` with the reason. The bootstrap path
 * before the live WhatsApp adapter: with it the Admin Platform logs in by
 * email, and still passes TOTP.
 *
 * One transaction: the Akun's row is locked first, then its roles are checked
 * and the email marked, so a role or email change cannot slip in between.
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
        .select({ id: identityUser.id, email: identityUser.contactEmail, verifiedAt: identityUser.emailVerifiedAt })
        .from(identityUser)
        .where(eq(identityUser.phoneNumber, phoneNumber))
        .for("update");
      if (!user || !(await rolesOf(tx, user.id)).includes("admin_platform")) {
        return { ok: false, reason: "bukan_admin_platform" } as const;
      }
      // Defensive: every path that makes an Admin Platform (the seed, Undangan Staf)
      // requires an email, and an Akun Staf cannot remove it.
      if (!user.email) throw new Error("Admin Platform has no email on record");
      if (user.verifiedAt) return { ok: false, reason: "sudah_terverifikasi" } as const;
      await markEmailOnRecordVerified(tx, record, deps.clock, { accountId: user.id, actorRole: "ops_cli", reason });
      return { ok: true, account: { id: user.id, phoneNumber }, email: user.email } as const;
    }),
  );
}
