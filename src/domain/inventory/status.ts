/**
 * Pure derivation of Petak Makam and Kavling Keluarga status (spec, Inventory
 * > Denah): never stored, always computed from the Petak/Kavling row and its
 * current Hak Pakai (if any). Kept free of the database so every case is a
 * plain unit test.
 */
import type { inventoryHakPakaiStatuses } from "./schema";

export type HakPakaiStatus = (typeof inventoryHakPakaiStatuses)[number];

export type PetakStatus = "tersedia" | "dipesan" | "terisi" | "masa_berlaku_habis" | "tidak_tersedia";
export type KavlingStatus = "tersedia" | "dipesan" | "terpakai_sebagian" | "penuh";

/**
 * The current Hak Pakai of a Petak or Kavling, as status derivation needs it.
 * A Berakhir Hak Pakai still holds its plot: the caller passes `null` only
 * once the Pembongkaran that releases it is recorded, so the status here
 * carries no demolition flag (spec: a plot stays Terisi after its Hak Pakai
 * ends until a Pembongkaran is recorded).
 */
export interface ActiveHakPakaiForStatus {
  status: HakPakaiStatus;
}

/**
 * A Petak Makam's derived status. `tidakTersediaReason` is read only when
 * `hakPakai` is null (spec: Tidak Tersedia is manual and only without an
 * active Hak Pakai); Perlu Verifikasi is a separate flag on top of this
 * (an empty Petak can be nominally Tersedia yet still not assignable).
 */
export function derivePetakStatus(input: { tidakTersediaReason: string | null; hakPakai: ActiveHakPakaiForStatus | null }): PetakStatus {
  const { hakPakai } = input;
  if (!hakPakai) return input.tidakTersediaReason ? "tidak_tersedia" : "tersedia";
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
      // A Berakhir Hak Pakai is gone from `hakPakai` once the Petak's own
      // Pembongkaran is recorded, so one that is still here holds the grave.
      return "terisi";
  }
}

/**
 * A Kavling Keluarga's derived status: it has no manual Tidak Tersedia (spec
 * lists none), and no Perlu Verifikasi of its own — a member Petak's own flag
 * gates it. `totalPetak` / `petakWithPemakaman` / `petakDibongkar` count its
 * member Petak. A Berakhir Kavling Hak Pakai releases the whole Kavling only
 * once every member Petak's own Pembongkaran is recorded (spec: one plot per
 * Pembongkaran), so demolishing one member never frees the others.
 */
export function deriveKavlingStatus(input: {
  hakPakai: ActiveHakPakaiForStatus | null;
  totalPetak: number;
  petakWithPemakaman: number;
  petakDibongkar: number;
}): KavlingStatus {
  const { hakPakai, totalPetak, petakWithPemakaman, petakDibongkar } = input;
  const released =
    !hakPakai || hakPakai.status === "dibatalkan" || (hakPakai.status === "berakhir" && totalPetak > 0 && petakDibongkar >= totalPetak);
  if (released) return "tersedia";
  return totalPetak > 0 && petakWithPemakaman >= totalPetak ? "penuh" : "terpakai_sebagian";
}
