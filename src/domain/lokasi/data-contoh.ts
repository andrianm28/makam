/**
 * The example-data mark on a Lokasi Mitra (ticket 86): a row that stands in for
 * a real cemetery, not one. A catalog an import brought across is example data
 * by definition — the old app's own catalog is entirely example data (research
 * 2026-09-27, §1.5) — and a family must never read a fabricated address as a
 * cemetery that takes the dead. So the mark is on the record itself, every public
 * read leaves a marked Lokasi out, and the publish gate refuses it outright.
 *
 * A reason is required in both directions: an operator says why a row is example
 * data, and says again why it stopped being it, and the Audit Log keeps both.
 */
import type { Actor, WriteRefusal } from "@/domain/identity";
import { writeLokasiMitra, type LokasiDeps, type NotFound } from "./lokasi-mitra";

export interface TandaiDataContohInput {
  dataContoh: boolean;
  /** Required either way: why a row is example data, and why it stopped being it. */
  reason: string | null;
}

export type TandaiDataContohResult =
  | { ok: true }
  | WriteRefusal
  | NotFound
  | { ok: false; reason: "alasan_wajib" }
  /** It already carries the mark being set: nothing changed, so nothing is audited. */
  | { ok: false; reason: "tidak_diperbarui" };

/**
 * Admin Platform marks a Lokasi Mitra as example data, or clears the mark.
 * Audited on that Lokasi Mitra, with the reason.
 */
export async function tandaiDataContoh(
  deps: LokasiDeps,
  by: Actor,
  lokasiId: string,
  input: TandaiDataContohInput,
): Promise<TandaiDataContohResult> {
  const reason = input.reason?.trim() ?? "";
  if (reason === "") return { ok: false, reason: "alasan_wajib" };
  return writeLokasiMitra(deps, by, lokasiId, "lokasi.tandai_data_contoh", (row) => {
    if (row.dataContoh === input.dataContoh) return { ok: false as const, reason: "tidak_diperbarui" as const };
    return {
      values: { dataContoh: input.dataContoh },
      before: { dataContoh: row.dataContoh },
      after: { dataContoh: input.dataContoh },
      reason: reason || null,
    };
  });
}
