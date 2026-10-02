/**
 * Pure derivation of Petak Makam and Kavling Keluarga status (spec, Inventory
 * > Denah): never stored, always computed from the Petak/Kavling row and its
 * current Hak Pakai (if any). Kept free of the database so every case is a
 * plain unit test.
 */
import type { inventoryHakPakaiStatuses } from "./schema";

export type HakPakaiStatus = (typeof inventoryHakPakaiStatuses)[number];

/** The `endReason` a Pengembalian Hak Pakai writes (spec, Inventory > Operasi; ticket 39). */
export const PENGEMBALIAN_END_REASON = "Pengembalian";

export type PetakStatus = "tersedia" | "dipesan" | "terisi" | "masa_berlaku_habis" | "tidak_tersedia";
export type KavlingStatus = "tersedia" | "dipesan" | "terpakai_sebagian" | "penuh";

/**
 * The current Hak Pakai of a Petak or Kavling, as status derivation needs it.
 * `pembongkaranAt` is set once a Pembongkaran is recorded after a Berakhir
 * Hak Pakai (spec: the plot stays Terisi until then) — no later ticket builds
 * recording one yet, so every caller in this ticket passes `null`.
 */
export interface ActiveHakPakaiForStatus {
  status: HakPakaiStatus;
  pembongkaranAt: Date | null;
  /**
   * Why a Berakhir Hak Pakai ended. A Pengembalian ends one with **no
   * Pemakaman** under it (spec, Inventory > Pengembalian Hak Pakai), so the
   * plot is sellable again at once and needs no Pembongkaran.
   */
  endReason?: string | null;
}

/**
 * A Petak Makam's derived status. `tidakTersediaReason` is read only when
 * `hakPakai` is null (spec: Tidak Tersedia is manual and only without an
 * active Hak Pakai); Perlu Verifikasi is a separate flag on top of this
 * (an empty Petak can be nominally Tersedia yet still not assignable).
 */
export function derivePetakStatus(input: { tidakTersediaReason: string | null; hakPakai: ActiveHakPakaiForStatus | null }): PetakStatus {
  const { hakPakai } = input;
  // No Hak Pakai on the Petak, or one whose Pembongkaran is recorded (the plot is empty again): the Admin Lokasi's
  // Tidak Tersedia mark shows (ticket 42: marking it after a Pembongkaran must hold).
  if (!hakPakai || (hakPakai.status === "berakhir" && hakPakai.pembongkaranAt)) return input.tidakTersediaReason ? "tidak_tersedia" : "tersedia";
  switch (hakPakai.status) {
    case "aktif":
      return "terisi";
    case "kedaluwarsa":
      return "masa_berlaku_habis";
    case "dibatalkan":
      // Spec (Pemesanan > Saat Duka cancellation): cancelling makes the Hak Pakai
      // Dibatalkan and the Petak Tersedia at once — never buried under it, so no
      // Pembongkaran is needed.
      return "tersedia";
    case "berakhir":
      // A Pengembalian gave the plot back unused, so it is Tersedia at once; any other Berakhir
      // (an ended, unpaid right over a grave) stays Terisi until a Pembongkaran is recorded.
      if (hakPakai.endReason === PENGEMBALIAN_END_REASON) return "tersedia";
      return "terisi";
  }
}

/**
 * A Kavling Keluarga's derived status: it has no manual Tidak Tersedia (spec
 * lists none), and no Perlu Verifikasi of its own — a member Petak's own flag
 * gates it. `totalPetak` / `petakWithPemakaman` count its member Petak.
 */
export function deriveKavlingStatus(input: { hakPakai: ActiveHakPakaiForStatus | null; totalPetak: number; petakWithPemakaman: number }): KavlingStatus {
  const { hakPakai, totalPetak, petakWithPemakaman } = input;
  const released =
    !hakPakai ||
    hakPakai.status === "dibatalkan" ||
    (hakPakai.status === "berakhir" && (hakPakai.pembongkaranAt !== null || hakPakai.endReason === PENGEMBALIAN_END_REASON));
  if (released) return "tersedia";
  return totalPetak > 0 && petakWithPemakaman >= totalPetak ? "penuh" : "terpakai_sebagian";
}
