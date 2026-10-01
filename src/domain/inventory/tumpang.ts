/**
 * What "Makamkan di sini" needs to know about an existing Hak Pakai before it
 * asks its Pemegang Hak for consent and before the Admin Lokasi may confirm the
 * burial (spec, Inventory > Hak Pakai / Pemakaman; Pemesanan > Burial under an
 * existing Hak Pakai). One public read, so the Pemesanan module never touches
 * Inventory's tables.
 *
 * It reports the target (one Petak Makam, or a Kavling Keluarga with its member
 * Petak to choose from), the holder the consent goes to, and the two facts the
 * tumpang policy needs: how many are already buried there and the date of the
 * last one. `released` says the Hak Pakai has ended or been cancelled while the
 * plot is not cleared, which is the only case a released plot may still sell as
 * a tumpang.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { inventoryHakPakai, inventoryKavling, inventoryPetak } from "./schema";
import { currentPemegangHak, pemakamanOfHakPakai } from "./hak-pakai-reads";
import type { HakPakaiStatus } from "./status";

export interface TumpangPetak {
  id: string;
  nomorMakam: string;
  jenisMakamId: string | null;
}

export interface HakPakaiTumpang {
  hakPakaiId: string;
  lokasiId: string;
  status: HakPakaiStatus;
  /**
   * The single Petak Makam the right covers; null for a Kavling Keluarga. A
   * tumpang on a Kavling names one of `petakAnggota` instead.
   */
  petak: TumpangPetak | null;
  /** The Kavling Keluarga the right covers; null for a single Petak. */
  kavling: { id: string; nomorKavling: string; jenisMakamId: string; petak: TumpangPetak[] } | null;
  /** The Calon Penghuni a Terencana plot was prepared for, or null. */
  calonPenghuni: string | null;
  pemegangHak: { name: string | null; phoneNumber: string | null; email: string | null } | null;
  /** How many Pemakaman are recorded under this Hak Pakai. */
  layers: number;
  /** The most recent recorded burial ("YYYY-MM-DD"), or null when none. */
  terakhirPemakaman: string | null;
  /** The right has ended or been cancelled while the plot is not cleared: only a tumpang may still be sold. */
  released: boolean;
}

/** One Hak Pakai as "Makamkan di sini" reads it, or null when there is none at that id. */
export async function hakPakaiUntukTumpang(deps: { db: Database }, hakPakaiId: string): Promise<HakPakaiTumpang | null> {
  const [row] = await deps.db.select().from(inventoryHakPakai).where(eq(inventoryHakPakai.id, hakPakaiId));
  if (!row) return null;

  const pemegangHak = await currentPemegangHak(deps.db, hakPakaiId);
  const pemakaman = await pemakamanOfHakPakai(deps.db, hakPakaiId);
  const terakhir = pemakaman.length > 0 ? pemakaman[pemakaman.length - 1]!.date : null;

  let petak: TumpangPetak | null = null;
  let kavling: HakPakaiTumpang["kavling"] = null;
  if (row.petakId) {
    const [found] = await deps.db
      .select({ id: inventoryPetak.id, nomorMakam: inventoryPetak.nomorMakam, jenisMakamId: inventoryPetak.jenisMakamId })
      .from(inventoryPetak)
      .where(eq(inventoryPetak.id, row.petakId));
    petak = found && found.nomorMakam ? { id: found.id, nomorMakam: found.nomorMakam, jenisMakamId: found.jenisMakamId } : null;
  } else if (row.kavlingId) {
    const [kav] = await deps.db.select().from(inventoryKavling).where(eq(inventoryKavling.id, row.kavlingId));
    const anggota = await deps.db
      .select({ id: inventoryPetak.id, nomorMakam: inventoryPetak.nomorMakam, jenisMakamId: inventoryPetak.jenisMakamId })
      .from(inventoryPetak)
      .where(and(eq(inventoryPetak.kavlingId, row.kavlingId), inArray(inventoryPetak.kind, ["petak"])));
    if (kav) {
      kavling = {
        id: kav.id,
        nomorKavling: kav.nomorKavling,
        jenisMakamId: kav.jenisMakamId,
        petak: anggota.flatMap((satu) => (satu.nomorMakam ? [{ id: satu.id, nomorMakam: satu.nomorMakam, jenisMakamId: satu.jenisMakamId }] : [])),
      };
    }
  }

  return {
    hakPakaiId: row.id,
    lokasiId: row.lokasiId,
    status: row.status,
    petak,
    kavling,
    calonPenghuni: row.calonPenghuni,
    pemegangHak: pemegangHak ? { name: pemegangHak.name, phoneNumber: pemegangHak.phoneNumber, email: pemegangHak.email } : null,
    layers: pemakaman.length,
    terakhirPemakaman: terakhir,
    released: row.status === "berakhir" || row.status === "dibatalkan",
  };
}
