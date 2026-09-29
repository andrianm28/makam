import { z } from "zod";

/**
 * The closed list of reasons a Saat Duka order can be declined with (spec,
 * Pemesanan > Saat Duka: "Tolak with a fixed reason list"; story 118).
 *
 * This file is the one place that list exists. It is a closed list — a Lokasi
 * answers honestly out of the reasons families can be told, and nothing may add
 * a reason anywhere else, least of all as free text — but it is **two lists, not
 * one**, because the reasons belong to two different people:
 *
 * - `alasanTolakLokasiKeys` is what the **Admin Lokasi** may pick. Every one of
 *   them is a statement about that Lokasi's own capacity, calendar, papers,
 *   service area or price — something only the Lokasi knows and only the Lokasi
 *   can have found out.
 * - `alasanTolakKeluargaKeys` is what **the family** can produce, and it is the
 *   single answer to an alternative the Lokasi offered. A Lokasi can never
 *   record it: "Keluarga menolak alternatif yang ditawarkan" on an order that never
 *   offered one is a false statement, written into a message a grieving family
 *   reads and into an Entri Audit that cannot be edited afterwards.
 *
 * The union is still one closed list (`alasanTolakKeys` / `AlasanTolak`),
 * because the column, the wording the family reads and `alasanOrder` all read
 * one thing; **the split is on who may choose**, which is what was missing. The
 * staff boundary is `alasanTolakLokasiSchema` alone, so a reason that never
 * happened is refused at the door rather than hidden behind a disabled option.
 *
 * Nothing here imports the module's schema or reaches the database, so a
 * "use client" screen may take it directly (AGENTS.md: a value from a domain
 * module's own file is safe when that file stands alone, the way
 * `./skema-terencana.ts` is).
 */
export const alasanTolakLokasiKeys = [
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
] as const;
/** A reason the Admin Lokasi chooses for itself; the only ones its form may send. */
export type AlasanTolakLokasi = (typeof alasanTolakLokasiKeys)[number];

/**
 * The reasons a family can produce, and the only answer `tolakAlternatif` gives.
 * A closed list of its own, even while it holds one reason today, so the day it
 * holds a second one there is already a place for it that no Lokasi can reach.
 */
export const alasanTolakKeluargaKeys = [
  /**
   * The Pemesan declined the alternative the Lokasi offered (story 31: declining
   * an alternative *is* a Tolak). It is on the same closed list as the Lokasi's
   * own reasons, so a Tolak reads the same way to the family whoever made it and
   * no second status is invented for it — but the Lokasi cannot record it.
   */
  "alternatif_ditolak",
] as const;
/** A reason the family gives, which a Lokasi can never choose. */
export type AlasanTolakKeluarga = (typeof alasanTolakKeluargaKeys)[number];

/** Every reason an order can end as Ditolak with, whichever side produced it. */
export type AlasanTolak = AlasanTolakLokasi | AlasanTolakKeluarga;
export const alasanTolakKeys: readonly AlasanTolak[] = [...alasanTolakLokasiKeys, ...alasanTolakKeluargaKeys];

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

/**
 * The boundary a Tolak form is validated with: a reason off the Lokasi's own
 * list, or none, never passes — and neither does a reason only the family can
 * produce, however it was typed.
 */
export const alasanTolakLokasiSchema = z.enum(alasanTolakLokasiKeys);

/**
 * The Lokasi's reasons that can apply to a Pemesanan Terencana: a subset of the same
 * closed list, never a reason of its own (ticket 37). A burial day and a service area
 * are about a death that has happened, and a plot booked in advance has neither, so
 * `tanggal_tidak_bisa` and `di_luar_wilayah` are not offered for it.
 */
export const alasanTolakTerencanaKeys = ["petak_tidak_tersedia", "kapasitas_penuh", "dokumen_belum_lengkap", "harga_belum_disepakati"] as const satisfies readonly AlasanTolakLokasi[];
export type AlasanTolakTerencana = (typeof alasanTolakTerencanaKeys)[number];
export const alasanTolakTerencanaSchema = z.enum(alasanTolakTerencanaKeys);

/** Whether a stored value is still a reason of the list (a key of an older release is not silently shown). */
export function alasanTolakOf(value: string | null | undefined): AlasanTolak | null {
  return (alasanTolakKeys as readonly string[]).includes(value ?? "") ? (value as AlasanTolak) : null;
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
