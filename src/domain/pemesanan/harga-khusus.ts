/**
 * A Harga Khusus on one order (spec, Billing: "Lines carry provider attribution
 * … A Harga Khusus appears as a negative 'Penyesuaian Harga Khusus' line";
 * CONTEXT.md: "A reduction set by hand by Admin Platform on a single order for a
 * family in hardship, shown on the Tagihan as its own negative line beside the
 * normal prices, never as a silently changed price"; Payouts: the Operator bears
 * it "from the Biaya Layanan Platform first, then its own funds" unless a
 * partner share is recorded; ticket 30's AC 3, 4).
 *
 * One step, one transaction: the order's Tagihan is **cancelled and reissued**
 * with its own lines plus the negative Penyesuaian (never edited — an issued
 * Tagihan is immutable, and its replacement keeps the original due date, so the
 * family gains no time), the partner share the Lokasi Mitra agreed to bear is
 * written on the **order**, and both are recorded in the Entri Audit. A Tagihan
 * that comes out at Rp 0 is Lunas at once with its Bukti Pembayaran, as any
 * other issue is (spec, Billing: "A Rp 0 Tagihan is Lunas at issue").
 *
 * The share lives on the order for the reason the reissue gives and the spec
 * repeats: a Tagihan is *replaced* by this very step, so a share kept there would
 * be lost by its own reissue, and Pencairan is computed per order. Payouts reads
 * it, and the direct-payment fact beside it, through `pembayaranOrder`.
 *
 * Who may set one: Admin Platform only. Not an Admin Lokasi: the reduction is
 * the Operator's own decision about money it collects.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { NewTagihanLine, ReissueTagihanResult, Tagihan, TagihanLine } from "@/domain/billing";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { RUPIAH_MAX, rupiahSchema } from "@/lib/rupiah";
import type { PemesananDeps } from "./deps";
import { pemesananMakam } from "./schema";

export const hargaKhususSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  /** What comes off, as a positive amount: the Tagihan shows it as a negative line. */
  jumlah: rupiahSchema.refine((amount) => amount > 0, { message: "Pengurangan harus lebih dari nol" }),
  /** Why this family gets it; the Entri Audit keeps it. */
  alasan: z.string().trim().min(3).max(500),
  /**
   * What the Lokasi Mitra agreed to bear of it, in whole rupiah. Left out, the
   * order keeps the share it already has: a share is not withdrawn by leaving
   * the field empty, and the first Harga Khusus on an order has none, which is
   * the "default 0" the spec names.
   */
  partnerShare: z.number().int().min(0).max(RUPIAH_MAX).optional(),
  /** Why the Lokasi Mitra agreed to bear it: required with a non-zero share, and kept off the order otherwise. */
  partnerShareNote: z.string().trim().max(500).optional(),
});
export type HargaKhususInput = z.input<typeof hargaKhususSchema>;

export type TambahHargaKhususResult =
  | { ok: true; /** The replacement Tagihan, with the Penyesuaian line on it. */ tagihan: Tagihan }
  | WriteRefusal
  /** No reason, no amount, a note without a share, or a malformed field. */
  | { ok: false; reason: "input_tidak_valid" }
  /** No order of that Nomor Pemesanan. */
  | { ok: false; reason: "pesanan_tidak_ditemukan" }
  /** The Lokasi has not confirmed the order, so it has no Tagihan to replace. */
  | { ok: false; reason: "tagihan_belum_ada" }
  /** The order's Tagihan was replaced while this was being entered: nothing is written. */
  | { ok: false; reason: "pesanan_sudah_diganti" }
  /**
   * Billing's own refusals of a reissue, carried out unchanged: the Tagihan is
   * Lunas, Dibatalkan or (pay-first, past its due date) no longer payable, the
   * reduction would take the total below Rp 0, or the new total is out of range.
   */
  | { ok: false; reason: Exclude<ReissueTagihanResult, { ok: true }>["reason"] }
  /** A share was entered with no note. */
  | { ok: false; reason: "partner_share_wajib_ada_catatan" }
  /** A share larger than the reduction it shares. */
  | { ok: false; reason: "partner_share_melebihi_penyesuaian" }
  /** A Pencairan has already been issued for this order, so its share is frozen. */
  | { ok: false, reason: "partner_share_sudah_terkunci" };

/**
 * Admin Platform sets a Harga Khusus on one order. The order's own Tagihan is
 * replaced (never edited) with the reduction as its own negative line, the
 * partner share is written on the order, and both are audited — in the one
 * transaction, so a Tagihan can never be replaced without the share and the audit
 * entry that say why.
 */
export async function tambahHargaKhusus(
  deps: PemesananDeps,
  by: Actor,
  rawInput: unknown,
): Promise<TambahHargaKhususResult> {
  const parsed = hargaKhususSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const share = input.partnerShare;
  const note = input.partnerShareNote?.trim() ?? "";
  // The two rules a share carries are the Operator's and the Lokasi Mitra's own, and the
  // screen says which one an entry breaks.
  if (share === undefined) {
    if (note !== "") return { ok: false, reason: "input_tidak_valid" };
  } else if (share > 0 && note === "") {
    return { ok: false, reason: "partner_share_wajib_ada_catatan" };
  } else if (share > input.jumlah) {
    return { ok: false, reason: "partner_share_melebihi_penyesuaian" };
  }

  const [order] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, input.nomor));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "harga_khusus.ubah", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (!order.tagihanId) return { ok: false, reason: "tagihan_belum_ada" };
  const tagihanId = order.tagihanId;
  // A share is agreed while the money is still with the Operator: once a Pencairan has been
  // issued against it the Lokasi Mitra has been paid, and moving the share would change an
  // amount already transferred (spec, Payouts). The read that says so belongs to the Payouts
  // module and does not exist yet (ticket 32), so nothing supplies it and no order has been paid
  // out; when Payouts lands it is wired here and nothing else changes. Until then the enforceable
  // half of the rule holds on its own: a Harga Khusus needs a reissuable Tagihan, so no share is
  // ever entered on an order that has already been paid.
  if (share !== undefined && (await deps.pencairanTerbit?.(order.nomor))) {
    return { ok: false, reason: "partner_share_sudah_terkunci" };
  }

  const tagihan = await deps.billing.tagihan(tagihanId);
  if (!tagihan) return { ok: false, reason: "tagihan_belum_ada" };
  const lines: NewTagihanLine[] = [...tagihan.lines.map(asNewLine), { kind: "penyesuaian_harga_khusus", amount: input.jumlah }];

  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    // Billing replaces the Tagihan inside this transaction, so the replacement and the
    // order's own state of it commit or roll back together.
    const reissued = await deps.billing.within(tx).reissueTagihan(tagihanId, { lines });
    if (!reissued.ok) return reissued;

    const ditulis = await tx
      .update(pemesananMakam)
      .set({
        tagihanId: reissued.tagihan.id,
        // Only written when a share was entered: a later Harga Khusus without one leaves the
        // share that was agreed standing.
        ...(share === undefined
          ? {}
          : {
              partnerShare: rupiahSchema.parse(share),
              partnerShareNote: share > 0 ? note : null,
              partnerShareOleh: by.accountId,
              partnerSharePada: now,
            }),
      })
      .where(and(eq(pemesananMakam.id, order.id), eq(pemesananMakam.tagihanId, tagihanId)))
      .returning({ id: pemesananMakam.id });
    // Nothing else replaces an order's Tagihan, and this one holds its lock, so this can only
    // fail if it did: a replacement without the order pointing at it would leave the share and
    // the audit entry claiming something that was not written.
    if (ditulis.length === 0) return { ok: false as const, reason: "pesanan_sudah_diganti" as const };

    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "harga_khusus.ubah",
      entity: { kind: "tagihan", id: tagihanId },
      lokasiId: order.lokasiId,
      before: { nomorTagihan: tagihan.nomorTagihan, total: tagihan.total },
      after: { nomorTagihan: reissued.tagihan.nomorTagihan, total: reissued.tagihan.total, penyesuaian: input.jumlah },
      reason: input.alasan,
    });
    if (share !== undefined) {
      await record({
        actor: { accountId: by.accountId, role: "admin_platform" },
        action: "harga_khusus.partner_share",
        entity: { kind: "pemesanan_makam", id: order.id },
        lokasiId: order.lokasiId,
        before: { partnerShare: order.partnerShare ?? 0, partnerShareNote: order.partnerShareNote },
        after: { partnerShare: share, partnerShareNote: share > 0 ? note : null },
        reason: input.alasan,
      });
    }
    return { ok: true as const, tagihan: reissued.tagihan };
  });
}

/**
 * One issued line as the line a replacement Tagihan is issued with, unchanged. A
 * Penyesuaian Harga Khusus already on it is re-issued as the same positive
 * reduction it was entered as, so a second Harga Khusus adds its own line beside
 * the first instead of replacing it.
 */
function asNewLine(line: TagihanLine): NewTagihanLine {
  // A Penyesuaian Harga Khusus is issued as a positive reduction and shown negative, so the
  // earlier one is re-issued as the same positive amount: the branch has to run before the parse,
  // which is there for the amounts the other lines carry (never negative).
  if (line.kind === "penyesuaian_harga_khusus") return { kind: line.kind, amount: rupiahSchema.parse(-line.amount) };
  return { ...line, amount: rupiahSchema.parse(line.amount) };
}
