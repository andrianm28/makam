import type { LokasiFacility, LokasiMakamKind } from "@/domain/lokasi";

/**
 * The Daftar Lokasi Makam page's own filter state, exactly as its URL holds
 * it: one kind, one city, any number of facilities. Pure query-string
 * arithmetic for the page's chip links — no business rule, nothing that
 * reaches the database.
 */
export interface LokasiFilters {
  jenis: LokasiMakamKind | undefined;
  kota: string | undefined;
  fasilitas: LokasiFacility[];
}

/** Whether any filter narrows the list (a city, a kind, or a facility). */
export function hasActiveFilter(filters: LokasiFilters): boolean {
  return filters.jenis !== undefined || filters.kota !== undefined || filters.fasilitas.length > 0;
}

/** The shareable link for a set of filters: bare "/lokasi" once none apply. */
export function lokasiHref(filters: LokasiFilters): string {
  const params = new URLSearchParams();
  if (filters.jenis) params.set("jenis", filters.jenis);
  if (filters.kota) params.set("kota", filters.kota);
  for (const facility of filters.fasilitas) params.append("fasilitas", facility);
  const query = params.toString();
  return query ? `/lokasi?${query}` : "/lokasi";
}

/** The chip link for one city: selecting the city already active clears it back to "Semua kota". */
export function kotaHref(filters: LokasiFilters, kota: string | undefined): string {
  return lokasiHref({ ...filters, kota: filters.kota === kota ? undefined : kota });
}

/** The chip link for one kind (Lokasi Mitra / TPU DKI): selecting the one already active clears it. */
export function jenisHref(filters: LokasiFilters, jenis: LokasiMakamKind): string {
  return lokasiHref({ ...filters, jenis: filters.jenis === jenis ? undefined : jenis });
}

/** The chip link for one facility, toggled on or off, keeping every other filter as it is. */
export function fasilitasHref(filters: LokasiFilters, facility: LokasiFacility): string {
  const fasilitas = filters.fasilitas.includes(facility)
    ? filters.fasilitas.filter((one) => one !== facility)
    : [...filters.fasilitas, facility];
  return lokasiHref({ ...filters, fasilitas });
}
