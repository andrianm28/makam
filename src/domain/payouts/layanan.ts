/**
 * The Layanan half of the Pencairan trigger (spec, Billing > Payouts: "Layanan (Lokasi
 * Mitra or Mitra Jasa) | Lunas **and** the Keluhan window closes with no Keluhan, a
 * Keluhan is rejected, or the redo proof is shown"; ticket 51).
 *
 * Two facts make a Layanan item due, and this module owns neither of them alone:
 * the Lunas half is the payment effect's and the tick's (`./trigger.ts` writes the
 * item, `belum_jatuh_tempo`, once a Layanan-only order is paid), and the job half is
 * the Layanan module's, which knows when a job's window closed. Payouts cannot see a
 * job, so the Layanan module names the Tagihan and the line the job came from and asks
 * for that one item to become due. Both orders are safe: an item that does not exist
 * yet (the money has not arrived) answers "belum_ada" and the caller asks again on its
 * next tick, which is why the Layanan side is a tick and not a one-shot call.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { toBarisItem, type BarisItemPencairan } from "./baca";
import { itemJatuhTempo } from "./item";
import { pencairanItem, pencairanPembayaran, type PencairanItemStatus } from "./schema";

/** One Layanan item as the Layanan module reads it: what it is, where it stands, what it pays. */
export interface ItemLayanan extends BarisItemPencairan {
  status: PencairanItemStatus;
}

/** The item a Tagihan's Layanan line produced, or null while there is none (not paid yet, or paid straight to the Lokasi). */
export async function itemLayananOf(db: Database, tagihanId: string, tagihanPosisi: number): Promise<ItemLayanan | null> {
  if (!z.uuid().safeParse(tagihanId).success || !Number.isInteger(tagihanPosisi) || tagihanPosisi < 0) return null;
  const [row] = await db
    .select()
    .from(pencairanItem)
    .where(and(eq(pencairanItem.tagihanId, tagihanId), eq(pencairanItem.tagihanPosisi, tagihanPosisi), eq(pencairanItem.kind, "layanan")));
  return row ? { ...toBarisItem(row), status: row.status } : null;
}

/** One Layanan item by its id (a Mitra Jasa's job records the id on the job), or null when there is none. */
export async function itemLayananById(db: Database, itemId: string): Promise<ItemLayanan | null> {
  if (!z.uuid().safeParse(itemId).success) return null;
  const [row] = await db.select().from(pencairanItem).where(and(eq(pencairanItem.id, itemId), eq(pencairanItem.kind, "layanan")));
  return row ? { ...toBarisItem(row), status: row.status } : null;
}

export type LayananJatuhTempoResult =
  /** The item is now due, with the 2 Hari Kerja deadline stamped. */
  | { ok: true; hasil: "jatuh_tempo"; itemId: string }
  /** Nothing to do: the item was already due, transferred or cancelled (a refund took it). */
  | { ok: true; hasil: "sudah"; itemId: string }
  /** The order was paid straight to the Lokasi Mitra: no tariff Pencairan exists, and none will. */
  | { ok: true; hasil: "tidak_ada" }
  /** There is no item yet (the Tagihan is not paid, or the tick has not written it): ask again later. */
  | { ok: false; reason: "belum_ada" };

/**
 * Makes one Layanan line's item due, on the caller's transaction. Idempotent: an item
 * already due, transferred or cancelled is left alone and reported as `sudah`.
 */
export async function jadikanLayananJatuhTempo(
  tx: Database,
  input: { tagihanId: string; tagihanPosisi: number },
  waktu: { now: Date; jatuhTempoAt: () => Promise<Date> },
): Promise<LayananJatuhTempoResult> {
  const item = await itemLayananOf(tx, input.tagihanId, input.tagihanPosisi);
  if (!item) {
    const [pembayaran] = await tx
      .select({ metode: pencairanPembayaran.metode, dibatalkan: pencairanPembayaran.dibayarLangsungDibatalkanPada })
      .from(pencairanPembayaran)
      .where(eq(pencairanPembayaran.tagihanId, input.tagihanId));
    const langsung = pembayaran && (pembayaran.metode as { kind?: string }).kind === "langsung_ke_lokasi" && !pembayaran.dibatalkan;
    return langsung ? { ok: true, hasil: "tidak_ada" } : { ok: false, reason: "belum_ada" };
  }
  if (item.status !== "belum_jatuh_tempo") return { ok: true, hasil: "sudah", itemId: item.id };
  const moved = await itemJatuhTempo(tx, item.id, { now: waktu.now, jatuhTempoAt: await waktu.jatuhTempoAt() });
  return moved.ok ? { ok: true, hasil: "jatuh_tempo", itemId: item.id } : { ok: true, hasil: "sudah", itemId: item.id };
}
