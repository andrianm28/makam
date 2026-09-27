import { cookies } from "next/headers";
import type { GrupSaatDuka, Pemesanan } from "@/domain/pemesanan";
import type { Lokasi } from "@/domain/lokasi";
import { serverRuntime } from "@/server/runtime";
import { KOTA_PILIHAN } from "./draft";

/**
 * What "Pilih makam" shows, read once: the list the city filter leaves, the
 * cities to filter by, the city the list is filtered to, and the Lokasi Mitra
 * the visitor came from. The city is the one in the URL, else the deep-linked
 * Lokasi Mitra's own city, else the one the visitor chose last time; the list is
 * filtered by exactly that city, so the highlighted chip and the cards always
 * agree.
 */
export interface LayarPilihMakam {
  grup: GrupSaatDuka[];
  /** Every city with a Terverifikasi Lokasi Mitra, for the filter. */
  semuaKota: string[];
  /** null is "Semua kota", the first-time visitor's choice. */
  kota: string | null;
  asal: { id: string; name: string; city: string } | null;
}

/** The modules this screen reads: the runtime is the page's, a test brings its own. */
type Modul = {
  pemesanan: Pick<Pemesanan, "pilihanSaatDuka">;
  lokasi: Pick<Lokasi, "publicLokasiMitra" | "publicLokasiMitraCities">;
};

export async function layarPilihMakam(params: { kota: string; lokasiId: string }, modul: Modul = serverRuntime()): Promise<LayarPilihMakam> {
  const [asal, semuaKota, cookiesSeen] = await Promise.all([
    params.lokasiId ? modul.lokasi.publicLokasiMitra(params.lokasiId) : null,
    modul.lokasi.publicLokasiMitraCities(),
    cookies(),
  ]);

  const kota = params.kota || asal?.city || cookiesSeen.get(KOTA_PILIHAN)?.value || null;
  const grup = await modul.pemesanan.pilihanSaatDuka(kota ? { city: kota } : {});
  return { grup, semuaKota, kota, asal: asal ? { id: asal.id, name: asal.name, city: asal.city } : null };
}
