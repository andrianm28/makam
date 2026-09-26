import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { TariffDeps } from "./deps";
import { lockLokasiTariffs } from "./jenis-makam";
import {
  effectiveDateRefusal,
  effectiveOnSchema,
  rupiahSchema,
  type EffectiveDateRefusal,
  type Rupiah,
  type InvalidTariff,
} from "./money";
import { tariffBiayaPemakamanVersion } from "./schema";
import { inForceAt, inForceFromFor, type VersionTimes } from "./versions";

/** A Lokasi Mitra's Biaya Pemakaman, whole rupiah. */
export interface BiayaPemakaman {
  biayaPemakaman: number;
  /** The amount for a tumpang, or null when it is the same as `biayaPemakaman`. */
  biayaPemakamanTumpang: number | null;
}

export interface BiayaPemakamanVersion extends VersionTimes {
  biayaPemakaman: Rupiah;
  biayaPemakamanTumpang: Rupiah | null;
  lokasiId: string;
  enteredAt: Date;
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

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockLokasiTariffs(tx, lokasiId);
    const inForceFrom = inForceFromFor(parsed.data.effectiveOn, now);
    const replaced = inForceAt(await biayaPemakamanVersions(tx, lokasiId), inForceFrom);
    const [row] = await tx
      .insert(tariffBiayaPemakamanVersion)
      .values({ lokasiId, ...parsed.data, inForceFrom, enteredAt: now, enteredByAccountId: by.accountId })
      .returning();
    const version = toVersion(row);
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tarif.ubah_biaya_pemakaman",
      entity: { kind: "biaya_pemakaman", id: lokasiId },
      lokasiId,
      before: replaced && snapshot(replaced),
      after: snapshot(version),
      reason: input.reason?.trim() || null,
    });
    return { ok: true as const, version };
  });
}

/** Every Biaya Pemakaman version of a Lokasi Mitra, in entry order. */
export async function biayaPemakamanVersions(db: Database, lokasiId: string): Promise<BiayaPemakamanVersion[]> {
  if (!z.uuid().safeParse(lokasiId).success) return [];
  const rows = await db
    .select()
    .from(tariffBiayaPemakamanVersion)
    .where(eq(tariffBiayaPemakamanVersion.lokasiId, lokasiId))
    .orderBy(asc(tariffBiayaPemakamanVersion.seq));
  return rows.map(toVersion);
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
    effectiveOn: row.effectiveOn,
    inForceFrom: row.inForceFrom,
    seq: row.seq,
    enteredAt: row.enteredAt,
  };
}
