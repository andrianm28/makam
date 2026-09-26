/**
 * Internal to the Billing module: settling a Tagihan. Every payment path
 * (provider webhook, manual, direct, Rp 0 at issue) ends here, issuing the
 * payment's one Bukti Pembayaran and firing its downstream effects in the
 * same transaction.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Rupiah } from "@/lib/rupiah";
import { nextDocumentNumber } from "./numbering";
import { buktiPembayaran, paymentEffectFailure, tagihan, type tagihanStatuses } from "./schema";
import { newDocumentLink, paymentMethodSchema, type DocumentHeader, type PaymentMethod } from "./shared";

/** What a downstream effect learns of a payment: the Tagihan now Lunas and its one Bukti Pembayaran. */
export interface SettledPayment {
  tagihanId: string;
  nomorTagihan: string;
  nomorPemesanan: string | null;
  buktiId: string;
  nomorBukti: string;
  paidAt: Date;
  method: PaymentMethod;
}

/**
 * A downstream effect of a payment, registered by the module that owns it
 * (Bukti Pemesanan / Perpanjangan, Pencairan due, Pekerjaan Layanan scheduled,
 * Hak Pakai extended or created). It runs inside the transaction that makes
 * the Tagihan Lunas, so it commits with the payment, and may enqueue its jobs
 * there. It must be idempotent (a failed effect is run again for the same
 * payment) and must ignore a Tagihan that is not its own.
 */
export interface PaymentEffect {
  /** Stable name, e.g. "pemesanan.bukti_pemesanan"; a failure is recorded under it. */
  name: string;
  run(tx: Database, payment: SettledPayment): Promise<void>;
}

/** Where Billing reports what needs a human: a failed downstream effect, money it could not settle. No personal data. */
export type ReportError = (error: unknown, context: Record<string, unknown>) => void;

export interface EffectDeps {
  paymentEffects?: readonly PaymentEffect[];
  reportError?: ReportError;
}

/** A Tagihan still waiting for its money: Lewat Jatuh Tempo and Tidak Tertagih stay payable. */
export const PAYABLE: readonly (typeof tagihanStatuses)[number][] = ["belum_dibayar", "lewat_jatuh_tempo", "tidak_tertagih"];

export type SettleResult =
  /** `settled` is false when the Tagihan was already Lunas: `buktiId` is then its existing Bukti, `reference` that payment's. */
  | { ok: true; buktiId: string; settled: boolean; reference: string | null }
  | { ok: false; reason: "tidak_ditemukan" }
  /** A Dibatalkan Tagihan (lapsed or replaced) can no longer be paid. */
  | { ok: false; reason: "tagihan_dibatalkan" };

/**
 * Settles a Tagihan in `tx`: it becomes Lunas, gets exactly one Bukti
 * Pembayaran and fires its downstream effects. A Tagihan already Lunas is
 * left as it is (its existing Bukti returned), so settling twice is harmless.
 */
export async function settleIn(
  tx: Database,
  deps: EffectDeps,
  tagihanId: string,
  payment: { method: PaymentMethod; reference: string | null; header: DocumentHeader; paidAt: Date },
  now: Date,
): Promise<SettleResult> {
  const [row] = await tx.select().from(tagihan).where(eq(tagihan.id, tagihanId)).for("update");
  if (!row) return { ok: false, reason: "tidak_ditemukan" };
  if (row.status === "lunas") {
    const [existing] = await tx
      .select({ id: buktiPembayaran.id, reference: buktiPembayaran.reference })
      .from(buktiPembayaran)
      .where(eq(buktiPembayaran.tagihanId, row.id))
      .orderBy(asc(buktiPembayaran.paidAt))
      .limit(1);
    return { ok: true, buktiId: existing.id, settled: false, reference: existing.reference };
  }
  if (!PAYABLE.includes(row.status)) return { ok: false, reason: "tagihan_dibatalkan" };
  await tx.update(tagihan).set({ status: "lunas", paidAt: payment.paidAt }).where(eq(tagihan.id, row.id));
  const buktiId = await issueBuktiPembayaranIn(
    tx,
    deps,
    { ...payment, tagihanId: row.id, nomorTagihan: row.nomor, nomorPemesanan: row.nomorPemesanan, amount: row.total },
    now,
  );
  return { ok: true, buktiId, settled: true, reference: payment.reference };
}

/** A Tagihan being settled, as issuing its Bukti Pembayaran needs it. */
export interface Settling {
  tagihanId: string;
  nomorTagihan: string;
  nomorPemesanan: string | null;
  amount: Rupiah;
  method: PaymentMethod;
  reference: string | null;
  header: DocumentHeader;
  paidAt: Date;
}

/**
 * Issues the one Bukti Pembayaran of a payment in `tx` (numbered BYR/…, with
 * its own link), the Tagihan having just become Lunas in `tx`, then fires the
 * payment's downstream effects there. Returns the Bukti's id.
 */
export async function issueBuktiPembayaranIn(tx: Database, deps: EffectDeps, payment: Settling, now: Date): Promise<string> {
  const nomorBukti = await nextDocumentNumber(tx, "BYR", payment.paidAt);
  const [bukti] = await tx
    .insert(buktiPembayaran)
    .values({
      nomor: nomorBukti,
      link: newDocumentLink(),
      tagihanId: payment.tagihanId,
      paidAt: payment.paidAt,
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      header: payment.header,
    })
    .returning({ id: buktiPembayaran.id });
  await runPaymentEffectsIn(
    tx,
    deps,
    {
      tagihanId: payment.tagihanId,
      nomorTagihan: payment.nomorTagihan,
      nomorPemesanan: payment.nomorPemesanan,
      buktiId: bukti.id,
      nomorBukti,
      paidAt: payment.paidAt,
      method: payment.method,
    },
    now,
  );
  return bukti.id;
}

/**
 * Runs every downstream effect of a payment in `tx`, the transaction that made
 * the Tagihan Lunas, each in its own savepoint. A failing effect rolls back
 * only its own changes: the payment stands, and the failure is recorded (to
 * be run again by `retryFailedPaymentEffects`) and reported.
 */
export async function runPaymentEffectsIn(tx: Database, deps: EffectDeps, payment: SettledPayment, now: Date): Promise<void> {
  for (const effect of deps.paymentEffects ?? []) {
    try {
      await tx.transaction((savepoint) => effect.run(savepoint, payment));
    } catch (error) {
      await tx
        .insert(paymentEffectFailure)
        .values({ tagihanId: payment.tagihanId, effect: effect.name, failedAt: now, attempts: 1 })
        .onConflictDoUpdate({
          target: [paymentEffectFailure.tagihanId, paymentEffectFailure.effect],
          set: { failedAt: now, attempts: sql`${paymentEffectFailure.attempts} + 1`, resolvedAt: null },
        });
      deps.reportError?.(error, { event: "billing.payment_effect_failed", effect: effect.name, nomorTagihan: payment.nomorTagihan });
    }
  }
}

/**
 * Runs again every downstream effect that failed and is not yet resolved, each
 * in its own transaction. Idempotent: a resolved failure is left alone, and
 * effects are idempotent themselves. Returns how many were resolved.
 */
export async function retryFailedPaymentEffects(db: Database, deps: EffectDeps, now: Date): Promise<{ resolved: number; failed: number }> {
  const pending = await db
    .select({ tagihanId: paymentEffectFailure.tagihanId, effect: paymentEffectFailure.effect })
    .from(paymentEffectFailure)
    .where(isNull(paymentEffectFailure.resolvedAt))
    .orderBy(asc(paymentEffectFailure.failedAt));
  let resolved = 0;
  let failed = 0;
  for (const failure of pending) {
    const effect = deps.paymentEffects?.find((registered) => registered.name === failure.effect);
    if (!effect) continue;
    const payment = await settledPayment(db, failure.tagihanId);
    if (!payment) continue;
    const key = and(eq(paymentEffectFailure.tagihanId, failure.tagihanId), eq(paymentEffectFailure.effect, failure.effect));
    try {
      await db.transaction(async (tx) => {
        await effect.run(tx, payment);
        await tx.update(paymentEffectFailure).set({ resolvedAt: now }).where(key);
      });
      resolved += 1;
    } catch (error) {
      failed += 1;
      await db
        .update(paymentEffectFailure)
        .set({ failedAt: now, attempts: sql`${paymentEffectFailure.attempts} + 1` })
        .where(key);
      deps.reportError?.(error, { event: "billing.payment_effect_failed", effect: effect.name, nomorTagihan: payment.nomorTagihan });
    }
  }
  return { resolved, failed };
}

/** The settled payment of a Lunas Tagihan (its first Bukti Pembayaran), or null. */
async function settledPayment(db: Database, tagihanId: string): Promise<SettledPayment | null> {
  const [row] = await db
    .select({
      tagihanId: tagihan.id,
      nomorTagihan: tagihan.nomor,
      nomorPemesanan: tagihan.nomorPemesanan,
      buktiId: buktiPembayaran.id,
      nomorBukti: buktiPembayaran.nomor,
      paidAt: buktiPembayaran.paidAt,
      method: buktiPembayaran.method,
    })
    .from(tagihan)
    .innerJoin(buktiPembayaran, eq(buktiPembayaran.tagihanId, tagihan.id))
    .where(and(eq(tagihan.id, tagihanId), eq(tagihan.status, "lunas")))
    .orderBy(asc(buktiPembayaran.paidAt))
    .limit(1);
  return row ? { ...row, method: paymentMethodSchema.parse(row.method) as PaymentMethod } : null;
}
