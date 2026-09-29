/**
 * Harga Khusus (spec, Billing > Payouts: "Admin Platform sets a Harga Khusus on
 * an order, which cancels and reissues the Tagihan with a negative 'Penyesuaian
 * Harga Khusus' line; a resulting Rp 0 Tagihan is Lunas at once"; ticket 30's
 * AC 3, 4).
 *
 * This is `reissueTagihan` (never an edit) with every one of the Tagihan's own
 * lines carried across unchanged, plus the new negative line — so the family's
 * original tariffs stay exactly as quoted and only the Operator's own
 * adjustment is added. `reissueTagihan` already refuses a pay-first Tagihan
 * that has lapsed (in fact, whether or not the tick has run) and a total that
 * would go negative, so neither is re-checked here (ticket 18 review's rule,
 * generalised for every reissue: "the action is refused with a clear message").
 * A total of Rp 0 is Lunas at once with its own Bukti Pembayaran (`tagihan.ts`'s
 * `issueIn`), which is how AC 4 holds without any extra code here.
 *
 * The partner share is entered on the reissued Tagihan itself (so it is never
 * lost once written), and lowers the order's Pencairan one of two ways,
 * depending on whether the item already exists:
 * - **it usually does not yet**, because a Harga Khusus is only ever set on a
 *   Tagihan that has not been paid (every reissuable Tagihan, by definition),
 *   while a Pencairan item is only ever created once it *is* Lunas. For this,
 *   `payouts/trigger.ts` itself reads the share straight off the Tagihan when
 *   it later creates the item, applying it exactly as `kurangiPencairanPesanan`
 *   would (oldest line first, an emptied line created already cancelled).
 * - **on the rare chance it already does** (a second Harga Khusus after the
 *   first already created one), the very same transaction as the reissue
 *   also calls Payouts' `kurangiPencairanPesanan` — the integration point
 *   ticket 32 built for this ticket (`domain/payouts/item.ts`'s docstring
 *   names it) — tolerating its "tidak_ditemukan" (nothing to lower yet) as
 *   the ordinary case above, not a refusal.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { tagihanResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { OperatorSettings } from "@/domain/operator-settings";
import { rupiahSchema, type Rupiah } from "@/lib/rupiah";
import type { Clock } from "@/ports/clock";
import type { PaymentMoment } from "./due-rules";
import type { EffectDeps } from "./settlement";
import { tagihan as tagihanTable } from "./schema";
import { momentOf } from "./shared";
import { readTagihan, reissueTagihan, type NewTagihanLine, type ReissueTagihanResult, type TagihanLine } from "./tagihan";

export interface HargaKhususDeps extends EffectDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  operatorSettings: Pick<OperatorSettings, "current">;
  /**
   * Lowers one order's Pencairan by the partner share, in the same
   * transaction as the reissue (Payouts' `kurangiPencairanPesanan`, ticket
   * 32). Structurally typed, never imported from Payouts: Payouts already
   * depends on Billing, so the dependency runs this direction only. Left
   * undefined in a composition that never records a non-zero partner share
   * (e.g. a Billing-only test).
   */
  kurangiPencairanPesanan?: (
    tx: Database,
    input: { nomorPemesanan: string; lokasiId: string; amount: number; alasan: "porsi_pemegang_saham"; catatan: string; oleh: string },
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /**
   * Announces the reissued Tagihan to the family, in the same transaction as
   * the reissue (Notifications' `tagihanTerbitPengganti`, ticket 89's pattern).
   * A Harga Khusus reissue sends no confirmation email of its own, so this is
   * the family's only notice and what records the new Tagihan's contact.
   * Structurally typed, never imported from Notifications, which depends on
   * Billing. A refusal never blocks the Harga Khusus. Left undefined where no
   * Notifications is composed.
   */
  umumkanTagihanPengganti?: (
    tx: Database,
    input: {
      tagihanLamaId: string;
      tagihanId: string;
      momentKind: PaymentMoment["kind"];
      bersamaKonfirmasi: boolean;
      nomorTagihan: string;
      nomorPemesanan: string | null;
      perihal: string;
      total: number;
      dueAt: Date;
      link: string;
    },
  ) => Promise<{ ok: boolean }>;
}

export interface TetapkanHargaKhususInput {
  tagihanId: string;
  /** Whole rupiah, positive: how much the Tagihan is reduced by. */
  amount: number;
  /** Why, in words (a staff write, so it always has one). */
  alasan: string;
  /** The share of `amount` the Lokasi Mitra agreed to bear; default 0 (the Operator bears it all). */
  porsiMitra?: number;
  /** Required whenever `porsiMitra` is non-zero. */
  catatanPorsiMitra?: string | null;
}

export type TetapkanHargaKhususResult =
  /** `ReissueTagihanResult`'s own `ok: true`, refusals (not reissuable: paid, cancelled, or a pay-first Tagihan already past its due date) and `IssueRefusal`s. */
  | ReissueTagihanResult
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" }
  | { ok: false; reason: "porsi_melebihi_pengurangan" }
  /** A non-zero partner share was entered on a Tagihan with no order, or no Lokasi Mitra line, to lower the Pencairan of. */
  | { ok: false; reason: "porsi_tidak_berlaku" }
  /** `kurangiPencairanPesanan` refused for a reason other than "no item to lower yet". */
  | { ok: false; reason: "porsi_tidak_dapat_dikurangi" };

const ALASAN_MAX = 500;
const inputSchema = z.object({
  tagihanId: z.uuid(),
  amount: rupiahSchema,
  alasan: z.string().trim().min(1).max(ALASAN_MAX),
  porsiMitra: rupiahSchema.optional(),
  catatanPorsiMitra: z.string().trim().min(1).max(ALASAN_MAX).nullish(),
});

/** A line as issued, turned back into a line to issue: what carries every other line of the Tagihan across unchanged. */
function toNewLine(line: TagihanLine): NewTagihanLine {
  if (line.kind === "penyesuaian_harga_khusus") return { kind: line.kind, amount: -line.amount as Rupiah };
  if (line.kind === "layanan") {
    return {
      kind: line.kind,
      label: line.label,
      amount: line.amount as Rupiah,
      provider: line.provider,
      targetDate: line.targetDate,
      leadTimeDays: line.leadTimeDays,
    };
  }
  return { kind: line.kind, label: line.label, amount: line.amount as Rupiah, provider: line.provider };
}

/** The Lokasi Mitra a Tagihan's own tariff lines name, or null for one with none (a TPU order). */
function lokasiOf(lines: readonly TagihanLine[]): string | null {
  const line = lines.find((entry) => entry.provider.kind === "lokasi_mitra");
  return line && line.provider.kind === "lokasi_mitra" ? line.provider.lokasiId : null;
}

/**
 * Admin Platform sets a Harga Khusus on an order: a required reason, and the
 * Tagihan is cancelled and reissued (never edited) with a new negative
 * "Penyesuaian Harga Khusus" line (AC 3). Audited in the same transaction as
 * the reissue.
 */
export async function tetapkanHargaKhusus(deps: HargaKhususDeps, by: Actor, input: TetapkanHargaKhususInput): Promise<TetapkanHargaKhususResult> {
  const refusal = writeRefusal(by, "tagihan.tetapkan_harga_khusus", tagihanResource());
  if (refusal) return refusal;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || parsed.data.amount === 0) return { ok: false, reason: "input_tidak_valid" };
  const porsiMitra = parsed.data.porsiMitra ?? 0;
  if (porsiMitra > 0 && !parsed.data.catatanPorsiMitra) return { ok: false, reason: "input_tidak_valid" };
  if (porsiMitra > parsed.data.amount) return { ok: false, reason: "porsi_melebihi_pengurangan" };

  const now = deps.clock.now();
  const old = await readTagihan(deps.db, parsed.data.tagihanId);
  if (!old) return { ok: false, reason: "tidak_ditemukan" };
  const lokasiId = lokasiOf(old.lines);
  if (porsiMitra > 0 && (!old.nomorPemesanan || !lokasiId)) return { ok: false, reason: "porsi_tidak_berlaku" };

  const newLines: NewTagihanLine[] = [...old.lines.map(toNewLine), { kind: "penyesuaian_harga_khusus", amount: parsed.data.amount as Rupiah }];

  const [lama] = await deps.db.select({ moment: tagihanTable.moment }).from(tagihanTable).where(eq(tagihanTable.id, old.id));
  const momentKind = momentOf(lama?.moment).kind;

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const reissued = await reissueTagihan(
      { ...deps, db: tx },
      parsed.data.tagihanId,
      {
        lines: newLines,
        hargaKhususPorsiMitra: porsiMitra > 0 ? { amount: porsiMitra as Rupiah, catatan: parsed.data.catatanPorsiMitra! } : null,
        // Announced as soon as it exists, before a Rp 0 settlement's Bukti Pembayaran effect looks for the family's address.
        sebelumBukti: async (txBaru, baru) => {
          if (!deps.umumkanTagihanPengganti) return;
          const diumumkan = await deps.umumkanTagihanPengganti(txBaru, {
            tagihanLamaId: old.id,
            tagihanId: baru.id,
            momentKind: momentKind,
            // A Rp 0 Tagihan is Lunas at once and its Bukti Pembayaran email tells the family: one email, not two.
            bersamaKonfirmasi: baru.total === 0,
            nomorTagihan: baru.nomorTagihan,
            nomorPemesanan: old.nomorPemesanan,
            perihal: old.placeName ? `Pemesanan makam di ${old.placeName}` : "Tagihan Makam.co.id",
            total: baru.total,
            dueAt: baru.dueAt,
            link: baru.link,
          });
          // The Harga Khusus is never blocked by its own announcement.
          if (!diumumkan.ok) deps.reportError?.(new Error("tetapkanHargaKhusus: announcement refused"), { tags: { module: "billing", template: "tagihan_terbit" } });
        },
      },
      now,
    );
    if (!reissued.ok) return reissued;

    if (porsiMitra > 0 && lokasiId && old.nomorPemesanan && deps.kurangiPencairanPesanan) {
      const kurangi = await deps.kurangiPencairanPesanan(tx, {
        nomorPemesanan: old.nomorPemesanan,
        lokasiId,
        amount: porsiMitra,
        alasan: "porsi_pemegang_saham",
        catatan: parsed.data.catatanPorsiMitra!,
        oleh: by.accountId,
      });
      // "tidak_ditemukan" means the order's Pencairan item does not exist yet
      // (the ordinary case: every reissuable Tagihan is unpaid), not an error —
      // the share recorded on the Tagihan above is what lowers it once the
      // item is created. Any other refusal is a real problem and fails the write.
      if (!kurangi.ok && kurangi.reason !== "tidak_ditemukan") {
        return { ok: false, reason: "porsi_tidak_dapat_dikurangi" } as const;
      }
    }

    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tagihan.tetapkan_harga_khusus",
      entity: { kind: "tagihan", id: reissued.tagihan.id },
      lokasiId,
      before: { nomorTagihan: old.nomorTagihan, total: old.total },
      after: { nomorTagihan: reissued.tagihan.nomorTagihan, total: reissued.tagihan.total, amount: parsed.data.amount, porsiMitra },
      reason: parsed.data.alasan,
    });
    return reissued;
  });
}
