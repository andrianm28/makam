import { desc } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { normalisePhoneNumber, type Actor } from "@/domain/identity";
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
    async current() {
      const [row] = await deps.db
        .select()
        .from(operatorSettingsVersion)
        .orderBy(desc(operatorSettingsVersion.inForceFrom), desc(operatorSettingsVersion.seq))
        .limit(1);
      return row ? toValues(row) : null;
    },
    async inForceAt() {
      return null;
    },
    async change(by, input) {
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
