import { z } from "zod";

/**
 * The closed list of reasons a Saat Duka order can be declined with (spec,
 * Pemesanan > Saat Duka: "Tolak with a fixed reason list"; story 118).
 *
 * This file is the one place that list exists, and both sides read it from here:
 * the domain accepts a reason only if it is a key of this list, and the screen
 * offers exactly these words as the choices of its select. A closed list is the
 * whole point — a Lokasi answers honestly out of the reasons families can be
 * told — so nothing may add a reason anywhere else, least of all as free text.
 *
 * Nothing here imports the module's schema or reaches the database, so a
 * "use client" screen may take it directly (AGENTS.md: a value from a domain
 * module's own file is safe when that file stands alone, the way
 * `./skema-terencana.ts` is).
 */
export const alasanTolakKeys = [
  /** The plot of the chosen Jenis Makam is gone, so there is nothing to assign. */
  "petak_tidak_tersedia",
  /** That Blok or that whole Lokasi Mitra is full for now. */
  "kapasitas_penuh",
  /** The burial the family planned cannot be taken on that day. */
  "tanggal_tidak_bisa",
  /** The Lokasi cannot take the order with the papers it has (or has not) got. */
  "dokumen_belum_lengkap",
  /** The grave the family asked for is outside the area this Lokasi Mitra serves. */
  "di_luar_wilayah",
  /** The Lokasi and the family have not agreed the price. */
  "harga_belum_disepakati",
  /**
   * The Pemesan declined the alternative the Lokasi offered (story 31: declining
   * an alternative *is* a Tolak). It is on the same list as the Lokasi's own
   * reasons, so a Tolak reads the same way to the family whoever made it and no
   * second status is invented for it.
   */
  "alternatif_ditolak",
] as const;
export type AlasanTolak = (typeof alasanTolakKeys)[number];

/** The reason as the family reads it, in the wording of the list; the only wording any screen may show. */
export const ALASAN_TOLAK: Readonly<Record<AlasanTolak, string>> = {
  petak_tidak_tersedia: "Petak untuk jenis makam ini sudah tidak tersedia",
  kapasitas_penuh: "Kapasitas blok ini sudah penuh",
  tanggal_tidak_bisa: "Belum bisa menerima pemakaman pada tanggal itu",
  dokumen_belum_lengkap: "Dokumen yang dibutuhkan belum lengkap",
  di_luar_wilayah: "Di luar wilayah pelayanan Lokasi Mitra ini",
  harga_belum_disepakati: "Harga belum disepakati dengan keluarga",
  alternatif_ditolak: "Keluarga menolak alternatif yang ditawarkan",
};

/** The boundary a Tolak form is validated with: a reason off this list, or none, never passes. */
export const alasanTolakSchema = z.enum(alasanTolakKeys);

/** Whether a stored value is still a reason of the list (a key of an older release is not silently shown). */
export function alasanTolakOf(value: string | null | undefined): AlasanTolak | null {
  return alasanTolakKeys.includes(value as AlasanTolak) ? (value as AlasanTolak) : null;
}

/**
 * The reason an order ended with, worded for whoever reads it: a Tolak's comes
 * off the list above, a cancellation's is the family's own words. A row carrying
 * neither says nothing, rather than a reason nobody gave.
 */
export function alasanOrder(alasanTolak: string | null | undefined, alasan: string | null | undefined): string | null {
  const kunci = alasanTolakOf(alasanTolak);
  if (kunci) return ALASAN_TOLAK[kunci];
  const bebas = alasan?.trim();
  return bebas ? bebas : null;
}
