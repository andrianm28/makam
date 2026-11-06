import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { TariffDeps } from "./deps";
import { isUuid } from "./ids";
import { findJenisMakam } from "./jenis-makam";
import { lockLokasiTariffs } from "./locks";
import { effectiveDateRefusal, effectiveOnSchema, rupiahSchema, type EffectiveDateRefusal, type InvalidTariff, type Rupiah } from "./money";
import { tariffBiayaPemakamanJenisVersion, tariffJenisMakamKeterangan } from "./schema";
import { selectVersions, versionTimesOf, writeVersion, type StoredVersionTimes } from "./version-writes";

/**
 * One version of a Jenis Makam's own Biaya Pemakaman (dri, 6 Nov 2026): an
 * amount that replaces the Lokasi Mitra's for a new Hak Pakai of this Jenis
 * Makam, or null to follow the Lokasi's again. A tumpang keeps the Lokasi's.
 */
export interface BiayaPemakamanJenisVersion extends StoredVersionTimes {
  jenisMakamId: string;
  lokasiId: string;
  biayaPemakaman: Rupiah | null;
}

export interface SetBiayaPemakamanJenisInput {
  /** Whole rupiah, or null to follow the Lokasi Mitra's Biaya Pemakaman from `effectiveOn`. */
  biayaPemakaman: number | null;
  effectiveOn: string;
  reason: string | null;
}

export type SetBiayaPemakamanJenisResult =
  | { ok: true; version: BiayaPemakamanJenisVersion }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  | InvalidTariff
  | EffectiveDateRefusal;

const inputSchema = z.object({ biayaPemakaman: rupiahSchema.nullable(), effectiveOn: effectiveOnSchema });

/** Admin Platform sets (or clears, from a date) one Jenis Makam's own Biaya Pemakaman. Audited, versioned. */
export async function setBiayaPemakamanJenis(
  deps: TariffDeps,
  by: Actor,
  jenisMakamId: string,
  input: SetBiayaPemakamanJenisInput,
): Promise<SetBiayaPemakamanJenisResult> {
  const jenisMakam = await findJenisMakam(deps.db, jenisMakamId);
  // Who may write is checked before whether the Jenis Makam exists, so a refusal says nothing about it.
  const refusal = writeRefusal(by, "tarif.ubah", lokasiMitraResource(jenisMakam?.lokasiId ?? ""));
  if (refusal) return refusal;
  if (!jenisMakam) return { ok: false, reason: "tidak_ditemukan" };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tarif_tidak_valid" };
  const now = deps.clock.now();
  const lampau = effectiveDateRefusal(parsed.data.effectiveOn, now);
  if (lampau) return lampau;

  return writeVersion(deps, now, (tx) => lockLokasiTariffs(tx, jenisMakam.lokasiId), {
    effectiveOn: parsed.data.effectiveOn,
    versions: (tx) => biayaPemakamanJenisVersions(tx, jenisMakam.id),
    insert: async (tx, inForceFrom) => {
      const [row] = await tx
        .insert(tariffBiayaPemakamanJenisVersion)
        .values({
          jenisMakamId: jenisMakam.id,
          lokasiId: jenisMakam.lokasiId,
          biayaPemakaman: parsed.data.biayaPemakaman,
          effectiveOn: parsed.data.effectiveOn,
          inForceFrom,
          enteredAt: now,
          enteredByAccountId: by.accountId,
        })
        .returning();
      return toVersion(row);
    },
    entry: (replaced, version) => ({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tarif.ubah_biaya_pemakaman_jenis",
      entity: { kind: "jenis_makam", id: jenisMakam.id },
      lokasiId: jenisMakam.lokasiId,
      before: replaced && { name: jenisMakam.name, biayaPemakaman: replaced.biayaPemakaman, effectiveOn: replaced.effectiveOn },
      after: { name: jenisMakam.name, biayaPemakaman: version.biayaPemakaman, effectiveOn: version.effectiveOn },
      reason: input.reason?.trim() || null,
    }),
  });
}

/** Every version of one Jenis Makam's own Biaya Pemakaman, in entry order. */
export async function biayaPemakamanJenisVersions(db: Database, jenisMakamId: string): Promise<BiayaPemakamanJenisVersion[]> {
  if (!isUuid(jenisMakamId)) return [];
  return selectVersions(db, tariffBiayaPemakamanJenisVersion, eq(tariffBiayaPemakamanJenisVersion.jenisMakamId, jenisMakamId), toVersion);
}

function toVersion(row: typeof tariffBiayaPemakamanJenisVersion.$inferSelect): BiayaPemakamanJenisVersion {
  return { jenisMakamId: row.jenisMakamId, lokasiId: row.lokasiId, biayaPemakaman: row.biayaPemakaman, ...versionTimesOf(row) };
}

/** The longest Jenis Makam description, as when it is created. */
const KETERANGAN_MAX = 500;

export type UbahKeteranganJenisMakamResult =
  | { ok: true; description: string }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" | "keterangan_tidak_valid" };

/**
 * Admin Platform corrects a Jenis Makam's description (dri, 6 Nov 2026). Quotes and Tagihan carry the name only,
 * so a corrected description changes no price or document already issued. Audited with before and after.
 */
export async function ubahKeteranganJenisMakam(
  deps: TariffDeps,
  by: Actor,
  jenisMakamId: string,
  input: { description: string; reason: string | null },
): Promise<UbahKeteranganJenisMakamResult> {
  const jenisMakam = await findJenisMakam(deps.db, jenisMakamId);
  const refusal = writeRefusal(by, "tarif.ubah", lokasiMitraResource(jenisMakam?.lokasiId ?? ""));
  if (refusal) return refusal;
  if (!jenisMakam) return { ok: false, reason: "tidak_ditemukan" };
  const description = input.description.trim().replace(/\s+/g, " ");
  if (description.length > KETERANGAN_MAX) return { ok: false, reason: "keterangan_tidak_valid" };
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockLokasiTariffs(tx, jenisMakam.lokasiId);
    // The "before" is read under the lock, so two corrections at once each record what the other left.
    const sebelum = (await findJenisMakam(tx, jenisMakam.id)) ?? jenisMakam;
    const values = { description, updatedAt: now, updatedByAccountId: by.accountId };
    await tx
      .insert(tariffJenisMakamKeterangan)
      .values({ jenisMakamId: jenisMakam.id, ...values })
      .onConflictDoUpdate({ target: tariffJenisMakamKeterangan.jenisMakamId, set: values });
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tarif.ubah_keterangan_jenis_makam",
      entity: { kind: "jenis_makam", id: jenisMakam.id },
      lokasiId: jenisMakam.lokasiId,
      before: { name: sebelum.name, description: sebelum.description },
      after: { name: jenisMakam.name, description },
      reason: input.reason?.trim() || null,
    });
    return { ok: true as const, description };
  });
}
