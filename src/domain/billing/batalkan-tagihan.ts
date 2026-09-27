/**
 * Cancelling a Tagihan because the thing it was for will not happen (spec,
 * Pemesanan > Saat Duka cancellation; story 34: "after confirmation the Tagihan is
 * cancelled, and any payment already made is refunded except the Biaya Layanan
 * Platform"; ticket 24's AC 6).
 *
 * Billing owns the bill and the money, so this is Billing's own write and the
 * order module asks for it. Two facts make it one function rather than two:
 *
 * - **A Tagihan is immutable once issued.** There is no edit, so cancelling is
 *   the only way a bill ever stops being owed, and the reason it carries
 *   (`pemesanan_dibatalkan`) says to whoever reads the order page later why.
 * - **The money's fate is part of the cancellation, not a follow-up.** If any
 *   came in, the amount to give back is recorded on the Tagihan in the same
 *   commit, less the Biaya Layanan Platform, which is never refunded. A
 *   cancellation that dropped a payment on the floor would leave the family out
 *   of pocket with nothing recording that it owed them; approving and paying that
 *   refund out is ticket 31's, and it reads the two columns this writes.
 */
import { and, eq, sum } from "drizzle-orm";
import { refusable } from "@/db/unit-of-work";
import { RUPIAH_MAX, rupiahFromDatabase, type Rupiah } from "@/lib/rupiah";
import type { Database } from "@/db/client";
import { tagihan, tagihanLine } from "./schema";
import { readTagihan, type Tagihan, type TagihanDeps } from "./tagihan";

/** Why a Tagihan was cancelled besides the two Billing does itself. */
export type BatalkanTagihanAlasan = "pemesanan_dibatalkan";

/** What a refund request waits for: how much, and that it was asked for. */
export interface PermintaanPengembalian {
  /** Whole rupiah to give back, always the paid total less the Biaya Layanan Platform. */
  jumlah: Rupiah;
  /** When the cancellation asked for it (the Clock's now). */
  dimintaPada: Date;
}

export type BatalkanTagihanResult =
  | {
      ok: true;
      tagihan: Tagihan;
      /** The refund this cancellation asks for, or null when no money had come in. */
      pengembalian: PermintaanPengembalian | null;
      /** What the cancellation gave back, so the caller can tell the family. */
      jumlahDikembalikan: Rupiah;
    }
  | { ok: false; reason: "tidak_ditemukan" }
  /** The Tagihan is already Dibatalkan: there is nothing left to cancel. */
  | { ok: false; reason: "tagihan_sudah_dibatalkan" };

/**
 * Cancels one Tagihan and, in the same transaction, records the refund of any
 * payment it already had. The amount is the payment's own less every
 * Biaya Layanan Platform line on the bill: the Operator's fee is for the
 * convenience it provided and is never given back (spec, story 34; the same rule
 * the Terencana Pembatalan follows).
 */
export async function batalkanTagihan(
  deps: TagihanDeps,
  tagihanId: string,
  input: { alasan: BatalkanTagihanAlasan },
  now: Date,
): Promise<BatalkanTagihanResult> {
  return refusable<BatalkanTagihanResult>(deps.db, async (tx) => {
    const [row] = await tx.select().from(tagihan).where(eq(tagihan.id, tagihanId)).for("update");
    if (!row) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (row.status === "dibatalkan") return { ok: false as const, reason: "tagihan_sudah_dibatalkan" as const };

    // What the family is given back: the paid total less the Operator's own fee.
    const dibayar = row.paidAt === null ? null : await dikembalikan(tx, row);
    await tx
      .update(tagihan)
      .set({
        status: "dibatalkan",
        cancelledAt: now,
        cancelledReason: input.alasan,
        pengembalianDimintaAt: dibayar !== null ? now : null,
        pengembalianJumlah: dibayar,
      })
      .where(and(eq(tagihan.id, row.id), eq(tagihan.status, row.status)));
    const cancelled = await readTagihan(tx, row.id);
    if (!cancelled) throw new Error("cancelled Tagihan not found");
    return {
      ok: true as const,
      tagihan: cancelled,
      pengembalian: dibayar !== null ? { jumlah: dibayar, dimintaPada: now } : null,
      jumlahDikembalikan: dibayar ?? (0 as Rupiah),
    };
  });
}

/**
 * The whole rupiah to return on a paid Tagihan: its total less the sum of its
 * Biaya Layanan Platform lines, never below zero (a bill whose fee is its whole
 * total gives nothing back, and says so by having no refund to ask for).
 */
async function dikembalikan(tx: Database, row: typeof tagihan.$inferSelect): Promise<Rupiah | null> {
  const [platform] = await tx
    .select({ total: sum(tagihanLine.amount) })
    .from(tagihanLine)
    .where(and(eq(tagihanLine.tagihanId, row.id), eq(tagihanLine.kind, "biaya_layanan_platform")));
  const fee = Number(platform?.total ?? 0);
  const kembali = row.total - fee;
  if (kembali <= 0) return null;
  if (kembali > RUPIAH_MAX) throw new Error("a refund cannot be larger than the Tagihan's own total");
  return rupiahFromDatabase(String(kembali));
}
