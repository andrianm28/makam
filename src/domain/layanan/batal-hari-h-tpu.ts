/**
 * The hari-H Layanan of a Saat Duka TPU order that ends (ticket 117; spec, Pengurusan > cancellation and Layanan >
 * Pekerjaan Layanan at a TPU). The Lokasi Mitra's counterpart is `batalkanLayananPetakDibatalkan`.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { nilaiDibayarBaris } from "@/domain/billing";
import type { LayananDeps } from "./deps";
import { barisTagihanPekerjaanTpu } from "./pengembalian-tpu";
import { keluhanLayananTpu, pekerjaanLayananTpu, pekerjaanLayananTpuBukti, pekerjaanLayananTpuPenugasan } from "./schema";

type Pekerjaan = typeof pekerjaanLayananTpu.$inferSelect;

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
       * Khusus. A redo this call cancelled gives back its original's line, once (owner rule C1, below). Empty while the
       * Tagihan is not paid, and for a job whose paid value is zero.
       */
      baris: BarisPengembalian[];
      /**
       * Original jobs of the order this call did not cancel, so their lines are not in `baris`: those that keep their
       * price, and those cancelled before (their refund, if any, was asked then). An original whose line comes back through
       * its cancelled redo is not among them. Zero means `baris` is the whole of what the order's Layanan can return.
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
 * **A redo ends with its order** (owner rule C1, ticket 121). A redo (kerja ulang after an upheld Keluhan) is its original's line
 * again, and the original waits in Keluhan with a Pencairan item that only the redo's approval would release or cancel. When this
 * call cancels the redo, the family is refunded that Layanan, once, so what the original was still to be paid is cancelled in the
 * same transaction, along with the item of every earlier redo of the same line that was not yet transferred (an item already paid
 * out stays paid). The original that waited in Keluhan for the redo is Dibatalkan with it, so the family's page does not go on
 * saying it will be redone. Nothing is asked of Refunds a second time for a line a Keluhan refund (`dana_kembali`) already
 * returned. A redo already begun keeps going and its pay rules apply as before.
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

  // A redo has no line of its own: it is the line of the job the Layanan was first ordered as (its root), which the family gets back
  // with the cancelled redo. Every job of the order is in `jobs`, because a redo copies its original's order.
  const perId = new Map(jobs.map((job) => [job.id, job] as const));
  const sudahDikembalikan = dihentikan.some((job) => job.kerjaUlangDariId !== null) ? await akarYangSudahDikembalikan(tx, jobs, perId) : new Set<string>();

  // The line each job gives back, found before anything is written, so a paid Tagihan with no line for a job refuses the call whole.
  const barisPekerjaan = new Map<string, BarisPengembalian>();
  for (const job of dihentikan) {
    if (!dibayar || !tagihan) continue;
    const akar = akarOf(perId, job);
    // A line a Keluhan refund already returned is not asked a second time, however many jobs carry it.
    if (barisPekerjaan.has(akar.id) || (akar.id !== job.id && sudahDikembalikan.has(akar.id))) continue;
    const line = await barisTagihanPekerjaanTpu(tx, tagihan.lines, akar);
    if (!line) return { ok: false, reason: "baris_tidak_ditemukan" };
    const amount = nilaiDibayarBaris(tagihan.lines, line);
    if (amount > 0) barisPekerjaan.set(akar.id, { label: line.label, amount, lokasiId: line.provider.kind === "lokasi_mitra" ? line.provider.lokasiId : null });
  }

  const now = deps.clock.now();
  const dibatalkan = new Set<string>();
  /** The originals whose line comes back through the redo this call cancelled. */
  const dikembalikanLewatKerjaUlang = new Set<string>();
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
    const akar = akarOf(perId, job);
    if (job.kerjaUlangDariId !== null) {
      // Owner rule C1: what the original and the redos before this one were still to be paid is not paid. A job already paid out
      // (or cancelled before) is left as it is; Payouts answers `tidak_ditemukan` and nothing is lost by it.
      for (const asal of pendahulu(perId, job)) {
        if (asal.pencairanItemId) await deps.payouts.batalkanItem(tx, { itemId: asal.pencairanItemId, alasan: "pesanan_dibatalkan" });
        // The job waited in Keluhan for this redo: with the redo gone nothing is left to wait for, and the family's page must not go
        // on saying it will be redone. One already Selesai (an earlier redo, approved) keeps that status.
        if (asal.status === "keluhan") {
          const ditutup = await tx
            .update(pekerjaanLayananTpu)
            .set({ status: "dibatalkan", dibatalkanAt: now })
            .where(and(eq(pekerjaanLayananTpu.id, asal.id), eq(pekerjaanLayananTpu.status, "keluhan")))
            .returning({ id: pekerjaanLayananTpu.id });
          if (ditutup.length > 0) dibatalkan.add(asal.id);
        }
      }
      if (barisPekerjaan.has(akar.id)) dikembalikanLewatKerjaUlang.add(akar.id);
    }
    const line = barisPekerjaan.get(akar.id);
    if (line) {
      baris.push(line);
      // The line is the root's whoever carries it: it goes into `baris` once.
      barisPekerjaan.delete(akar.id);
    }
  }
  const tidakDikembalikan = jobs.filter((job) => job.kerjaUlangDariId === null && !dibatalkan.has(job.id) && !dikembalikanLewatKerjaUlang.has(job.id)).length;
  return { ok: true, dibatalkan: dibatalkan.size, baris, tidakDikembalikan };
}

/** The jobs a redo carries on from, nearest first, ending at the job its line was first ordered as. Empty for a job that is no redo. */
function pendahulu(perId: ReadonlyMap<string, Pekerjaan>, job: Pekerjaan): Pekerjaan[] {
  const rantai: Pekerjaan[] = [];
  const dilihat = new Set<string>([job.id]);
  let asalId = job.kerjaUlangDariId;
  while (asalId !== null && !dilihat.has(asalId)) {
    const asal = perId.get(asalId);
    if (!asal) break;
    rantai.push(asal);
    dilihat.add(asal.id);
    asalId = asal.kerjaUlangDariId;
  }
  return rantai;
}

/** The job the Layanan line was first ordered as: the job itself unless it is a redo, then the last of the jobs it carries on from. */
function akarOf(perId: ReadonlyMap<string, Pekerjaan>, job: Pekerjaan): Pekerjaan {
  const rantai = pendahulu(perId, job);
  return rantai.length === 0 ? job : rantai[rantai.length - 1];
}

/** The roots of the order's jobs whose line a Keluhan refund (`dana_kembali`) already returned, by the root's own Keluhan or any redo's. */
async function akarYangSudahDikembalikan(tx: Database, jobs: readonly Pekerjaan[], perId: ReadonlyMap<string, Pekerjaan>): Promise<Set<string>> {
  const dikembalikan = await tx
    .select({ pekerjaanId: keluhanLayananTpu.pekerjaanId })
    .from(keluhanLayananTpu)
    .where(and(inArray(keluhanLayananTpu.pekerjaanId, jobs.map((job) => job.id)), eq(keluhanLayananTpu.status, "dana_kembali")));
  return new Set(
    dikembalikan.flatMap(({ pekerjaanId }) => {
      const job = perId.get(pekerjaanId);
      return job ? [akarOf(perId, job).id] : [];
    }),
  );
}
