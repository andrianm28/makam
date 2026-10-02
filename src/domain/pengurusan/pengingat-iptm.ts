/**
 * The IPTM expiry reminders' schedule (spec, Notifications: "IPTM expiry, 3 months and 1 month before"; stories 79;
 * ticket 48): which reminder is due for which Makam TPU today. The message is Notifications'
 * (`pengingatIptmBerakhir`); this owns the rule.
 *
 * A worker tick (`tick(ctx, now)`, idempotent): within 08:00-20:00 WIB, for every Makam TPU whose IPTM expires within 3
 * months (and has not yet expired) it names the stage the day is in: "3 months" from 3 months before the expiry, "1
 * month" from 1 month before. Announcing a stage twice sends it once, so a tick that runs again, or that first sees a
 * Makam TPU late, sends only the stage it is in. It stops for a Makam TPU while a Perpanjangan TPU is ordered for it
 * (any status but Ditolak and Dibatalkan); IPTM Terbit moves the expiry, which starts a fresh schedule.
 */
import { and, eq, gte, lte, notInArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Identity } from "@/domain/identity";
import { dalamJamKirim, type Notifications } from "@/domain/notifications";
import { addWibDateMonths, wibDateOf } from "@/lib/time/jakarta";
import { BULAN_PERPANJANGAN_TPU_DIBUKA } from "./aturan";
import { makamTpu, pengurusanTpu } from "./schema";

export interface PengingatIptmDeps {
  db: Database;
  identity: Pick<Identity, "accountOnRecord">;
  notifikasi: Pick<Notifications, "pengingatIptmBerakhir">;
  /** The Perpanjangan page's full URL for a Makam TPU. */
  tautan: (makamTpuId: string) => string;
}

/** The stage a day is in: 1 month from one month before the expiry, 3 months from three months before; null before that or after the expiry. */
function tahap(hariIni: string, berlakuSampai: string): 1 | 3 | null {
  if (hariIni > berlakuSampai) return null;
  if (hariIni >= addWibDateMonths(berlakuSampai, -1)) return 1;
  if (hariIni >= addWibDateMonths(berlakuSampai, -BULAN_PERPANJANGAN_TPU_DIBUKA)) return 3;
  return null;
}

export async function pengingatIptmTick(deps: PengingatIptmDeps, now: Date): Promise<{ diumumkan: number }> {
  if (!dalamJamKirim(now)) return { diumumkan: 0 };
  const hariIni = wibDateOf(now);
  const kandidat = await deps.db
    .select()
    .from(makamTpu)
    .where(and(gte(makamTpu.iptmBerlakuSampai, hariIni), lte(makamTpu.iptmBerlakuSampai, addWibDateMonths(hariIni, BULAN_PERPANJANGAN_TPU_DIBUKA))));
  let diumumkan = 0;
  for (const makam of kandidat) {
    const sisaBulan = tahap(hariIni, makam.iptmBerlakuSampai);
    if (sisaBulan === null) continue;
    const dipesan = await deps.db
      .select({ id: pengurusanTpu.id })
      .from(pengurusanTpu)
      .where(and(eq(pengurusanTpu.makamTpuId, makam.id), eq(pengurusanTpu.kind, "perpanjangan_tpu"), notInArray(pengurusanTpu.status, ["ditolak", "dibatalkan"])))
      .limit(1);
    if (dipesan.length > 0) continue;
    const akun = makam.pemegangAccountId ? await deps.identity.accountOnRecord(makam.pemegangAccountId) : null;
    const hasil = await deps.notifikasi.pengingatIptmBerakhir({
      makamTpuId: makam.id,
      kunci: `${makam.iptmBerlakuSampai}:${sisaBulan}`,
      tpuName: makam.tpuName,
      blokNomor: makam.blokNomor,
      pemegangHakName: makam.pemegangHak.name,
      email: makam.pemegangHak.email ?? akun?.email ?? null,
      berlakuSampai: makam.iptmBerlakuSampai,
      sisaBulan,
      tautan: deps.tautan(makam.id),
    });
    if (!hasil.ok) throw new Error(`pengingat IPTM ${makam.id} ditolak: ${hasil.reason}`);
    diumumkan += 1;
  }
  return { diumumkan };
}
