/**
 * The hari-H Layanan of a Saat Duka TPU order that ends (ticket 117; spec, Pengurusan > cancellation and Layanan >
 * Pekerjaan Layanan at a TPU). The Lokasi Mitra's counterpart is `batalkanLayananPetakDibatalkan`.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { nilaiDibayarBaris } from "@/domain/billing";
import type { LayananDeps } from "./deps";
import { barisTagihanPekerjaanTpu } from "./pengembalian-tpu";
import { pekerjaanLayananTpu, pekerjaanLayananTpuBukti, pekerjaanLayananTpuPenugasan } from "./schema";

/** One line of the Tagihan to ask Refunds for: what was paid for it, after any Harga Khusus. */
type BarisPengembalian = { label: string; amount: number; lokasiId: string | null };

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
      baris: BarisPengembalian[];
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
 * Whether a cancellation can still stop the job: it is Dijadwalkan, or it is Terlambat and was never started. "Not yet
 * done" is a job Dijadwalkan or assigned but not started; one Sedang Dikerjakan, Menunggu Verifikasi (the work is done
 * and only the approval waits), Selesai or in Keluhan keeps its price. The Terlambat tick flags a job already Sedang
 * Dikerjakan too, so Terlambat alone says nothing: a late job the Mitra Jasa has begun is kept like one Sedang
 * Dikerjakan. It has begun when `mulaiAt` is set or any shot of its proof exists (`dimulai`), because a first shot
 * taken after the tick flagged the job does not stamp `mulaiAt` (`simpanBuktiTpu` stamps it on a Dijadwalkan job only).
 */
function bisaDibatalkan(job: typeof pekerjaanLayananTpu.$inferSelect, dimulai: ReadonlySet<string>): boolean {
  if (job.status === "dijadwalkan") return true;
  return job.status === "terlambat" && job.mulaiAt === null && !dimulai.has(job.id);
}

/**
 * A Saat Duka TPU order ends (the family's Batalkan before the IPTM is filed): every hari-H job of that order not yet done
 * (`bisaDibatalkan`) becomes Dibatalkan, and the lines to refund for exactly those come back for the cancellation to ask of
 * Refunds together with the order's own lines, in its own transaction (`within`). A job that keeps its price is left as it is
 * and is not returned. A job held by a Mitra Jasa is taken off them (a release, which counts for nothing on the scorecard): it
 * is not offered, not assignable, and never reaches a Pencairan. Idempotent: a cancelled job is not touched again, so asked
 * twice the second answer has no line. A Nomor Pemesanan with no hari-H job answers none.
 *
 * The jobs are locked from the read to the last write, in a transaction of this call's own when `within` is not one (a
 * savepoint when it is), so a Mitra Jasa starting one at the same moment either began first (the job keeps its price and its
 * Mitra Jasa) or finds it cancelled. A line is returned, and an assignment released, only for a job the update really moved.
 * No message goes to the Mitra Jasa: this module sends none when a job is cancelled, and the job is simply gone from their list.
 */
export async function batalkanHariHTpu(deps: LayananDeps, nomor: string, within: Database): Promise<BatalkanHariHTpuResult> {
  return within.transaction((tx) => batalkanTerkunci(deps, nomor, tx));
}

async function batalkanTerkunci(deps: LayananDeps, nomor: string, tx: Database): Promise<BatalkanHariHTpuResult> {
  const jobs = await tx
    .select()
    .from(pekerjaanLayananTpu)
    .where(and(eq(pekerjaanLayananTpu.nomor, nomor), eq(pekerjaanLayananTpu.sumber, "saat_duka_tpu")))
    .orderBy(asc(pekerjaanLayananTpu.posisi))
    .for("update");
  const first = jobs[0];
  if (!first) return { ok: true, dibatalkan: 0, baris: [], tidakDikembalikan: 0 };

  const dimulai = new Set(
    (
      await tx
        .selectDistinct({ pekerjaanId: pekerjaanLayananTpuBukti.pekerjaanId })
        .from(pekerjaanLayananTpuBukti)
        .where(inArray(pekerjaanLayananTpuBukti.pekerjaanId, jobs.map((job) => job.id)))
    ).map((row) => row.pekerjaanId),
  );
  const tagihan = await deps.billing.within(tx).tagihanBerlaku(first.tagihanId);
  const dibayar = tagihan?.status === "lunas";
  const dihentikan = jobs.filter((job) => bisaDibatalkan(job, dimulai));

  // The line each job gives back, found before anything is written, so a paid Tagihan with no line for a job refuses the call whole.
  const barisPekerjaan = new Map<string, BarisPengembalian>();
  for (const job of dihentikan) {
    // A redo is its original's line again, and the original keeps its price: the redo has nothing of its own to return.
    if (!dibayar || !tagihan || job.kerjaUlangDariId !== null) continue;
    const line = await barisTagihanPekerjaanTpu(tx, tagihan.lines, job);
    if (!line) return { ok: false, reason: "baris_tidak_ditemukan" };
    const amount = nilaiDibayarBaris(tagihan.lines, line);
    if (amount > 0) barisPekerjaan.set(job.id, { label: line.label, amount, lokasiId: line.provider.kind === "lokasi_mitra" ? line.provider.lokasiId : null });
  }

  const now = deps.clock.now();
  const dibatalkan = new Set<string>();
  const baris: BarisPengembalian[] = [];
  for (const job of dihentikan) {
    const berubah = await tx
      .update(pekerjaanLayananTpu)
      .set({ status: "dibatalkan", dibatalkanAt: now })
      .where(and(eq(pekerjaanLayananTpu.id, job.id), eq(pekerjaanLayananTpu.status, job.status)))
      .returning({ id: pekerjaanLayananTpu.id });
    // The status guard held nothing back: a job somebody else moved since the read is neither refunded nor taken off its Mitra Jasa.
    if (berubah.length === 0) continue;
    dibatalkan.add(job.id);
    await tx
      .update(pekerjaanLayananTpuPenugasan)
      .set({ hasil: "dilepas", dijawabAt: now, alasan: ALASAN_DILEPAS })
      .where(and(eq(pekerjaanLayananTpuPenugasan.pekerjaanId, job.id), inArray(pekerjaanLayananTpuPenugasan.hasil, ["menunggu", "diterima"])));
    const line = barisPekerjaan.get(job.id);
    if (line) baris.push(line);
  }
  const tidakDikembalikan = jobs.filter((job) => job.kerjaUlangDariId === null && !dibatalkan.has(job.id)).length;
  return { ok: true, dibatalkan: dibatalkan.size, baris, tidakDikembalikan };
}
