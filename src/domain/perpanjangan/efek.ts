/**
 * What a payment does to a Perpanjangan (spec, Billing: every payment "fires the
 * downstream effects: Bukti Pemesanan / Perpanjangan, Pencairan due, ... Hak
 * Pakai extended or created"; Perpanjangan: "New end = old end + terms x N ...
 * Applied automatically on payment"; ticket 40).
 *
 * Billing runs this inside the very transaction that makes the Tagihan Lunas, so
 * the new end date, the Bukti Perpanjangan, the family's email and the request's
 * own paid mark commit with the money. The new end is counted from the end date
 * on record, never from the day of payment, and the same effect serves a payment
 * inside the Masa Tenggang. Whoever paid, the Hak Pakai is the Pemegang Hak's:
 * the payer is not recorded anywhere here and gains nothing.
 *
 * A payment that arrives once the Hak Pakai has ended, or once its Masa Tenggang
 * is over, is **not applied** (owner's decision, 2026-09-29): the money stays
 * recorded and becomes a Pembayaran Perlu Ditinjau for Admin Platform to apply by
 * hand or refund, the pattern of a late payment. It does not fail and is never
 * retried, so a retry cannot apply it after the fact.
 *
 * Idempotent: a Perpanjangan already marked paid or already sent for review is
 * left alone, so a redelivered webhook or a retried effect extends nothing twice
 * and issues no second Bukti. The Pencairan item is Payouts' own trigger, written
 * from the same payment and skipped while the payment is under review.
 */
import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Billing, PaymentEffect, SettledPayment } from "@/domain/billing";
import { wibDateOf } from "@/lib/time/jakarta";
import { tambahBulan } from "./aturan";
import type { PerpanjanganDeps } from "./deps";
import { perpanjangan } from "./schema";

export interface EfekPerpanjanganDeps {
  /** Billing on the payment's own transaction, so the Bukti and the review commit with the money. */
  billingOn: (tx: Database) => Pick<Billing, "issueBuktiPerpanjangan" | "catatPembayaranPerluDitinjau" | "rantaiTagihan" | "tagihanBerlaku">;
  inventory: Pick<PerpanjanganDeps["inventory"], "within">;
  lokasi: Pick<PerpanjanganDeps["lokasi"], "aturanPerpanjanganOf">;
  notifikasi: Pick<PerpanjanganDeps["notifikasi"], "buktiPerpanjanganTerbit">;
}

/** The "perpanjangan.hak_pakai_diperpanjang" effect. Ignores a payment that is not a Perpanjangan's, as every effect must. */
export function efekPerpanjangan(deps: EfekPerpanjanganDeps): PaymentEffect {
  return {
    name: "perpanjangan.hak_pakai_diperpanjang",
    async run(tx: Database, payment: SettledPayment) {
      // The Perpanjangan stored the id it was first issued; a Harga Khusus may have replaced it, so the paid Tagihan is matched
      // through its reissue chain, asked of Billing (ticket 93).
      const rantai = await deps.billingOn(tx).rantaiTagihan(payment.tagihanId);
      const [row] = await tx.select().from(perpanjangan).where(inArray(perpanjangan.tagihanId, rantai.length > 0 ? rantai : [payment.tagihanId])).for("update");
      if (!row || row.dibayarPada) return;
      // Only the Tagihan in force, the end of the chain, may extend it: a replaced one was cancelled and is never the paid one.
      if ((await deps.billingOn(tx).tagihanBerlaku(row.tagihanId))?.id !== payment.tagihanId) return;

      const inventory = deps.inventory.within(tx);
      if (!(await masihBisaDiterapkan(deps, row.hakPakaiId, row.lokasiId, payment.paidAt, inventory))) {
        await deps.billingOn(tx).catatPembayaranPerluDitinjau({
          tagihanId: payment.tagihanId,
          kunci: `perpanjangan:${row.id}`,
          referensi: payment.nomorBukti,
          amount: payment.total,
          channel: payment.method.kind,
          paidAt: payment.paidAt,
        });
        return;
      }

      const diperpanjang = await inventory.perpanjangHakPakai({ hakPakaiId: row.hakPakaiId, terms: row.terms });
      if (!diperpanjang.ok) throw new Error(`Perpanjangan ${row.id} could not extend its Hak Pakai: ${diperpanjang.reason}`);

      const bukti = await deps.billingOn(tx).issueBuktiPerpanjangan({
        tagihanId: payment.tagihanId,
        perpanjanganId: row.id,
        lokasiName: row.lokasiName,
        petakNomor: row.petakNomor,
        pemegangHakName: row.pemegangHakName,
        endDateLama: diperpanjang.endDateLama,
        endDateBaru: diperpanjang.endDateBaru,
        terms: row.terms,
      });
      if (!bukti.ok) throw new Error(`Perpanjangan ${row.id} could not issue its Bukti Perpanjangan: ${bukti.reason}`);

      await tx
        .update(perpanjangan)
        .set({
          dibayarPada: payment.paidAt,
          endDateLama: diperpanjang.endDateLama,
          endDateBaru: diperpanjang.endDateBaru,
          buktiId: bukti.bukti.id,
        })
        .where(eq(perpanjangan.id, row.id));

      // Queued in this transaction: a rolled-back payment effect leaves no email behind.
      const diumumkan = await deps.notifikasi.buktiPerpanjanganTerbit(
        {
        perpanjanganId: row.id,
        email: row.email,
        lokasi: { id: row.lokasiId, name: row.lokasiName },
        bukti: { nomor: bukti.bukti.nomor, link: bukti.bukti.link },
        petakNomor: row.petakNomor,
        pemegangHakName: row.pemegangHakName,
        endDateLama: diperpanjang.endDateLama,
        endDateBaru: diperpanjang.endDateBaru,
          terms: row.terms,
        },
        tx,
      );
      if (!diumumkan.ok) throw new Error(`the Bukti Perpanjangan of ${row.id} could not be announced: ${diumumkan.reason}`);
    },
  };
}

/**
 * Whether the payment can still extend the Hak Pakai: it has not ended, it is a
 * fixed term with an end on record, and the payment was made no later than the
 * last day of the Masa Tenggang counted from that end date.
 */
async function masihBisaDiterapkan(
  deps: Pick<EfekPerpanjanganDeps, "lokasi">,
  hakPakaiId: string,
  lokasiId: string,
  paidAt: Date,
  inventory: ReturnType<PerpanjanganDeps["inventory"]["within"]>,
): Promise<boolean> {
  const hak = await inventory.hakPakaiUntukPerpanjangan(hakPakaiId);
  if (!hak || hak.status === "berakhir" || hak.status === "dibatalkan") return false;
  if (hak.tenureYears === null || hak.endDate === null) return false;
  const aturan = await deps.lokasi.aturanPerpanjanganOf(lokasiId);
  if (!aturan) return false;
  return wibDateOf(paidAt) <= tambahBulan(hak.endDate, aturan.masaTenggangMonths);
}
