/**
 * Reversing "Dibayar langsung ke Lokasi Mitra" (spec, Billing > Payment:
 * "'Dibayar langsung ke Lokasi Mitra' by the Admin Lokasi with proof,
 * reversible by Admin Platform"; ticket 30's AC 2).
 *
 * Billing's own record of the payment (the Tagihan, its Bukti Pembayaran, the
 * "diterima oleh Lokasi Mitra X" method) is never touched: those are append-only
 * and the family really was told the money went to the Lokasi. What this
 * reverses is Payouts' own read of that fact — the platform-fee Potongan it
 * raised instead of a tariff Pencairan (`trigger.ts`'s `potongLangsung`) — so a
 * mistaken record does not leave the Lokasi permanently short its tariff.
 *
 * Two states, two different reversals:
 * - **The tick has not run yet** (no Potongan exists for this Tagihan): only
 *   `pencairan_pembayaran.dibayar_langsung_dibatalkan_pada` is set, so the next
 *   tick creates the Lokasi's ordinary tariff items instead of a Potongan.
 * - **The tick already raised the Potongan and it is still `berjalan`**: it
 *   moves to `dibatalkan` (never deleted — a Potongan a Bukti Pencairan has
 *   already netted, or that Admin Platform already recorded paid offline, is
 *   money that already moved and is refused instead: `sudah_dipotong`).
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { paymentMethodSchema } from "@/domain/billing";
import { pencairanResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { pencairanPembayaran, potongan } from "./schema";

export interface PembayaranLangsungDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
}

export type BatalkanPembayaranLangsungResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  /** The Tagihan was not settled as "Dibayar langsung ke Lokasi Mitra": there is nothing to reverse. */
  | { ok: false; reason: "bukan_dibayar_langsung" }
  | { ok: false; reason: "sudah_dibatalkan" }
  /** Its Potongan was already netted in a Bukti Pencairan, or recorded paid offline: that money already moved. */
  | { ok: false; reason: "sudah_dipotong" };

/**
 * Admin Platform reverses a "Dibayar langsung ke Lokasi Mitra" record (AC 2).
 * Audited. `tagihanId` is Billing's Tagihan id, exactly what
 * `efekPencairanSaatLunas` keyed `pencairan_pembayaran` on.
 */
export async function batalkanPembayaranLangsung(
  deps: PembayaranLangsungDeps,
  by: Actor,
  input: { tagihanId: string },
): Promise<BatalkanPembayaranLangsungResult> {
  const refusal = writeRefusal(by, "pencairan.kelola", pencairanResource());
  if (refusal) return refusal;
  const parsed = z.object({ tagihanId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tidak_ditemukan" };
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(pencairanPembayaran).where(eq(pencairanPembayaran.tagihanId, parsed.data.tagihanId)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" } as const;
    const metode = paymentMethodSchema.safeParse(row.metode);
    if (!metode.success || metode.data.kind !== "langsung_ke_lokasi") return { ok: false, reason: "bukan_dibayar_langsung" } as const;
    if (row.dibayarLangsungDibatalkanPada) return { ok: false, reason: "sudah_dibatalkan" } as const;

    const [debt] = row.nomorPemesanan
      ? await tx
          .select()
          .from(potongan)
          .where(eq(potongan.sumberTagihanId, parsed.data.tagihanId))
          .for("update")
      : [];
    let lokasiId: string | null = debt?.lokasiId ?? null;
    if (debt) {
      if (debt.status !== "berjalan") return { ok: false, reason: "sudah_dipotong" } as const;
      await tx.update(potongan).set({ status: "dibatalkan" }).where(eq(potongan.id, debt.id));
      lokasiId = debt.lokasiId;
    }
    await tx.update(pencairanPembayaran).set({ dibayarLangsungDibatalkanPada: now }).where(eq(pencairanPembayaran.tagihanId, row.tagihanId));

    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tagihan.batalkan_pembayaran_langsung",
      entity: { kind: "pencairan_pembayaran", id: row.tagihanId },
      lokasiId,
      before: { potonganId: debt?.id ?? null, potonganStatus: debt?.status ?? null },
      after: { dibayarLangsungDibatalkanPada: now },
      reason: null,
    });
    return { ok: true } as const;
  });
}
