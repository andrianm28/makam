/**
 * Cancelling a job, and what that costs (spec, Layanan > Pekerjaan Layanan: "Cancel
 * until H-1 or until it starts"; spec, Billing > Refunds: "Whether the Biaya
 * Layanan Platform is refunded: the Pemesan cancels → kept; the fault lies with
 * the Lokasi, the Mitra Jasa or the Operator (Terlambat cancellation, Berhenti
 * leftovers) → refunded").
 *
 * The two windows are the rule this module owns, and they are strict: a family may
 * cancel **until H-1** (through the day before the target date) or **until the job
 * starts**, whichever is sooner. After that the work is somebody's afternoon and
 * nothing is returned.
 *
 * What a cancellation *owes* is decided here too, because only this module knows
 * which line of the Tagihan is this job's and whether the job was the fulfiller's
 * fault. What it writes is a **refund request in the Refunds module**
 * (`ajukanBaris`, in the cancellation's own transaction): the Tagihan, the job's
 * line, and who is at fault, from which Refunds decides whether the Biaya Layanan
 * Platform comes back. Approval, transfer and the Bukti Pengembalian Dana are
 * Refunds' flow; nothing here moves a rupiah.
 *
 * The two cases, as that rule words them:
 *
 * - **the family cancels.** The job's own line comes back; the Biaya Layanan
 *   Platform is kept, because the Operator took the order and that fee is charged
 *   once per Tagihan whatever the Tagihan holds.
 * - **a job already flagged Terlambat is cancelled for the lateness.** The whole
 *   Tagihan comes back, the platform fee included: the fulfiller's failure is not
 *   the family's bill.
 *
 * A job cancelled before its Tagihan is paid has nothing to give back — the
 * Tagihan lapses at its due date by Billing's own rule — so no request is written
 * for it.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import { normaliseEmail } from "@/domain/identity";
import type { Rupiah } from "@/lib/rupiah";
import { addWibDateDays, wibDateOf } from "@/lib/time/jakarta";
import type { LayananDeps, PemesanLayanan } from "./deps";
import { batalkanPekerjaanSchema } from "./pesanan-schema";
import { pengembalianLayanan, pekerjaanLayanan, pesananLayanan, pesananLayananItem, type PekerjaanLayananStatus } from "./schema";

/** The last day a family may still cancel a job targeting this date: H-1, the day before. */
export const batasBatal = (targetDate: string): string => addWibDateDays(targetDate, -1);

/** Whether a family may still cancel this job of its own accord at `now`. */
export function bolehDibatalkan(status: PekerjaanLayananStatus, targetDate: string, now: Date): boolean {
  if (status !== "dijadwalkan") return false;
  return wibDateOf(now) <= batasBatal(targetDate);
}

export type BatalkanPekerjaanResult =
  | {
      ok: true;
      pekerjaan: { id: string; status: "dibatalkan" };
      /**
       * What this cancellation owes, or null where there is nothing to give back (a
       * job whose Tagihan was never paid). It is a request for the refund flow to
       * approve, not a payment.
       */
      pengembalian: PengembalianDiminta | null;
    }
  | { ok: false; reason: BatalkanDitolak };

/** Why a cancellation cannot happen right now. */
export type BatalkanDitolak =
  | "tidak_ditemukan"
  | "input_tidak_valid"
  /** The email is not an Akun's Email Terverifikasi, or the Akun is not that email's. */
  | "bukan_pemesan"
  | "sudah_dibatalkan"
  /** Refunds cannot take the request now (an approved one is still open on the Tagihan): nothing was cancelled. */
  | "pengembalian_tertunda"
  | "sudah_selesai"
  | "di_keluhan"
  /** It has started, or H-1 has passed. */
  | "sudah_dikerjakan";

/** What a cancellation owes, as the refund flow reads it. */
export interface PengembalianDiminta {
  id: string;
  /** The Tagihan the money came in on. */
  tagihanId: string;
  /** The lines to return, each with the wording a Bukti Pengembalian Dana lists. */
  baris: { label: string; amount: number }[];
  total: number;
  /** Whether the Biaya Layanan Platform is in the amount (a lateness refund is a full one). */
  platformDikembalikan: boolean;
}

/**
 * The Pemesan cancels one job, with the reason they give. Only the Pemesan who
 * placed the order may, and only while the job is Dijadwalkan and its target date
 * has not come within H-1.
 *
 * A job already flagged Terlambat may also be cancelled — for the lateness, not
 * for the family's own change of mind — and that is the one case that returns the
 * Biaya Layanan Platform as well. The Admin Platform's refund flow approves and
 * transfers; this writes the request and the status.
 */
export async function batalkanPekerjaan(
  deps: LayananDeps,
  pemesan: PemesanLayanan,
  rawInput: unknown,
): Promise<BatalkanPekerjaanResult> {
  const parsed = batalkanPekerjaanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId, alasan } = parsed.data;

  const email = normaliseEmail(pemesan.email);
  const akun = email === null ? null : await deps.identity.accountByEmail(email);
  if (!akun || akun.id !== pemesan.accountId) return { ok: false, reason: "bukan_pemesan" };

  const [row] = await deps.db
    .select({ job: pekerjaanLayanan, order: pesananLayanan, item: pesananLayananItem })
    .from(pekerjaanLayanan)
    .innerJoin(pesananLayanan, eq(pesananLayanan.id, pekerjaanLayanan.pesananId))
    .innerJoin(pesananLayananItem, eq(pesananLayananItem.id, pekerjaanLayanan.pesananItemId))
    .where(eq(pekerjaanLayanan.id, pekerjaanId));
  // Somebody else's order is "not found", not "not yours": a refusal that named the
  // job would tell a stranger that somebody is being cared for at a known plot.
  if (!row || row.order.pemesanAccountId !== pemesan.accountId) return { ok: false, reason: "tidak_ditemukan" };
  if (row.job.status === "dibatalkan") return { ok: false, reason: "sudah_dibatalkan" };
  if (row.job.status === "selesai") return { ok: false, reason: "sudah_selesai" };
  if (row.job.status === "keluhan") return { ok: false, reason: "di_keluhan" };

  const now = deps.clock.now();
  // A job the Terlambat tick flagged is late: the family is released from it, and
  // what comes back is everything they paid.
  const karenaLateness = row.job.terlambatAt !== null;
  // A job still Menunggu Pembayaran is not cancellable, and deliberately so: the
  // Tagihan is already issued, so a family who changes their mind simply does not
  // pay it and the pay-first Tagihan lapses at its due date. Cancelling it here
  // would let the family pay afterwards for a job that no longer exists.
  if (!karenaLateness && !bolehDibatalkan(row.job.status, row.job.targetDate, now)) return { ok: false, reason: "sudah_dikerjakan" };
  if (row.job.status !== "dijadwalkan" && row.job.status !== "terlambat") return { ok: false, reason: "sudah_dikerjakan" };

  // The status, the refund request here and the refund request in Refunds commit together: a
  // job is never cancelled while its money is left unasked for, and a refusal by Refunds
  // (an approved request still open on the Tagihan) leaves the job exactly as it was.
  const hasil = await refusable<
    | { ok: true; pengembalian: PengembalianDiminta | null }
    | { ok: false; reason: "sudah_dibatalkan" | "pengembalian_tertunda" }
  >(deps.db, async (tx) => {
    const moved = await tx
      .update(pekerjaanLayanan)
      .set({
        status: "dibatalkan",
        dibatalkanAt: now,
        alasanPembatalan: karenaLateness ? "terlambat" : alasan.trim(),
      })
      .where(and(eq(pekerjaanLayanan.id, pekerjaanId), eq(pekerjaanLayanan.status, row.job.status)))
      .returning({ id: pekerjaanLayanan.id });
    if (moved.length === 0) return { ok: false as const, reason: "sudah_dibatalkan" as const };
    const pengembalian = await tulisPengembalian(deps, tx, row, karenaLateness, now);
    if (pengembalian === "tertunda") return { ok: false as const, reason: "pengembalian_tertunda" as const };
    return { ok: true as const, pengembalian };
  });
  if (!hasil.ok) return hasil;
  return { ok: true, pekerjaan: { id: pekerjaanId, status: "dibatalkan" }, pengembalian: hasil.pengembalian };
}

/**
 * The refund request this cancellation writes, or null when the order's Tagihan was
 * never paid: there is then no money to come back.
 *
 * The job's own line is found by **position**, not by matching a label: the order
 * issued its Tagihan lines in its items' order with the platform fee last, so the
 * item at position N is the Tagihan line at position N — exact even when a family
 * orders the same variant twice.
 */
async function tulisPengembalian(
  deps: LayananDeps,
  tx: Database,
  row: {
    job: typeof pekerjaanLayanan.$inferSelect;
    order: typeof pesananLayanan.$inferSelect;
    item: typeof pesananLayananItem.$inferSelect;
  },
  karenaLateness: boolean,
  now: Date,
): Promise<PengembalianDiminta | null | "tertunda"> {
  const tagihan = await deps.billing.within(tx).tagihan(row.order.tagihanId);
  if (!tagihan || tagihan.status !== "lunas") return null;
  const line = tagihan.lines[row.item.posisi];
  if (!line || line.kind !== "layanan" || line.label !== row.item.label) return null;

  // Refunds owns the rule and the request: the job's own line goes in, and whether the Biaya
  // Layanan Platform comes back follows who is at fault (the Pemesan cancelling keeps it, the
  // Lokasi's lateness returns it, once for the Tagihan).
  const diajukan = await deps.refunds.within(tx).ajukanBaris(tagihan.id, {
    pihakBersalah: karenaLateness ? "lokasi" : "pemesan",
    lines: [{ label: line.label, amount: line.amount, lokasiId: line.provider.kind === "lokasi_mitra" ? line.provider.lokasiId : null }],
  });
  if (!diajukan.ok) return "tertunda";
  const baris = diajukan.lines.map((satu) => ({ label: satu.label, amount: satu.amount }));
  const values = {
    pekerjaanId: row.job.id,
    pesananId: row.order.id,
    tagihanId: tagihan.id,
    alasan: karenaLateness ? ("terlambat_batal" as const) : ("pemesan_batal" as const),
    baris,
    total: diajukan.jumlah as Rupiah,
    platformDikembalikan: diajukan.biayaLayananPlatformDikembalikan,
    createdAt: now,
  };
  // One request per job: asking twice must not make the family a refund twice.
  const [ditulis] = await tx.insert(pengembalianLayanan).values(values).onConflictDoNothing().returning({ id: pengembalianLayanan.id });
  const id = ditulis?.id ?? (await tx.select({ id: pengembalianLayanan.id }).from(pengembalianLayanan).where(eq(pengembalianLayanan.pekerjaanId, row.job.id)))[0]?.id;
  if (!id) return null;
  return { id, tagihanId: tagihan.id, baris, total: diajukan.jumlah, platformDikembalikan: diajukan.biayaLayananPlatformDikembalikan };
}

/** One refund request, as the refund flow reads it. */
export interface PengembalianTerbuka extends PengembalianDiminta {
  pesananId: string;
  pekerjaanId: string;
  /** `pemesan_batal` or `terlambat_batal`: which rule produced this amount. */
  alasan: "pemesan_batal" | "terlambat_batal";
  createdAt: Date;
}

/** Every refund request this module has written, oldest first, for the refund flow to work through. */
export async function pengembalianTerbuka(deps: LayananDeps): Promise<PengembalianTerbuka[]> {
  const rows = await deps.db
    .select()
    .from(pengembalianLayanan)
    .orderBy(pengembalianLayanan.createdAt, pengembalianLayanan.id);
  return rows.map((row) => ({
    id: row.id,
    pekerjaanId: row.pekerjaanId,
    pesananId: row.pesananId,
    tagihanId: row.tagihanId,
    alasan: row.alasan,
    baris: row.baris as { label: string; amount: number }[],
    total: row.total,
    platformDikembalikan: row.platformDikembalikan,
    createdAt: row.createdAt,
  }));
}
