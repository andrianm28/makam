/**
 * Scheduling a job when its money arrives (spec, Billing > Payment: "Every
 * payment issues exactly one Bukti Pembayaran and fires the downstream effects:
 * … Pekerjaan Layanan scheduled"; a standalone Layanan order is pay-first).
 *
 * The order places its jobs in `menunggu_pembayaran` and this moves them to
 * `dijadwalkan` — one per Layanan of the order — in the very transaction that
 * made the Tagihan Lunas. The payment effect is Billing's own seam for exactly
 * this, so a family can never have paid without the work being promised, and the
 * Lokasi can never be asked to work before the money.
 *
 * **The Hak Pakai gate.** A Hak Pakai flagged Perlu Verifikasi must be completed
 * by the Admin Lokasi before its first Layanan is scheduled (spec, Inventory: "The
 * Admin Lokasi must complete it at the latest at the first Perpanjangan or
 * Layanan on that Hak Pakai"). A job on such a Hak Pakai therefore stays
 * `menunggu_pembayaran` and the result says so; that is not a failure, because the
 * Tagihan is Lunas and nothing about the payment went wrong. `jadwalkan` is the
 * one function that moves a job on, so completing the Hak Pakai and scheduling
 * the job it blocked are the same call, and running this twice changes nothing.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { PaymentEffect, SettledPayment } from "@/domain/billing";
import type { Inventory } from "@/domain/inventory";
import { pesananLayanan, pekerjaanLayanan } from "./schema";

/**
 * What scheduling actually needs, and no more: the database, and a grave's Hak
 * Pakai. That narrowness is deliberate — this is registered in the composition
 * root's payment-effect list, which is built before Billing itself (the order
 * issues its Tagihan *through* Billing), so a dependency on the whole Layanan
 * module would close a cycle. What the effect needs is two reads, and two reads
 * are what it takes.
 */
export interface JadwalkanDeps {
  db: Database;
  /** A grave's Hak Pakai, which is what may hold a job back. */
  inventory: Pick<Inventory, "hakPakaiOfUnit">;
}

/** The name a failure of this effect is recorded under, so the worker's retry tick can find it. */
export const EFEK_JADWALKAN = "layanan.jadwalkan_pekerjaan";

/**
 * The Billing payment effect: the payment of an order Layanan's Tagihan schedules
 * that order's jobs. A payment for any other Tagihan is ignored, and a repeat of
 * one already handled is harmless.
 */
export function efekJadwalkanPekerjaan(deps: JadwalkanDeps): PaymentEffect {
  return {
    name: EFEK_JADWALKAN,
    async run(tx, payment) {
      await jadwalkanDariPembayaran(deps, tx, payment);
    },
  };
}

/** What scheduling one order's jobs did. */
export type HasilJadwalkan =
  /** The jobs it moved from Menunggu Pembayaran to Dijadwalkan, and the ones still waiting. */
  | { ok: true; dijadwalkan: number; tertunda: number }
  | { ok: false; reason: "tidak_ditemukan" };

/** The payment of an order's Tagihan, on whatever database the payment is running on. */
async function jadwalkanDariPembayaran(deps: JadwalkanDeps, db: Database, payment: SettledPayment): Promise<void> {
  if (payment.nomorPemesanan === null) return;
  const [order] = await db.select({ id: pesananLayanan.id }).from(pesananLayanan).where(eq(pesananLayanan.nomor, payment.nomorPemesanan));
  // A Tagihan that is not one of ours (every other kind of payment): nothing to do.
  if (!order) return;
  await jadwalkan(db, deps, order.id, payment.paidAt);
}

/**
 * Moves every job of one order that is still `menunggu_pembayaran` to
 * `dijadwalkan` at the moment the money arrived, unless its Hak Pakai is still
 * flagged Perlu Verifikasi — and records the order as `terbayar` either way,
 * because its Tagihan is.
 *
 * Idempotent: a job that has already moved on is matched on its status, so
 * running this for a payment already seen changes nothing.
 */
export async function jadwalkan(db: Database, deps: JadwalkanDeps, pesananId: string, paidAt: Date): Promise<HasilJadwalkan> {
  const [order] = await db.select({ id: pesananLayanan.id, petakId: pesananLayanan.petakId, status: pesananLayanan.status }).from(pesananLayanan).where(eq(pesananLayanan.id, pesananId));
  if (!order) return { ok: false, reason: "tidak_ditemukan" };

  const menunggu = await db
    .select({ id: pekerjaanLayanan.id, itemId: pekerjaanLayanan.pesananItemId })
    .from(pekerjaanLayanan)
    .where(and(eq(pekerjaanLayanan.pesananId, pesananId), eq(pekerjaanLayanan.status, "menunggu_pembayaran")));
  if (menunggu.length === 0) {
    if (order.status !== "terbayar") await db.update(pesananLayanan).set({ status: "terbayar" }).where(eq(pesananLayanan.id, pesananId));
    return { ok: true, dijadwalkan: 0, tertunda: 0 };
  }

  // Read now, never remembered: what blocks a job is the state of the right at
  // the moment it would be scheduled, and the Admin Lokasi may have completed it.
  const hakPakai = await deps.inventory.hakPakaiOfUnit({ petakId: order.petakId });
  const ditahan = hakPakai?.perluVerifikasi ? new Set(menunggu.map((satu) => satu.itemId)) : new Set<string>();
  const boleh = menunggu.filter((satu) => !ditahan.has(satu.itemId));

  for (const satu of boleh) {
    await db
      .update(pekerjaanLayanan)
      .set({ status: "dijadwalkan", dijadwalkanAt: paidAt })
      .where(and(eq(pekerjaanLayanan.id, satu.id), eq(pekerjaanLayanan.status, "menunggu_pembayaran")));
  }
  if (order.status !== "terbayar") await db.update(pesananLayanan).set({ status: "terbayar" }).where(eq(pesananLayanan.id, pesananId));
  return { ok: true, dijadwalkan: boleh.length, tertunda: menunggu.length - boleh.length };
}

/** The order ids whose jobs are still waiting for a Hak Pakai to be completed: what the Admin Lokasi is told. */
export async function pesananTertunda(deps: Pick<JadwalkanDeps, "db" | "inventory">): Promise<{ pesananId: string; nomor: string; lokasiId: string; petakNomor: string }[]> {
  const tertunda = await deps.db
    .select({ pesananId: pekerjaanLayanan.pesananId })
    .from(pekerjaanLayanan)
    .where(eq(pekerjaanLayanan.status, "menunggu_pembayaran"));
  if (tertunda.length === 0) return [];
  const orders = await deps.db
    .select({ id: pesananLayanan.id, nomor: pesananLayanan.nomor, lokasiId: pesananLayanan.lokasiId, petakNomor: pesananLayanan.petakNomor, petakId: pesananLayanan.petakId })
    .from(pesananLayanan)
    .where(inArray(pesananLayanan.id, [...new Set(tertunda.map((satu) => satu.pesananId))]));
  const hasil: { pesananId: string; nomor: string; lokasiId: string; petakNomor: string }[] = [];
  for (const order of orders) {
    if ((await deps.inventory.hakPakaiOfUnit({ petakId: order.petakId }))?.perluVerifikasi) {
      hasil.push({ pesananId: order.id, nomor: order.nomor, lokasiId: order.lokasiId, petakNomor: order.petakNomor });
    }
  }
  return hasil;
}
