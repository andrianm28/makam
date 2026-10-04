/**
 * The hari-H Layanan of a Saat Duka TPU order that ends (ticket 117; spec, Pengurusan > cancellation and Layanan >
 * Pekerjaan Layanan at a TPU). The Lokasi Mitra's counterpart is `batalkanLayananPetakDibatalkan`.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { nilaiDibayarBaris } from "@/domain/billing";
import type { LayananDeps } from "./deps";
import { barisTagihanPekerjaanTpu } from "./pengembalian-tpu";
import { pekerjaanLayananTpu, pekerjaanLayananTpuPenugasan, type PekerjaanTpuStatus } from "./schema";

/**
 * The jobs a cancellation can still stop: not yet started, or late and never sent for approval. Terlambat is
 * "not done" as the Lokasi Mitra's counterpart reads it (owner decision 2026-10-02). A job Sedang Dikerjakan, Menunggu
 * Verifikasi (the work is done and only the approval waits), Selesai or in Keluhan keeps its price.
 */
const BISA_DIBATALKAN: readonly PekerjaanTpuStatus[] = ["dijadwalkan", "terlambat"];

const ALASAN_DILEPAS = "Pesanan dibatalkan";

export type BatalkanHariHTpuResult =
  | {
      ok: true;
      /** The jobs this call cancelled: a redo of a done job counts, though it has no line of its own. */
      dibatalkan: number;
      /**
       * The lines to ask Refunds for, one per original job this call cancelled: what was paid for it, after any Harga
       * Khusus. Empty while the Tagihan is not paid, and for a job whose paid value is zero.
       */
      baris: { label: string; amount: number; lokasiId: string | null }[];
      /**
       * Original jobs of the order this call did not cancel, so their lines are not in `baris`: those that keep their
       * price, and those cancelled before (their refund, if any, was asked then). Zero means `baris` is the whole of
       * what the order's Layanan can return.
       */
      tidakDikembalikan: number;
    }
  /** A paid Tagihan holds no line for one of the jobs. Nothing was written: refusing here is safer than refunding too little. */
  | { ok: false; reason: "baris_tidak_ditemukan" };

/**
 * A Saat Duka TPU order ends (the family's Batalkan before the IPTM is filed): every hari-H job of that order not yet done
 * becomes Dibatalkan, and the lines to refund for exactly those come back for the cancellation to ask of Refunds together
 * with the order's own lines, in its own transaction (`within`). A job that keeps its price is left as it is and is not
 * returned. A job held by a Mitra Jasa is taken off them (a release, which counts for nothing on the scorecard): it is not
 * offered, not assignable, and never reaches a Pencairan. Idempotent: a cancelled job is not touched again, so asked twice
 * the second answer has no line. A Nomor Pemesanan with no hari-H job answers none.
 *
 * The jobs are locked, so a Mitra Jasa starting one at the same moment either began first (the job keeps its price) or
 * finds it cancelled. No message goes to the Mitra Jasa: this module sends none when a job is cancelled, and the job is
 * simply gone from their list.
 */
export async function batalkanHariHTpu(deps: LayananDeps, nomor: string, within: Database): Promise<BatalkanHariHTpuResult> {
  const jobs = await within
    .select()
    .from(pekerjaanLayananTpu)
    .where(and(eq(pekerjaanLayananTpu.nomor, nomor), eq(pekerjaanLayananTpu.sumber, "saat_duka_tpu")))
    .orderBy(asc(pekerjaanLayananTpu.posisi))
    .for("update");
  const first = jobs[0];
  if (!first) return { ok: true, dibatalkan: 0, baris: [], tidakDikembalikan: 0 };

  const tagihan = await deps.billing.within(within).tagihanBerlaku(first.tagihanId);
  const dibayar = tagihan?.status === "lunas";
  const dihentikan = jobs.filter((job) => BISA_DIBATALKAN.includes(job.status));
  const baris: { label: string; amount: number; lokasiId: string | null }[] = [];
  for (const job of dihentikan) {
    // A redo is its original's line again, and the original keeps its price: the redo has nothing of its own to return.
    if (!dibayar || !tagihan || job.kerjaUlangDariId !== null) continue;
    const line = await barisTagihanPekerjaanTpu(within, tagihan.lines, job);
    if (!line) return { ok: false, reason: "baris_tidak_ditemukan" };
    const amount = nilaiDibayarBaris(tagihan.lines, line);
    if (amount > 0) baris.push({ label: line.label, amount, lokasiId: line.provider.kind === "lokasi_mitra" ? line.provider.lokasiId : null });
  }

  const now = deps.clock.now();
  for (const job of dihentikan) {
    await within
      .update(pekerjaanLayananTpu)
      .set({ status: "dibatalkan", dibatalkanAt: now })
      .where(and(eq(pekerjaanLayananTpu.id, job.id), eq(pekerjaanLayananTpu.status, job.status)));
    await within
      .update(pekerjaanLayananTpuPenugasan)
      .set({ hasil: "dilepas", dijawabAt: now, alasan: ALASAN_DILEPAS })
      .where(and(eq(pekerjaanLayananTpuPenugasan.pekerjaanId, job.id), inArray(pekerjaanLayananTpuPenugasan.hasil, ["menunggu", "diterima"])));
  }
  const tidakDikembalikan = jobs.filter((job) => job.kerjaUlangDariId === null && !BISA_DIBATALKAN.includes(job.status)).length;
  return { ok: true, dibatalkan: dihentikan.length, baris, tidakDikembalikan };
}
