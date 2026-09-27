/**
 * Giving a Hak Pakai back: one Hak Pakai becomes Dibatalkan and the Petak Makam
 * (or Kavling Keluarga) it held goes back onto the Lokasi Mitra's list as
 * `Tersedia` (spec, Pemesanan > Saat Duka: "Cancelling means Hak Pakai
 * Dibatalkan, Petak Tersedia"; story 34; ticket 24).
 *
 * This is the Inventory module's own write, so a caller never touches its tables:
 * the order that owns the right asks for it by the Hak Pakai's id. There is no
 * actor, for the same reason `lepasTahan` has none — the caller is an order
 * module that has already established whose order this is, and a family acting
 * on its own order is not a staff member to check a role against. The staff entry
 * is the caller's to record; this one records the reason and nothing about a
 * person.
 *
 * Two boundaries are enforced here rather than by the caller, because only this
 * module can see them:
 *
 * - **A Hak Pakai that has a Pemakaman under it is never given back.** A grave
 *   that has been dug is not a plot the Lokasi can sell again, whatever the
 *   order above it says, and ending the right while the body lies in it would
 *   leave a Petak that reads `Tersedia` over an occupied grave. This is the
 *   "before the burial" the cancellation is for, refused with a reason.
 * - **Only an Aktif Hak Pakai can be.** Ending is final (spec, Inventory), so a
 *   Kedaluwarsa, Berakhir or already Dibatalkan one is not this function's to
 *   change: cancelling twice, or cancelling what already ended, is refused.
 */
import { eq } from "drizzle-orm";
import { pemakamanOfHakPakai } from "./hak-pakai-reads";
import type { InventoryDeps } from "./deps";
import { inventoryHakPakai } from "./schema";

export type BatalkanHakPakaiResult =
  | {
      ok: true;
      hakPakaiId: string;
      /** The Petak Makam or Kavling Keluarga the right held; null for one that was recorded without a target. */
      target: { petakId: string | null; kavlingId: string | null };
    }
  | { ok: false; reason: "tidak_ditemukan" }
  /** The Hak Pakai has ended already (Kedaluwarsa, Berakhir or Dibatalkan): ending is final. */
  | { ok: false; reason: "hak_pakai_sudah_berakhir" }
  /** A Pemakaman is recorded under it, so the grave is dug: this cannot be undone by cancelling an order. */
  | { ok: false; reason: "pemakaman_sudah_dicatat" };

/**
 * One Aktif Hak Pakai with no Pemakaman under it becomes Dibatalkan, `now` and
 * the reason kept on it. The Petak's own `Tersedia` is **derived**: a Dibatalkan
 * Hak Pakai holds nothing (see `./status.ts`), so nothing else has to be written
 * for the plot to be sellable again — and nothing can be left half done.
 */
export async function batalkanHakPakai(
  deps: Pick<InventoryDeps, "db" | "clock">,
  input: { hakPakaiId: string; alasan: string },
): Promise<BatalkanHakPakaiResult> {
  const [hakPakai] = await deps.db
    .select()
    .from(inventoryHakPakai)
    .where(eq(inventoryHakPakai.id, input.hakPakaiId));
  if (!hakPakai) return { ok: false, reason: "tidak_ditemukan" };
  if (hakPakai.status !== "aktif") return { ok: false, reason: "hak_pakai_sudah_berakhir" };
  if ((await pemakamanOfHakPakai(deps.db, hakPakai.id)).length > 0) return { ok: false, reason: "pemakaman_sudah_dicatat" };

  const dibatalkan = await deps.db
    .update(inventoryHakPakai)
    .set({ status: "dibatalkan", endReason: input.alasan.trim() === "" ? null : input.alasan.trim() })
    .where(eq(inventoryHakPakai.id, hakPakai.id))
    .returning({ id: inventoryHakPakai.id });
  if (dibatalkan.length === 0) return { ok: false, reason: "tidak_ditemukan" };
  return { ok: true, hakPakaiId: hakPakai.id, target: { petakId: hakPakai.petakId, kavlingId: hakPakai.kavlingId } };
}
