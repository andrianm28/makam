import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { biayaPemakamanVersions } from "./biaya-pemakaman";
import type { TariffDeps } from "./deps";
import { globalTariffVersions } from "./global-tariffs";
import { jenisMakamOfLokasi, jenisMakamVersions, lockLokasiTariffs } from "./jenis-makam";
import { tariffCheck } from "./schema";

/** A Lokasi Mitra's "tarif diperiksa" mark. */
export interface TariffsChecked {
  checkedAt: Date;
  checkedByAccountId: string;
  /** True when a tariff of this Lokasi (a Jenis Makam or a version, a Biaya Pemakaman) was entered after the check. */
  changedSinceCheck: boolean;
}

/** What a Lokasi's tariffs still lack before they can be marked checked. */
export type MissingTariff = "jenis_makam" | "biaya_pemakaman" | "biaya_layanan_platform";

export type MarkTariffsCheckedResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  | { ok: false; reason: "tarif_belum_lengkap"; missing: MissingTariff[] };

export async function markTariffsChecked(
  deps: TariffDeps,
  by: Actor,
  lokasiId: string,
  input: { reason: string | null },
): Promise<MarkTariffsCheckedResult> {
  const refusal = writeRefusal(by, "tarif.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const lokasi = await deps.lokasi.lokasiMitra(by, lokasiId);
  if (!lokasi.ok) return lokasi;
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockLokasiTariffs(tx, lokasiId);
    const missing = await missingTariffs(tx, lokasiId);
    if (missing.length > 0) return { ok: false as const, reason: "tarif_belum_lengkap" as const, missing };
    const previous = await latestCheck(tx, lokasiId);
    await tx.insert(tariffCheck).values({ lokasiId, checkedAt: now, checkedByAccountId: by.accountId });
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tarif.tandai_diperiksa",
      entity: { kind: "lokasi_mitra", id: lokasiId },
      lokasiId,
      before: previous && { checkedAt: previous.checkedAt.toISOString() },
      after: { checkedAt: now.toISOString() },
      reason: input.reason?.trim() || null,
    });
    return { ok: true as const };
  });
}

export async function tariffsChecked(db: Database, lokasiId: string): Promise<TariffsChecked | null> {
  const check = await latestCheck(db, lokasiId);
  if (!check) return null;
  const jenisMakam = await jenisMakamOfLokasi(db, lokasiId);
  const entered = [
    ...(await Promise.all(jenisMakam.map((one) => jenisMakamVersions(db, one.id)))).flat(),
    ...(await biayaPemakamanVersions(db, lokasiId)),
  ].map((version) => version.enteredAt);
  return {
    checkedAt: check.checkedAt,
    checkedByAccountId: check.checkedByAccountId,
    changedSinceCheck: entered.some((at) => at.getTime() > check.checkedAt.getTime()),
  };
}

async function missingTariffs(db: Database, lokasiId: string): Promise<MissingTariff[]> {
  const [jenisMakam, biayaPemakaman, platform] = await Promise.all([
    jenisMakamOfLokasi(db, lokasiId),
    biayaPemakamanVersions(db, lokasiId),
    globalTariffVersions(db, "biaya_layanan_platform"),
  ]);
  const missing: MissingTariff[] = [];
  if (jenisMakam.length === 0) missing.push("jenis_makam");
  if (biayaPemakaman.length === 0) missing.push("biaya_pemakaman");
  if (platform.length === 0) missing.push("biaya_layanan_platform");
  return missing;
}

async function latestCheck(db: Database, lokasiId: string) {
  if (!z.uuid().safeParse(lokasiId).success) return null;
  const [row] = await db
    .select()
    .from(tariffCheck)
    .where(eq(tariffCheck.lokasiId, lokasiId))
    .orderBy(desc(tariffCheck.seq))
    .limit(1);
  return row ?? null;
}
