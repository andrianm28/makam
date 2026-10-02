/**
 * Ending a Hak Pakai as Berakhir: the Admin Lokasi's own act once a Saat Duka
 * Tagihan against it is Tidak Tertagih (spec, Billing > Chasing: "the Admin
 * Lokasi may end the Hak Pakai"; ticket 29's AC 7). Unlike `batalkanHakPakai`
 * (Dibatalkan, before any Pemakaman), Berakhir is for a Hak Pakai a burial has
 * already happened under: the family never paid, so the right ends, but the
 * grave is not sellable again until a Pembongkaran is recorded (no ticket
 * builds that yet, spec: "the plot stays Terisi until then" — `./status.ts`),
 * which is why this never touches the Petak the way a cancellation does.
 *
 * This is the Inventory module's own write, so a caller never touches its
 * tables: the Pemesanan module asks for it by the Hak Pakai's id, once it has
 * checked the caller is that Lokasi's own Admin Lokasi and that the Tagihan is
 * really Tidak Tertagih — both are the caller's own facts, not this module's.
 * Only an Aktif or a Kedaluwarsa Hak Pakai can be ended (a Kedaluwarsa one is exactly
 * what the Admin Lokasi decides on in its masa tenggang, ticket 42); ending is final.
 */
import { eq } from "drizzle-orm";
import type { InventoryDeps } from "./deps";
import { inventoryHakPakai } from "./schema";

export type AkhiriHakPakaiResult =
  | { ok: true; hakPakaiId: string }
  | { ok: false; reason: "tidak_ditemukan" }
  /** The Hak Pakai has ended already (Kedaluwarsa, Berakhir or Dibatalkan): ending is final. */
  | { ok: false; reason: "hak_pakai_sudah_berakhir" };

/** One Aktif or Kedaluwarsa Hak Pakai becomes Berakhir, with the reason kept on it as `endReason`. No instant is written (`batalkanHakPakai`'s own note applies here too): the order's own row and the Entri Audit its caller records are where a "when and why" lives. */
export async function akhiriHakPakai(
  deps: Pick<InventoryDeps, "db">,
  input: { hakPakaiId: string; alasan: string },
): Promise<AkhiriHakPakaiResult> {
  const [hakPakai] = await deps.db.select().from(inventoryHakPakai).where(eq(inventoryHakPakai.id, input.hakPakaiId));
  if (!hakPakai) return { ok: false, reason: "tidak_ditemukan" };
  if (hakPakai.status !== "aktif" && hakPakai.status !== "kedaluwarsa") return { ok: false, reason: "hak_pakai_sudah_berakhir" };

  const berakhir = await deps.db
    .update(inventoryHakPakai)
    .set({ status: "berakhir", endReason: input.alasan.trim() === "" ? null : input.alasan.trim() })
    .where(eq(inventoryHakPakai.id, hakPakai.id))
    .returning({ id: inventoryHakPakai.id });
  if (berakhir.length === 0) return { ok: false, reason: "tidak_ditemukan" };
  return { ok: true, hakPakaiId: hakPakai.id };
}
