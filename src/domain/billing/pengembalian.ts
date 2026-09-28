/**
 * Billing's half of a refund (spec, Billing > Refunds; ticket 31): the Tagihan
 * side, which is the only part of a refund Billing owns.
 *
 * A Tagihan is immutable once issued and `tagihan_line` is immutable for ever, so
 * a refund is never an edit and never a delete — it is a new Bukti Pengembalian
 * Dana (Payouts' row) and **this**: the Tagihan's status moving on to say that
 * the money has gone back, partly or wholly. `bukti_pembayaran` is untouched and
 * stays append-only: a family keeps the receipt for what they paid even after it
 * is returned.
 *
 * The status is decided here rather than by the caller, from the Tagihan's own
 * numbers, because "Dikembalikan sebagian" and "Dikembalikan penuh" are
 * statements about the bill and not about one transfer:
 *
 * - **full** when the refunded amount is the whole of what the Tagihan charged.
 *   A refund whose fault is the Pemesan's never reaches it, because the Biaya
 *   Layanan Platform stays with the Operator, so a Saat Duka cancellation ends
 *   `dikembalikan_sebagian` — which is the truth: part of the bill came back.
 * - **partial** for anything less.
 *
 * Two refusals matter, and both are the point of the function. A Tagihan that
 * never took money is refused, so no status can say a family got back rupiah
 * nobody ever paid; and a Tagihan already `dikembalikan_*` is refused, so the
 * same bill cannot be given back twice.
 *
 * There is no Clock here, and that is deliberate: the function writes no instant
 * (a Tagihan records when it was issued, paid and cancelled, and the refund's own
 * dates are its Bukti's), so a `now` parameter would be a place to read the wall
 * clock for nothing.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import { rupiahSchema, type Rupiah } from "@/lib/rupiah";
import { tagihan } from "./schema";
import { readTagihan, type Tagihan } from "./tagihan";

/** The statuses a transferred refund can leave a Tagihan in. */
const DIKEMBALIKAN = ["dikembalikan_sebagian", "dikembalikan_penuh"] as const;

export type TerimaPengembalianResult =
  | { ok: true; tagihan: Tagihan; /** Whether the whole bill came back. */ penuh: boolean }
  | { ok: false; reason: "tidak_ditemukan" }
  /** The Tagihan never took money, so there is nothing to give back. */
  | { ok: false; reason: "belum_dibayar" }
  /** A refund already came back: the bill may not be given back twice. */
  | { ok: false; reason: "sudah_dikembalikan" }
  /** The amount is Rp 0, or more than the bill charged. */
  | { ok: false; reason: "jumlah_tidak_valid" };

/**
 * Moves one Tagihan to Dikembalikan Sebagian or Dikembalikan Penuh, inside the
 * caller's transaction, because the money leaving the bank and the bill saying so
 * are one fact. `jumlah` is what the transfer was for.
 *
 * **Payouts is the caller** (ticket 31's Refunds flow, in the same transaction
 * that issues the Bukti Pengembalian Dana). Payouts composes after Billing, so
 * this is the direction that dependency can take; the other way round would be a
 * cycle (`src/composition/billing.ts` composes Billing first, and its own file
 * header says why).
 */
export async function terimaPengembalian(
  tx: Database,
  input: { tagihanId: string; jumlah: Rupiah },
): Promise<TerimaPengembalianResult> {
  const parsed = z.object({ tagihanId: z.uuid(), jumlah: rupiahSchema }).safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues[0]?.path[0] === "tagihanId"
      ? { ok: false, reason: "tidak_ditemukan" }
      : { ok: false, reason: "jumlah_tidak_valid" };
  }
  return refusable<TerimaPengembalianResult>(tx, async (inner) => {
    const [row] = await inner.select().from(tagihan).where(eq(tagihan.id, parsed.data.tagihanId)).for("update");
    if (!row) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if ((DIKEMBALIKAN as readonly string[]).includes(row.status)) {
      return { ok: false as const, reason: "sudah_dikembalikan" as const };
    }
    if (row.paidAt === null) return { ok: false as const, reason: "belum_dibayar" as const };
    if (parsed.data.jumlah <= 0 || parsed.data.jumlah > row.total) {
      return { ok: false as const, reason: "jumlah_tidak_valid" as const };
    }

    // Full means the whole bill came back, not "a transfer happened": the fee the
    // Operator kept is exactly what keeps a cancellation's refund partial.
    const penuh = parsed.data.jumlah >= row.total;
    const status = penuh ? "dikembalikan_penuh" : "dikembalikan_sebagian";
    await inner
      .update(tagihan)
      .set({ status })
      .where(and(eq(tagihan.id, row.id), eq(tagihan.status, row.status)));
    const dibaca = await readTagihan(inner, row.id);
    if (!dibaca) throw new Error("the Tagihan just marked refunded was not found");
    return { ok: true as const, tagihan: dibaca, penuh };
  });
}
