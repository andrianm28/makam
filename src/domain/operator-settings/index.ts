import { desc, lte, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { authorize, normalisePhoneNumber, pengaturanOperatorResource, type Actor } from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { operatorSettingsVersion } from "./schema";

export interface OperatorSettingsValues {
  legalName: string;
  address: string;
  phone: string;
  email: string;
  csWhatsApp: string;
  csReplyHours: string;
  inForceFrom: Date;
}

export interface ChangeOperatorSettingsInput {
  legalName: string;
  address: string;
  phone: string;
  email: string;
  csWhatsApp: string;
  csReplyHours: string;
  reason: string | null;
}

export type ChangeOperatorSettingsResult = { ok: true; settings: OperatorSettingsValues } | { ok: false; reason: string };

export interface OperatorSettings {
  current(): Promise<OperatorSettingsValues | null>;
  inForceAt(instant: Date): Promise<OperatorSettingsValues | null>;
  change(by: Actor, input: ChangeOperatorSettingsInput): Promise<ChangeOperatorSettingsResult>;
}

export function createOperatorSettings(deps: { db: Database; clock: Clock; audit: AuditLog }): OperatorSettings {
  return {
    current: () => latest(deps.db),
    inForceAt: (instant) => latest(deps.db, lte(operatorSettingsVersion.inForceFrom, instant)),
    async change(by, input) {
      // Defence in depth behind guarded(): the module checks the actor itself.
      const authorization = authorize(by, "pengaturan_operator.ubah", pengaturanOperatorResource());
      if (!authorization.allowed) {
        return { ok: false, reason: authorization.reason === "perlu_totp" ? "perlu_totp" : "tidak_berwenang" };
      }
      const phone = normalisePhoneNumber(input.csWhatsApp);
      if (!phone.ok) return { ok: false, reason: phone.reason };
      return deps.audit.staffWrite(deps.db, async (tx, record) => {
        const [row] = await tx
          .insert(operatorSettingsVersion)
          .values({
            inForceFrom: deps.clock.now(),
            legalName: input.legalName,
            address: input.address,
            phone: input.phone,
            email: input.email,
            csWhatsApp: phone.phoneNumber,
            csReplyHours: input.csReplyHours,
            changedByAccountId: by.accountId,
          })
          .returning();
        const settings = toValues(row);
        await record({
          actor: { accountId: by.accountId, role: "admin_platform" },
          action: "pengaturan_operator.ubah",
          entity: { kind: "pengaturan_operator", id: "operator" },
          before: null,
          after: { ...settings, inForceFrom: settings.inForceFrom.toISOString() },
          reason: input.reason,
        });
        return { ok: true as const, settings };
      });
    },
  };
}

/** The last change (optionally among those matching `where`), or null when there is none. */
async function latest(db: Database, where?: SQL): Promise<OperatorSettingsValues | null> {
  const [row] = await db
    .select()
    .from(operatorSettingsVersion)
    .where(where)
    .orderBy(desc(operatorSettingsVersion.inForceFrom), desc(operatorSettingsVersion.seq))
    .limit(1);
  return row ? toValues(row) : null;
}

function toValues(row: typeof operatorSettingsVersion.$inferSelect): OperatorSettingsValues {
  return {
    legalName: row.legalName,
    address: row.address,
    phone: row.phone,
    email: row.email,
    csWhatsApp: row.csWhatsApp,
    csReplyHours: row.csReplyHours,
    inForceFrom: row.inForceFrom,
  };
}
