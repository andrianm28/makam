/**
 * Internal to the Payouts module: who a Pencairan is paid to. A Lokasi Mitra (a
 * partnership, identified by its record) or a Mitra Jasa (a person, identified
 * by the Akun that holds the role) — never anyone else, and never the same
 * money twice: the recipient is copied onto the item, onto the run row and onto
 * the Bukti Pencairan, so each of them reads the same answer without a lookup.
 */
import { z } from "zod";

export const penerimaSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lokasi_mitra"), lokasiId: z.string().trim().min(1).max(64), nama: z.string().trim().min(1).max(300) }),
  z.object({
    kind: z.literal("mitra_jasa"),
    akunId: z.string().trim().min(1).max(64),
    nama: z.string().trim().min(1).max(300),
    /** The Lokasi Mitra the order is at, when there is one; a TPU job has none. */
    lokasiId: z.string().trim().min(1).max(64).nullable(),
  }),
]);

export type Penerima = z.infer<typeof penerimaSchema>;

/** The key a run groups by: one recipient is one row, however many items it has. */
export function penerimaKey(penerima: Pick<Penerima, "kind"> & { lokasiId?: string | null; akunId?: string | null }): string {
  return penerima.kind === "lokasi_mitra" ? `lokasi_mitra:${penerima.lokasiId}` : `mitra_jasa:${penerima.akunId}`;
}

/** What a row and a Bukti show of a recipient, in the words CONTEXT.md uses. */
export function penerimaText(penerima: Penerima): string {
  return penerima.kind === "lokasi_mitra" ? `Lokasi Mitra ${penerima.nama}` : `Mitra Jasa ${penerima.nama}`;
}
