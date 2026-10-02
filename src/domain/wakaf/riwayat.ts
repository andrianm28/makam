/** A status entering the timeline, and the Wakif being told: the two always happen together, in the write's own transaction. */
import { randomUUID } from "node:crypto";
import type { Database } from "@/db/client";
import type { WakafDeps } from "./deps";
import { wakafRiwayat, type StatusWakaf } from "./schema";
import { labelStatusWakaf } from "./skema";

export async function catatPerubahanStatus(
  deps: WakafDeps,
  tx: Database,
  pengajuan: { id: string; nomor: string; wakifEmail: string },
  status: StatusWakaf,
  rincian: { tanggal: string | null; alasan: string | null; catatan: string | null },
  now: Date,
): Promise<void> {
  const perubahanId = randomUUID();
  await tx.insert(wakafRiwayat).values({ id: perubahanId, pengajuanId: pengajuan.id, status, pada: now, tanggal: rincian.tanggal });
  await deps.notifikasi.wakafStatusBerubah(
    {
      perubahanId,
      nomor: pengajuan.nomor,
      email: pengajuan.wakifEmail,
      labelStatus: labelStatusWakaf[status],
      tanggal: rincian.tanggal,
      alasan: rincian.alasan,
      catatan: rincian.catatan,
    },
    tx,
  );
}
