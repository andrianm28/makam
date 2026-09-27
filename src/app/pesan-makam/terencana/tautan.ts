/**
 * The Terencana wizard's own URLs: one screen is one URL, so the browser's back
 * button and a shared link both land on the same step, and a family's picks
 * survive going back and forth. The chosen plots travel as their Nomor Makam
 * (readable, and what a family would read out loud), never as database ids.
 */

import type { PilihanTerencana } from "@/domain/pemesanan";

export type LangkahTerencana = "lokasi" | "petak" | "data" | "terkirim";

export interface TerencanaParams {
  /** Which screen: no `lokasiId` is the Lokasi step. */
  langkah?: LangkahTerencana;
  lokasiId?: string;
  /** The Nomor Makam of each chosen Petak Makam, in the order they were picked. */
  petak?: readonly string[];
  /** The Nomor Kavling of the chosen Kavling Keluarga (one, picked whole). */
  kavling?: string | null;
  /** The Nomor Pemesanan of a placed order, for the confirmation. */
  nomor?: string | null;
  /**
   * Why the family is back on the Denah: the module's own reason key and the plot it
   * is about, so the screen says the same thing "Lanjut" and Kirim would (the reason
   * is read as a word by `pesanPeriksa`, never shown as itself).
   */
  alasan?: string | null;
  petakGagal?: string | null;
  /** The Lokasi step's filters, so a back link keeps them. */
  kota?: string | null;
  harga?: string | null;
  fasilitas?: readonly string[];
}

const base = "/pesan-makam/terencana";

/** The wizard's URL for one screen, keeping only the parameters that screen reads. */
export function terencanaPath(params: TerencanaParams): string {
  const query = new URLSearchParams();
  if (params.langkah && params.langkah !== "lokasi") query.set("langkah", params.langkah);
  if (params.lokasiId) query.set("lokasiId", params.lokasiId);
  if (params.petak?.length) query.set("petak", params.petak.join(","));
  if (params.kavling) query.set("kavling", params.kavling);
  if (params.nomor) query.set("terkirim", params.nomor);
  if (params.alasan) query.set("alasan", params.alasan);
  if (params.petakGagal) query.set("petakGagal", params.petakGagal);
  if (params.kota) query.set("kota", params.kota);
  if (params.harga) query.set("harga", params.harga);
  if (params.fasilitas?.length) query.set("fasilitas", params.fasilitas.join(","));
  const text = query.toString();
  return text ? `${base}?${text}` : base;
}

/** The chosen units as a URL carries them: several Petak Makam, or one Kavling Keluarga. */
export function pilihanDariParams(petak: string | undefined, kavling: string | undefined): PilihanTerencana {
  return {
    petak: (petak ?? "").split(",").map((satu) => satu.trim()).filter(Boolean),
    kavling: kavling?.trim() || null,
  };
}
