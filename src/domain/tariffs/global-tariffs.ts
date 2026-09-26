import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { tarifGlobalResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { z } from "zod";
import type { TariffDeps } from "./deps";
import { lockGlobalTariff } from "./locks";
import {
  effectiveDateRefusal,
  effectiveOnSchema,
  rupiahSchema,
  type EffectiveDateRefusal,
  type InvalidTariff,
  type Rupiah,
} from "./money";
import { globalTariffKeys, tariffGlobalVersion } from "./schema";
import { selectVersions, versionTimesOf, writeVersion, type StoredVersionTimes } from "./version-writes";
import { inForceAt } from "./versions";

export type GlobalTariffKey = (typeof globalTariffKeys)[number];

/** One version of a global tariff. */
export interface GlobalTariffVersion extends StoredVersionTimes {
  key: GlobalTariffKey;
  amount: Rupiah;
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
  const parsed = globalTariffInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tarif_tidak_valid" };
  const { key, amount, effectiveOn } = parsed.data;
  const now = deps.clock.now();
  const lampau = effectiveDateRefusal(effectiveOn, now);
  if (lampau) return lampau;
  return writeVersion(deps, now, (tx) => lockGlobalTariff(tx, key), {
    effectiveOn,
    versions: (tx) => globalTariffVersions(tx, key),
    insert: async (tx, inForceFrom) => {
      const [row] = await tx
        .insert(tariffGlobalVersion)
        .values({ key, amount, effectiveOn, inForceFrom, enteredAt: now, enteredByAccountId: by.accountId })
        .returning();
      return toVersion(row);
    },
    entry: (replaced, version) => ({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tarif.ubah_global",
      entity: { kind: "tarif_global", id: key },
      before: replaced && auditSnapshot(replaced),
      after: auditSnapshot(version),
      reason: input.reason?.trim() || null,
    }),
  });
}

/** Every version of one global tariff, in entry order. */
export function globalTariffVersions(db: Database, key: GlobalTariffKey): Promise<GlobalTariffVersion[]> {
  return selectVersions(db, tariffGlobalVersion, eq(tariffGlobalVersion.key, key), toVersion);
}

export async function globalTariff(deps: TariffDeps, key: GlobalTariffKey, at: Date): Promise<GlobalTariffVersion | null> {
  return inForceAt(await globalTariffVersions(deps.db, key), at);
}

function auditSnapshot(version: GlobalTariffVersion) {
  return { amount: version.amount, effectiveOn: version.effectiveOn };
}

function toVersion(row: typeof tariffGlobalVersion.$inferSelect): GlobalTariffVersion {
  return { key: row.key, amount: row.amount, ...versionTimesOf(row) };
}
