/**
 * A payment that was received and recorded but whose effect cannot be applied
 * automatically becomes a Pembayaran Perlu Ditinjau (spec, Billing > Payment: the
 * same pattern as a late payment or one paid after cancellation), so Admin Platform
 * decides by hand: apply it, or refund it. The module that owns the effect calls
 * this `within` the payment's own transaction, so the row commits with the money.
 * Idempotent by its own key: a retried effect records one row, never two.
 */
import { z } from "zod";
import type { Database } from "@/db/client";
import { rupiahSchema } from "@/lib/rupiah";
import { pembayaranPerluDitinjau } from "./schema";

export const catatPembayaranPerluDitinjauSchema = z.object({
  tagihanId: z.uuid(),
  /** What the payment was for and why it was not applied, e.g. "perpanjangan:<id>": one row per key. */
  kunci: z.string().trim().min(1).max(200),
  /** The Bukti Pembayaran number (or the provider's reference) that names the money. */
  referensi: z.string().trim().min(1).max(200),
  amount: rupiahSchema,
  channel: z.string().trim().max(100).nullable(),
  paidAt: z.date(),
});
export type CatatPembayaranPerluDitinjauInput = z.infer<typeof catatPembayaranPerluDitinjauSchema>;

export type CatatPembayaranPerluDitinjauResult = { ok: true; baru: boolean } | { ok: false; reason: "input_tidak_valid" };

/** Records the review of a settled payment that could not be applied, in `db`'s transaction. */
export async function catatPembayaranPerluDitinjau(
  db: Database,
  rawInput: unknown,
  now: Date,
): Promise<CatatPembayaranPerluDitinjauResult> {
  const parsed = catatPembayaranPerluDitinjauSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const inserted = await db
    .insert(pembayaranPerluDitinjau)
    .values({
      reason: "tidak_dapat_diterapkan",
      eventId: `diterapkan:${input.kunci}`,
      providerPaymentId: input.referensi,
      tagihanId: input.tagihanId,
      amount: input.amount,
      channel: input.channel,
      paidAt: input.paidAt,
      receivedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: pembayaranPerluDitinjau.id });
  return { ok: true, baru: inserted.length > 0 };
}
