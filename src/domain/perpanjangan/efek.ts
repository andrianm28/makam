/**
 * What a payment does to a Perpanjangan (spec, Billing: every payment "fires the
 * downstream effects: Bukti Pemesanan / Perpanjangan, Pencairan due, ... Hak
 * Pakai extended or created"; Perpanjangan: "New end = old end + terms x N ...
 * Applied automatically on payment"; ticket 40).
 *
 * Billing runs this inside the very transaction that makes the Tagihan Lunas, so
 * the new end date, the Bukti Perpanjangan and the request's own paid mark commit
 * with the money. The new end is counted from the end date on record, never from
 * the day of payment, and the same effect serves a payment inside the Masa
 * Tenggang. Whoever paid, the Hak Pakai is the Pemegang Hak's: the payer is not
 * recorded anywhere here and gains nothing.
 *
 * Idempotent: a Perpanjangan already marked paid is left alone, so a redelivered
 * webhook or a retried effect extends nothing twice and issues no second Bukti.
 * The Pencairan item is the Payouts module's own trigger, written from the same
 * payment (`payouts.pencairan_saat_lunas`), due at the instant of payment.
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Billing, PaymentEffect, SettledPayment } from "@/domain/billing";
import { perpanjangan } from "./schema";
import type { PerpanjanganDeps } from "./deps";

export interface EfekPerpanjanganDeps {
  /** Billing on the payment's own transaction, so the Bukti commits with the money. */
  billingOn: (tx: Database) => Pick<Billing, "issueBuktiPerpanjangan">;
  inventory: Pick<PerpanjanganDeps["inventory"], "within">;
  notifikasi: Pick<PerpanjanganDeps["notifikasi"], "buktiPerpanjanganTerbit">;
}

/** The "perpanjangan.hak_pakai_diperpanjang" effect. Ignores a payment that is not a Perpanjangan's, as every effect must. */
export function efekPerpanjangan(deps: EfekPerpanjanganDeps): PaymentEffect {
  return {
    name: "perpanjangan.hak_pakai_diperpanjang",
    async run(tx: Database, payment: SettledPayment) {
      const [row] = await tx.select().from(perpanjangan).where(eq(perpanjangan.tagihanId, payment.tagihanId)).for("update");
      if (!row || row.dibayarPada) return;

      const inventory = deps.inventory.within(tx);
      const diperpanjang = await inventory.perpanjangHakPakai({ hakPakaiId: row.hakPakaiId, terms: row.terms });
      // The Hak Pakai ended or vanished between the order and the payment. The money stays (the payment stands),
      // and the failure is recorded under this effect's name for a human, never swallowed.
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

      await deps.notifikasi.buktiPerpanjanganTerbit({
        perpanjanganId: row.id,
        email: row.email,
        lokasi: { id: row.lokasiId, name: row.lokasiName },
        bukti: { nomor: bukti.bukti.nomor, link: bukti.bukti.link },
        petakNomor: row.petakNomor,
        pemegangHakName: row.pemegangHakName,
        endDateLama: diperpanjang.endDateLama,
        endDateBaru: diperpanjang.endDateBaru,
        terms: row.terms,
      });
    },
  };
}
