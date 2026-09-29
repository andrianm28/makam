/**
 * What happens to a Pemesanan Terencana's plot hold once the Lokasi Mitra has
 * confirmed the order (spec, Pemesanan > Terencana: Diajukan (plots held) →
 * Dikonfirmasi (hold running, pay-first Tagihan due at hold expiry) → Aktif
 * (paid, one Hak Pakai per Petak / Kavling Keluarga, same Pemegang Hak); ticket
 * 37). Two steps, both driven by the order that owns the right and with no actor
 * of their own, as `lepasTahan` and `batalkanHakPakai` are: the caller has
 * already established whose order this is, and a payment has no staff member
 * behind it to check a role against.
 *
 * - `mulaiTahanBayar` starts the payment hold: it writes the instant the hold
 *   ends onto every plot the order holds, which is what the pay-first Tagihan's
 *   due date is set from. Nothing else about the hold changes: the plots are held
 *   exactly as they were.
 * - `beriHakPakaiDariTahan` turns the hold into the right it was holding for: one
 *   Aktif Hak Pakai per held Petak Makam or Kavling Keluarga, all with the same
 *   Pemegang Hak, each keeping the Syarat it was bought under and the Calon
 *   Penghuni label. The hold is released in the same call, because a plot that
 *   is now Terisi under a live Hak Pakai needs no hold to stay taken.
 *
 * The tenure clock stays unstarted: it starts at the first Pemakaman, as for every
 * Hak Pakai (`grantHakPakai`), so a Terencana right's end date stays empty until
 * the first burial, and for a perpetual Jenis Makam it stays empty for good.
 */
import { eq } from "drizzle-orm";
import type { Tenure } from "@/domain/tariffs";
import type { InventoryDeps } from "./deps";
import { grantHakPakai, type NewPemegangHak } from "./hak-pakai-grant";
import { inventoryKavling, inventoryPetak, inventoryPlotHold, type SyaratHakPakai } from "./schema";

/** Starts the payment hold: every plot `nomorPemesanan` holds is now held until `sampai`. */
export async function mulaiTahanBayar(
  deps: Pick<InventoryDeps, "db">,
  input: { nomorPemesanan: string; sampai: Date },
): Promise<{ ok: true; ditahan: number }> {
  const diperbarui = await deps.db
    .update(inventoryPlotHold)
    .set({ sampai: input.sampai })
    .where(eq(inventoryPlotHold.nomorPemesanan, input.nomorPemesanan))
    .returning({ id: inventoryPlotHold.id });
  return { ok: true, ditahan: diperbarui.length };
}

/** One held unit and the term its Jenis Makam was sold with (null = Selamanya). */
export interface UnitDariTahan {
  petakId?: string;
  kavlingId?: string;
  tenure: Tenure | null;
}

export interface BeriHakPakaiDariTahanInput {
  nomorPemesanan: string;
  /** The Akun that ordered, recorded as the one the Hak Pakai was created for. */
  oleh: { accountId: string };
  pemegangHak: NewPemegangHak;
  /** The living person the plots are prepared for, as a label the Pemegang Hak may change; null when none is named. */
  calonPenghuni: string | null;
  syarat: SyaratHakPakai;
  units: UnitDariTahan[];
}

export type BeriHakPakaiDariTahanResult =
  | {
      ok: true;
      /** One Hak Pakai per unit, in the order the units were given. */
      hakPakai: { petakId: string | null; kavlingId: string | null; hakPakaiId: string }[];
    }
  | { ok: false; reason: "pemegang_hak_kosong" }
  /** A unit the order does not hold (any more): nothing is granted at all. */
  | { ok: false; reason: "tahan_tidak_ada"; unit: string };

/**
 * Grants the Hak Pakai the order's payment bought and releases its hold, all or
 * nothing (call it `within` the payment's own transaction). A unit the order does
 * not hold refuses the whole call before anything is written.
 */
export async function beriHakPakaiDariTahan(deps: InventoryDeps, input: BeriHakPakaiDariTahanInput): Promise<BeriHakPakaiDariTahanResult> {
  if (input.pemegangHak.name.trim() === "") return { ok: false, reason: "pemegang_hak_kosong" };
  const ditahan = await deps.db.select().from(inventoryPlotHold).where(eq(inventoryPlotHold.nomorPemesanan, input.nomorPemesanan));
  const lokasiOf = new Map<string, string>();
  for (const tahan of ditahan) {
    const id = tahan.petakId ?? tahan.kavlingId;
    if (id) lokasiOf.set(id, tahan.lokasiId);
  }
  for (const unit of input.units) {
    const id = unit.petakId ?? unit.kavlingId;
    if (!id || !lokasiOf.has(id)) return { ok: false, reason: "tahan_tidak_ada", unit: id ?? "" };
  }

  const now = deps.clock.now();
  const hakPakai: { petakId: string | null; kavlingId: string | null; hakPakaiId: string }[] = [];
  for (const unit of input.units) {
    const petakId = unit.petakId ?? null;
    const kavlingId = unit.kavlingId ?? null;
    const lokasiId = lokasiOf.get((petakId ?? kavlingId)!)!;
    const hakPakaiId = await grantHakPakai(deps.db, now, input.oleh, {
      lokasiId,
      petakId,
      kavlingId,
      tenure: unit.tenure,
      dataMenyusul: false,
      pemegangHak: input.pemegangHak,
      pemakaman: null,
      syarat: input.syarat,
      calonPenghuni: input.calonPenghuni,
    });
    if (petakId) await deps.db.update(inventoryPetak).set({ firstUsedAt: now }).where(eq(inventoryPetak.id, petakId));
    if (kavlingId) await deps.db.update(inventoryKavling).set({ firstUsedAt: now }).where(eq(inventoryKavling.id, kavlingId));
    hakPakai.push({ petakId, kavlingId, hakPakaiId });
  }
  await deps.db.delete(inventoryPlotHold).where(eq(inventoryPlotHold.nomorPemesanan, input.nomorPemesanan));
  return { ok: true, hakPakai };
}
