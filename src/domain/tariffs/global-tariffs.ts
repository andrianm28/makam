import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { tarifGlobalResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { z } from "zod";
import {
  effectiveDateRefusal,
  effectiveOnSchema,
  rupiahSchema,
  type EffectiveDateRefusal,
  type InvalidTariff,
} from "./money";
import { globalTariffKeys, tariffGlobalVersion } from "./schema";
import { inForceAt, inForceFromFor, type VersionTimes } from "./versions";
import type { TariffDeps } from "./deps";

export type GlobalTariffKey = (typeof globalTariffKeys)[number];

/** One version of a global tariff. */
export interface GlobalTariffVersion extends VersionTimes {
  key: GlobalTariffKey;
  /** Whole rupiah. */
  amount: number;
  /** When Admin Platform entered it (Clock). */
  enteredAt: Date;
}

export interface SetGlobalTariffInput {
  key: GlobalTariffKey;
  amount: number;
  effectiveOn: string;
  reason: string | null;
}

export type SetGlobalTariffResult =
  | { ok: true; version: GlobalTariffVersion }
  | WriteRefusal
  | InvalidTariff
  | EffectiveDateRefusal;

const globalTariffInputSchema = z.object({
  key: z.enum(globalTariffKeys),
  amount: rupiahSchema,
  effectiveOn: effectiveOnSchema,
});

export async function setGlobalTariff(deps: TariffDeps, by: Actor, input: SetGlobalTariffInput): Promise<SetGlobalTariffResult> {
  // Defence in depth behind guarded(): the module checks the actor itself.
  const refusal = writeRefusal(by, "tarif.ubah", tarifGlobalResource());
  if (refusal) return refusal;
  if (!globalTariffInputSchema.safeParse(input).success) return { ok: false, reason: "tarif_tidak_valid" };
  const now = deps.clock.now();
  const lampau = effectiveDateRefusal(input.effectiveOn, now);
  if (lampau) return lampau;
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    // One entry per price book at a time, so each Entri Audit's "before" is exact.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tariffs.global.${input.key}`}))`);
    const inForceFrom = inForceFromFor(input.effectiveOn, now);
    const replaced = inForceAt(await globalTariffVersions(tx, input.key), inForceFrom);
    const [row] = await tx
      .insert(tariffGlobalVersion)
      .values({
        key: input.key,
        amount: input.amount,
        effectiveOn: input.effectiveOn,
        inForceFrom,
        enteredAt: now,
        enteredByAccountId: by.accountId,
      })
      .returning();
    const version = toVersion(row);
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tarif.ubah_global",
      entity: { kind: "tarif_global", id: input.key },
      before: replaced && auditSnapshot(replaced),
      after: auditSnapshot(version),
      reason: input.reason,
    });
    return { ok: true as const, version };
  });
}

/** Every version of one global tariff, in entry order. */
export async function globalTariffVersions(db: Database, key: GlobalTariffKey): Promise<GlobalTariffVersion[]> {
  const rows = await db
    .select()
    .from(tariffGlobalVersion)
    .where(eq(tariffGlobalVersion.key, key))
    .orderBy(asc(tariffGlobalVersion.seq));
  return rows.map(toVersion);
}

export async function globalTariff(deps: TariffDeps, key: GlobalTariffKey, at: Date): Promise<GlobalTariffVersion | null> {
  return inForceAt(await globalTariffVersions(deps.db, key), at);
}

function auditSnapshot(version: GlobalTariffVersion) {
  return { amount: version.amount, effectiveOn: version.effectiveOn };
}

function toVersion(row: typeof tariffGlobalVersion.$inferSelect): GlobalTariffVersion {
  return {
    key: row.key,
    amount: row.amount,
    effectiveOn: row.effectiveOn,
    inForceFrom: row.inForceFrom,
    seq: row.seq,
    enteredAt: row.enteredAt,
  };
}
