/**
 * The pay-after Chasing block and Berakhir path on a Saat Duka Hak Pakai
 * (spec, Billing > Chasing; ticket 29's AC 6, 7). Pemesanan owns the link
 * between a Hak Pakai and the Tagihan the Saat Duka confirmation issued for it
 * (`hak_pakai_id` / `tagihan_id` on `pemesanan_makam`), so both live here
 * rather than in Billing (which does not know a Hak Pakai exists) or Inventory
 * (which does not know a Tagihan does).
 *
 * Both are deliberately scoped to the **Saat Duka order's own Tagihan**, never
 * "any Tagihan on this Hak Pakai": a further burial under an existing Hak
 * Pakai (spec, story 56) is its own, later Tagihan, and neither blocking nor
 * ending the right may be driven by it — the spec's "not for a burial under an
 * existing Hak Pakai" (AC 7). Since that order kind is not built yet, the
 * query below can only ever find the grant's own order, which already keeps
 * the scope correct; the comment stays so a later ticket adding it does not
 * widen this by accident.
 */
import { and, eq } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { PemesananDeps } from "./deps";
import { pemesananMakam } from "./schema";

/** The Saat Duka order that granted this Hak Pakai, if any (its own Tagihan is the one Chasing reads). */
async function grantOrderOf(deps: Pick<PemesananDeps, "db">, hakPakaiId: string) {
  const [order] = await deps.db
    .select({ id: pemesananMakam.id, lokasiId: pemesananMakam.lokasiId, tagihanId: pemesananMakam.tagihanId })
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.hakPakaiId, hakPakaiId), eq(pemesananMakam.kind, "saat_duka")));
  return order ?? null;
}

/**
 * The Hak Pakai a Tagihan's own Saat Duka order granted, if it granted one:
 * what the overdue list needs to offer "Akhiri Hak Pakai" against a Tidak
 * Tertagih Tagihan (ticket 29), without exposing the order itself.
 */
export async function hakPakaiIdForTagihan(deps: Pick<PemesananDeps, "db">, tagihanId: string): Promise<string | null> {
  const [order] = await deps.db
    .select({ hakPakaiId: pemesananMakam.hakPakaiId })
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.tagihanId, tagihanId), eq(pemesananMakam.kind, "saat_duka")));
  return order?.hakPakaiId ?? null;
}

/**
 * True while a Lokasi Mitra Saat Duka Tagihan on this Hak Pakai is Lewat
 * Jatuh Tempo (spec, Billing: "While a Lokasi Mitra Saat Duka Tagihan is
 * overdue: Perpanjangan and Ganti Pemegang Hak are blocked"; ticket 29's AC
 * 6). False once it is Tidak Tertagih: from there the Admin Lokasi ends the
 * Hak Pakai instead of renewing it, so nothing is left to block.
 */
export async function isBlockedByOverdueTagihan(
  deps: Pick<PemesananDeps, "db" | "billing">,
  hakPakaiId: string,
): Promise<boolean> {
  const order = await grantOrderOf(deps, hakPakaiId);
  if (!order?.tagihanId) return false;
  const tagihan = await deps.billing.tagihan(order.tagihanId);
  return tagihan?.status === "lewat_jatuh_tempo";
}

export type AkhiriHakPakaiTidakTertagihResult =
  | { ok: true; hakPakaiId: string }
  | WriteRefusal
  /** No Saat Duka order granted this Hak Pakai (or none at all): nothing to end here. */
  | { ok: false; reason: "hak_pakai_tidak_ditemukan" }
  /** The grant order's Tagihan is not (yet) Tidak Tertagih: chasing is not over. */
  | { ok: false; reason: "tagihan_belum_tidak_tertagih" }
  /** Inventory refused it directly (already ended, or gone). */
  | { ok: false; reason: "hak_pakai_sudah_berakhir" };

/**
 * The Admin Lokasi ends a Hak Pakai once its own Lokasi Mitra Saat Duka
 * Tagihan is Tidak Tertagih (spec, Billing > Chasing; ticket 29's AC 7).
 * Audited like every other staff write on an order.
 */
export async function akhiriHakPakaiTidakTertagih(
  deps: PemesananDeps,
  by: Actor,
  input: { hakPakaiId: string; alasan?: string },
): Promise<AkhiriHakPakaiTidakTertagihResult> {
  const order = await grantOrderOf(deps, input.hakPakaiId);
  if (!order) return { ok: false, reason: "hak_pakai_tidak_ditemukan" };
  const refusal = writeRefusal(by, "hak_pakai.akhiri_tidak_tertagih", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (!order.tagihanId) return { ok: false, reason: "hak_pakai_tidak_ditemukan" };
  const tagihan = await deps.billing.tagihan(order.tagihanId);
  if (tagihan?.status !== "tidak_tertagih") return { ok: false, reason: "tagihan_belum_tidak_tertagih" };

  const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const ended = await deps.inventory.within(tx).akhiriHakPakai({
      hakPakaiId: input.hakPakaiId,
      alasan: input.alasan?.trim() || `Tagihan ${tagihan.nomorTagihan} Tidak Tertagih`,
    });
    // Inventory's own "tidak_ditemukan" (a race: the Hak Pakai vanished between
    // the read above and this write) is nothing this module promised in its own
    // result type; it maps onto the same refusal as "not found" here.
    if (!ended.ok) return { ok: false as const, reason: ended.reason === "tidak_ditemukan" ? "hak_pakai_tidak_ditemukan" as const : ended.reason };
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "hak_pakai.akhiri_tidak_tertagih",
      entity: { kind: "hak_pakai", id: input.hakPakaiId },
      lokasiId: order.lokasiId,
      before: { status: "aktif" },
      after: { status: "berakhir", nomorTagihan: tagihan.nomorTagihan },
      reason: input.alasan?.trim() || null,
    });
    return { ok: true as const, hakPakaiId: ended.hakPakaiId };
  });
  return hasil;
}
