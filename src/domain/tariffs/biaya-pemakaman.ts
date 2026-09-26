import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { TariffDeps } from "./deps";
import { isUuid } from "./ids";
import { lockLokasiTariffs } from "./locks";
import {
  effectiveDateRefusal,
  effectiveOnSchema,
  rupiahSchema,
  type EffectiveDateRefusal,
  type Rupiah,
  type InvalidTariff,
} from "./money";
import { tariffBiayaPemakamanVersion } from "./schema";
import { selectVersions, versionTimesOf, writeVersion, type StoredVersionTimes } from "./version-writes";

/** A Lokasi Mitra's Biaya Pemakaman, whole rupiah. */
export interface BiayaPemakaman {
  biayaPemakaman: number;
  /** The amount for a tumpang, or null when it is the same as `biayaPemakaman`. */
  biayaPemakamanTumpang: number | null;
}

export interface BiayaPemakamanVersion extends StoredVersionTimes {
  biayaPemakaman: Rupiah;
  biayaPemakamanTumpang: Rupiah | null;
  lokasiId: string;
}

export type SetBiayaPemakamanInput = BiayaPemakaman & { effectiveOn: string; reason: string | null };

export type SetBiayaPemakamanResult =
  | { ok: true; version: BiayaPemakamanVersion }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  | InvalidTariff
  | EffectiveDateRefusal;

const biayaPemakamanSchema = z.object({
  biayaPemakaman: rupiahSchema,
  biayaPemakamanTumpang: rupiahSchema.nullable(),
  effectiveOn: effectiveOnSchema,
});

export async function setBiayaPemakaman(
  deps: TariffDeps,
  by: Actor,
  lokasiId: string,
  input: SetBiayaPemakamanInput,
): Promise<SetBiayaPemakamanResult> {
  const refusal = writeRefusal(by, "tarif.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = biayaPemakamanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tarif_tidak_valid" };
  const now = deps.clock.now();
  const lampau = effectiveDateRefusal(parsed.data.effectiveOn, now);
  if (lampau) return lampau;
  const lokasi = await deps.lokasi.lokasiMitra(by, lokasiId);
  if (!lokasi.ok) return lokasi;

  return writeVersion(deps, now, (tx) => lockLokasiTariffs(tx, lokasiId), {
    effectiveOn: parsed.data.effectiveOn,
    versions: (tx) => biayaPemakamanVersions(tx, lokasiId),
    insert: async (tx, inForceFrom) => {
      const [row] = await tx
        .insert(tariffBiayaPemakamanVersion)
        .values({ lokasiId, ...parsed.data, inForceFrom, enteredAt: now, enteredByAccountId: by.accountId })
        .returning();
      return toVersion(row);
    },
    entry: (replaced, version) => ({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tarif.ubah_biaya_pemakaman",
      entity: { kind: "biaya_pemakaman", id: lokasiId },
      lokasiId,
      before: replaced && snapshot(replaced),
      after: snapshot(version),
      reason: input.reason?.trim() || null,
    }),
  });
}

/** Every Biaya Pemakaman version of a Lokasi Mitra, in entry order. */
export async function biayaPemakamanVersions(db: Database, lokasiId: string): Promise<BiayaPemakamanVersion[]> {
  if (!isUuid(lokasiId)) return [];
  return selectVersions(db, tariffBiayaPemakamanVersion, eq(tariffBiayaPemakamanVersion.lokasiId, lokasiId), toVersion);
}

function snapshot(version: BiayaPemakamanVersion) {
  return {
    biayaPemakaman: version.biayaPemakaman,
    biayaPemakamanTumpang: version.biayaPemakamanTumpang,
    effectiveOn: version.effectiveOn,
  };
}

function toVersion(row: typeof tariffBiayaPemakamanVersion.$inferSelect): BiayaPemakamanVersion {
  return {
    lokasiId: row.lokasiId,
    biayaPemakaman: row.biayaPemakaman,
    biayaPemakamanTumpang: row.biayaPemakamanTumpang,
    ...versionTimesOf(row),
  };
}
