/**
 * Pengembalian Hak Pakai and the Calon Penghuni label (spec, Inventory >
 * Operasi; stories 103 and 105; ticket 39).
 *
 * `kembalikanHakPakai` is the Inventory module's own write that completes a
 * Pengembalian: one Aktif Hak Pakai with **no Pemakaman** under it becomes
 * Berakhir with the reason Pengembalian, and because nothing is buried the plot
 * it held reads Tersedia again at once (`./status.ts`). No money moves: the spec
 * says compensation is agreed directly with the Lokasi, so this writes no
 * amount. Like `batalkanHakPakai` it has no actor — the Pemesanan module has
 * already checked whose Hak Pakai this is and which Admin Lokasi approved it.
 *
 * `ubahCalonPenghuni` is the Pemegang Hak's own free change of one plot's label
 * (spec: "the Pemegang Hak changes it freely; the Lokasi is notified, with no
 * review"). The caller has already checked the Akun is that holder; the label
 * itself is all this write touches, so the notification stays the caller's.
 */
import { eq } from "drizzle-orm";
import { pemakamanOfHakPakai } from "./hak-pakai-reads";
import type { InventoryDeps } from "./deps";
import { inventoryHakPakai } from "./schema";
import { PENGEMBALIAN_END_REASON } from "./status";

export type KembalikanHakPakaiResult =
  | { ok: true; hakPakaiId: string }
  | { ok: false; reason: "tidak_ditemukan" }
  /** The Hak Pakai has ended already (Kedaluwarsa, Berakhir or Dibatalkan): ending is final. */
  | { ok: false; reason: "hak_pakai_sudah_berakhir" }
  /** A Pemakaman is recorded under it: a plot with a grave under it is never given back, only sold on. */
  | { ok: false; reason: "pemakaman_sudah_dicatat" };

/** One Aktif Hak Pakai with no Pemakaman becomes Berakhir (reason Pengembalian); the plot reads Tersedia. */
export async function kembalikanHakPakai(
  deps: Pick<InventoryDeps, "db">,
  input: { hakPakaiId: string },
): Promise<KembalikanHakPakaiResult> {
  const [hakPakai] = await deps.db.select().from(inventoryHakPakai).where(eq(inventoryHakPakai.id, input.hakPakaiId));
  if (!hakPakai) return { ok: false, reason: "tidak_ditemukan" };
  if (hakPakai.status !== "aktif") return { ok: false, reason: "hak_pakai_sudah_berakhir" };
  if ((await pemakamanOfHakPakai(deps.db, hakPakai.id)).length > 0) return { ok: false, reason: "pemakaman_sudah_dicatat" };

  const berakhir = await deps.db
    .update(inventoryHakPakai)
    .set({ status: "berakhir", endReason: PENGEMBALIAN_END_REASON })
    .where(eq(inventoryHakPakai.id, hakPakai.id))
    .returning({ id: inventoryHakPakai.id });
  if (berakhir.length === 0) return { ok: false, reason: "tidak_ditemukan" };
  return { ok: true, hakPakaiId: hakPakai.id };
}

export type UbahCalonPenghuniResult =
  | { ok: true; calonPenghuni: string | null }
  | { ok: false; reason: "tidak_ditemukan" }
  /** A label only means something on a right that still stands. */
  | { ok: false; reason: "hak_pakai_sudah_berakhir" };

/** Sets one Hak Pakai's Calon Penghuni label (or clears it with null); no review, no history kept. */
export async function ubahCalonPenghuni(
  deps: Pick<InventoryDeps, "db">,
  input: { hakPakaiId: string; label: string | null },
): Promise<UbahCalonPenghuniResult> {
  const [hakPakai] = await deps.db.select({ id: inventoryHakPakai.id, status: inventoryHakPakai.status }).from(inventoryHakPakai).where(eq(inventoryHakPakai.id, input.hakPakaiId));
  if (!hakPakai) return { ok: false, reason: "tidak_ditemukan" };
  if (hakPakai.status === "berakhir" || hakPakai.status === "dibatalkan") return { ok: false, reason: "hak_pakai_sudah_berakhir" };
  await deps.db.update(inventoryHakPakai).set({ calonPenghuni: input.label }).where(eq(inventoryHakPakai.id, hakPakai.id));
  return { ok: true, calonPenghuni: input.label };
}
