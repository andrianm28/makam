/**
 * The pay-after Tagihan's Lewat Jatuh Tempo clock (spec, Billing: "Pay-after
 * Tagihan become Lewat Jatuh Tempo, with the clock counted from the **recorded**
 * burial date. The printed due date of a Saat Duka Tagihan comes from the
 * planned burial date at confirmation; the Tagihan is not reissued if the
 * recorded date differs"; ticket 25's AC 3).
 *
 * Two steps, and they belong to two different moments in a burial's life:
 * `setOverdueAnchor` is called by the module that owns the order in the very
 * transaction that records the burial, and the tick is what turns the anchor
 * into the status the family and the staff see. Neither reissues the Tagihan and
 * neither touches the date printed on it: a Tagihan is immutable once issued, so
 * a burial that went differently changes when the family is chased, never what
 * they were told they owed and by when.
 */
import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import { lewatJatuhTempoAt } from "./due-rules";
import { tagihan } from "./schema";
import { momentOf } from "./shared";

export type SetOverdueAnchorResult =
  | { ok: true; lewatJatuhTempoAt: Date }
  | { ok: false; reason: "tidak_ditemukan" }
  /** The Tagihan's payment moment has no pay-after clock (a pay-first one). */
  | { ok: false; reason: "tidak_pay_after" };

/**
 * Records when this Tagihan first becomes Lewat Jatuh Tempo: `burialRecordedAt`
 * (the instant the burial was recorded, not the day it was planned) plus the
 * window its own payment moment uses — the Lokasi Mitra's Saat Duka payment
 * window, as it stood when the Tagihan was issued. Never moved once set, so a
 * retried or re-run effect cannot postpone a family's deadline.
 */
export async function setOverdueAnchor(
  deps: { db: Database },
  tagihanId: string,
  burialRecordedAt: Date,
): Promise<SetOverdueAnchorResult> {
  return refusable<SetOverdueAnchorResult>(deps.db, async (tx) => {
    if (!z.uuid().safeParse(tagihanId).success) return { ok: false, reason: "tidak_ditemukan" };
    const [row] = await tx.select().from(tagihan).where(eq(tagihan.id, tagihanId)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" };
    if (row.lewatJatuhTempoAt) return { ok: true, lewatJatuhTempoAt: row.lewatJatuhTempoAt };
    const at = lewatJatuhTempoAt(momentOf(row.moment), burialRecordedAt);
    if (!at) return { ok: false, reason: "tidak_pay_after" };
    const [moved] = await tx
      .update(tagihan)
      .set({ lewatJatuhTempoAt: at })
      .where(and(eq(tagihan.id, row.id), isNull(tagihan.lewatJatuhTempoAt)))
      .returning({ lewatJatuhTempoAt: tagihan.lewatJatuhTempoAt });
    return moved?.lewatJatuhTempoAt ? { ok: true, lewatJatuhTempoAt: moved.lewatJatuhTempoAt } : { ok: true, lewatJatuhTempoAt: at };
  });
}

/**
 * Every pay-after Tagihan still Belum Dibayar at its recorded overdue moment
 * becomes Lewat Jatuh Tempo — which keeps it payable (the family may always pay
 * a burial that has already happened; only chasing changes). Idempotent: a
 * Tagihan already marked, or since paid or given up, is left alone. Returns the
 * ids marked by this call.
 */
export async function lewatJatuhTempoPayAfterTagihan(db: Database, now: Date): Promise<string[]> {
  const lewat = await db
    .update(tagihan)
    .set({ status: "lewat_jatuh_tempo" })
    .where(
      and(
        eq(tagihan.kind, "pay_after"),
        eq(tagihan.status, "belum_dibayar"),
        isNotNull(tagihan.lewatJatuhTempoAt),
        lte(tagihan.lewatJatuhTempoAt, now),
      ),
    )
    .returning({ id: tagihan.id });
  return lewat.map((row) => row.id);
}
