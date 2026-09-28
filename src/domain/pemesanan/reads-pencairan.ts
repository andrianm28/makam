/**
 * What a paid Pemesanan Terencana means to the Payouts module (spec, Billing >
 * Payouts > Pencairan items: "Terencana Hak Pakai | end of the Masa Pembatalan, or
 * the first Pemakaman if sooner"; ticket 37).
 *
 * It is a read and not a write on purpose. The Payouts module owns its own items and
 * its own trigger; what it cannot own is a Terencairan order, its Syarat snapshot or
 * its Hak Pakai, and it must not reach into the Pemesanan or Inventory modules' tables
 * to get them. So this read is the whole of the seam: the Payouts module asks for
 * every paid Terencairan and is told, per order, the two facts its own trigger needs.
 *
 * The Masa Pembatalan comes from the order's **own snapshot** (spec, story 44: a later
 * change of the Lokasi Mitra's policy never changes what a family agreed to).
 *
 * The first Pemakaman is deliberately **not** part of this read: it is the Payouts
 * module's own fact, already recorded in `pencairan_pemakaman` by `pemakamanTercatat`
 * (ticket 32), and its Terencairan trigger reads it from there. Asking this module to
 * re-derive it would make one burial two facts, and the two could disagree.
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { TerencanaTerbayar } from "@/domain/payouts";
import { pemesananTerencana, pemesananTerencanaPembayaran } from "./schema";

export interface TerencanaPencairanDeps {
  db: Database;
}

/**
 * Every Terencairan order that is `aktif` with a Lunas Tagihan, with the Masa Pembatalan
 * it was placed under.
 *
 * The `aktif` status is the filter that matters: it is the state the order reaches only
 * once every chosen unit's Hak Pakai exists, so an item can never be created for an
 * order whose right is not granted. Joining the payment fact as well is what makes this
 * the *paid* orders rather than every order that reached a status.
 */
export async function terencanaTerbayar(deps: TerencanaPencairanDeps): Promise<TerencanaTerbayar[]> {
  const orders = await deps.db
    .select({
      nomorPemesanan: pemesananTerencana.nomor,
      tagihanId: pemesananTerencana.tagihanId,
      syarat: pemesananTerencana.syarat,
    })
    .from(pemesananTerencana)
    .innerJoin(pemesananTerencanaPembayaran, eq(pemesananTerencanaPembayaran.nomorPemesanan, pemesananTerencana.nomor))
    .where(eq(pemesananTerencana.status, "aktif"));
  return orders.flatMap((order) =>
    order.tagihanId === null
      ? []
      : [{ nomorPemesanan: order.nomorPemesanan, tagihanId: order.tagihanId, masaPembatalanDays: order.syarat.masaPembatalanDays }],
  );
}
