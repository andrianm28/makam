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
 * change of the Lokasi Mitra's policy never changes what a family agreed to), and the
 * first Pemakaman from the Hak Pakai each chosen unit's right lives on, read through
 * Inventory's public read because the tenure clock starts there (CONTEXT.md).
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Inventory } from "@/domain/inventory";
import type { TerencanaTerbayar } from "@/domain/payouts";
import { pemesananTerencana, pemesananTerencanaPembayaran, pemesananTerencanaUnit } from "./schema";

export interface TerencanaPencairanDeps {
  db: Database;
  /** The first Pemakaman of a Hak Pakai, read through Inventory's own public read. */
  inventory: Pick<Inventory, "firstPemakamanDate">;
}

/**
 * Every Terencairan order whose Tagihan is Lunas and whose Hak Pakai exist — that is,
 * every one that is `aktif` — with the Masa Pembatalan it was placed under and the date
 * of the first Pemakaman under any of its Hak Pakai (null while none is recorded).
 *
 * The `aktif` status is the filter that matters: it is the state the order reaches only
 * once every chosen unit's Hak Pakai exists, so an item can never be created for an
 * order whose right is not granted.
 */
export async function terencanaTerbayar(deps: TerencanaPencairanDeps): Promise<TerencanaTerbayar[]> {
  const orders = await deps.db
    .select({
      nomorPemesanan: pemesananTerencana.nomor,
      tagihanId: pemesananTerencana.tagihanId,
      masaPembatalanDays: pemesananTerencana.syarat,
    })
    .from(pemesananTerencana)
    .innerJoin(pemesananTerencanaPembayaran, eq(pemesananTerencanaPembayaran.nomorPemesanan, pemesananTerencana.nomor))
    .where(eq(pemesananTerencana.status, "aktif"));
  const hasil: TerencanaTerbayar[] = [];
  for (const order of orders) {
    if (order.tagihanId === null) continue;
    const units = await deps.db
      .select({ hakPakaiId: pemesananTerencanaUnit.hakPakaiId })
      .from(pemesananTerencanaUnit)
      .innerJoin(pemesananTerencana, eq(pemesananTerencana.id, pemesananTerencanaUnit.pemesananId))
      .where(eq(pemesananTerencana.nomor, order.nomorPemesanan));
    const tanggal: string[] = [];
    for (const unit of units) {
      if (unit.hakPakaiId === null) continue;
      const pertama = await deps.inventory.firstPemakamanDate(unit.hakPakaiId);
      if (pertama) tanggal.push(pertama);
    }
    hasil.push({
      nomorPemesanan: order.nomorPemesanan,
      tagihanId: order.tagihanId,
      masaPembatalanDays: order.masaPembatalanDays.masaPembatalanDays,
      // The earliest burial under any of the order's rights is the one that may make the
      // item due before the end of the Masa Pembatalan, so a whole date order matters.
      pemakamanPertamaPada: tanggal.sort()[0] ?? null,
    });
  }
  return hasil;
}
