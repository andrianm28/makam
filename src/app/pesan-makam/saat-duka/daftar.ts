import { cookies } from "next/headers";
import type { GrupSaatDuka, Pemesanan, RebookPesanan } from "@/domain/pemesanan";
import type { Lokasi } from "@/domain/lokasi";
import { serverRuntime } from "@/server/runtime";
import { KOTA_PILIHAN } from "./draft";

/**
 * What "Pilih makam" shows, read once: the list the city filter leaves, the
 * cities to filter by, the city the list is filtered to, the Lokasi Mitra the
 * visitor came from, and — after a Tolak — the banner, the Lokasi Mitra that is
 * kept out of the list, and the family's own data for "Data & kirim".
 *
 * The city is the one in the URL, else the deep-linked Lokasi Mitra's own city,
 * else the city the declined order came from, else the one the visitor chose last
 * time; the list is filtered by exactly that city, so the highlighted chip and the
 * cards always agree.
 */
export interface LayarPilihMakam {
  grup: GrupSaatDuka[];
  /** Every city with a Terverifikasi Lokasi Mitra, for the filter. */
  semuaKota: string[];
  /** null is "Semua kota", the first-time visitor's choice. */
  kota: string | null;
  asal: { id: string; name: string; city: string } | null;
  /**
   * The declined order this visit comes from, read from `dari` on the link (spec,
   * Public site: "After a Tolak, the Pilih makam list opens with a banner, the
   * rejecting Lokasi removed and the family's data prefilled"; ticket 24). null on
   * an ordinary visit, and null for a `dari` that names no declined order of this
   * family — a link nobody may read is no banner, not an error page.
   */
  pemesanUlang: RebookPesanan | null;
}

/** The modules this screen reads: the runtime is the page's, a test brings its own. */
type Modul = {
  pemesanan: Pick<Pemesanan, "pilihanSaatDuka" | "rebook">;
  lokasi: Pick<Lokasi, "publicLokasiMitra" | "publicLokasiMitraCities">;
};

export async function layarPilihMakam(
  params: { kota: string; lokasiId: string; dari?: string; pemesan?: { accountId: string } | null },
  modul: Modul = serverRuntime(),
): Promise<LayarPilihMakam> {
  const [asal, semuaKota, cookiesSeen] = await Promise.all([
    params.lokasiId ? modul.lokasi.publicLokasiMitra(params.lokasiId) : null,
    modul.lokasi.publicLokasiMitraCities(),
    cookies(),
  ]);

  // The rebook is the family's own read; the page has already established who is
  // asking, so this only asks the module whether that order is theirs to rebook.
  const pemesanUlang = params.dari && params.pemesan ? await modul.pemesanan.rebook(params.dari, params.pemesan) : null;
  const kota = params.kota || asal?.city || pemesanUlang?.kota || cookiesSeen.get(KOTA_PILIHAN)?.value || null;
  // The Lokasi Mitra that refused is left out of the **query**, so the list that
  // comes back cannot contain it and no screen has to remember to hide it.
  const grup = await modul.pemesanan.pilihanSaatDuka({
    ...(kota ? { city: kota } : {}),
    ...(pemesanUlang ? { kecualiLokasiId: pemesanUlang.kecualiLokasiId } : {}),
  });
  return { grup, semuaKota, kota, asal: asal ? { id: asal.id, name: asal.name, city: asal.city } : null, pemesanUlang };
}
