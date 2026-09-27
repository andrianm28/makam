import "server-only";
import type { LokasiFacility, LokasiMakamCard, LokasiMakamKind } from "@/domain/lokasi";
import { serverRuntime } from "@/server/runtime";

/**
 * The Daftar Lokasi Makam page's own cards, composed from the Lokasi and
 * Tariffs modules' public reads. The page renders these and nothing else.
 *
 * Every price travels **on its card**: the directory mixes two kinds in one
 * list, and a price read by position (a filtered array next to the combined one)
 * silently hands a Lokasi Mitra its neighbour's amount the moment the sort puts
 * a TPU in between.
 */
export interface DaftarLokasiBaris {
  card: LokasiMakamCard;
  /** What the card shows as its price: null until Admin Platform has entered a price for it. */
  mulaiRp: number | null;
  /** The first Kunjungan Verifikasi photo, a short-lived signed URL (a Lokasi Mitra only). */
  foto: string | undefined;
}

export interface DaftarLokasi {
  baris: DaftarLokasiBaris[];
  /** Every city either kind is in, for the city filter. */
  kota: string[];
}

export async function daftarLokasi(query: {
  jenis?: LokasiMakamKind;
  kota?: string;
  fasilitas?: LokasiFacility[];
}): Promise<DaftarLokasi> {
  const { lokasi, tariffs, adapters } = serverRuntime();
  const now = adapters.clock.now();
  const [cards, kota, hargaTpu] = await Promise.all([
    lokasi.publicLokasiMakamList({
      kind: query.jenis,
      city: query.kota,
      facilities: query.fasilitas?.length ? query.fasilitas : undefined,
    }),
    lokasi.publicLokasiMakamCities(),
    // One read: every TPU card shows the same TPU price, so it is never per-card.
    tariffs.tpuPricing(now),
  ]);
  const baris = await Promise.all(
    cards.map(async (card): Promise<DaftarLokasiBaris> => {
      if (card.kind === "tpu") return { card, mulaiRp: hargaTpu.mulaiDari, foto: undefined };
      const [pricing, foto] = await Promise.all([tariffs.lokasiPricing(card.id, now), lokasi.publicVisitPhotoUrls(card.id)]);
      return { card, mulaiRp: pricing.mulaiDari, foto: foto.at(0) };
    }),
  );
  return { baris, kota };
}
