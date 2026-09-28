import "server-only";
import { cookies } from "next/headers";
import type { GrupSaatDuka, Pemesanan } from "@/domain/pemesanan";
import type { Lokasi } from "@/domain/lokasi";
import type { Pengurusan } from "@/domain/pengurusan";
import { serverRuntime } from "@/server/runtime";
import { KOTA_PILIHAN } from "./draft";
import { tpuKartuView, type TpuKartuView } from "./tampilan";

/**
 * What "Pilih makam" shows, read once: the Lokasi Mitra list the city filter
 * leaves, the TPU section (only the TPUs taking new plots, at the TPU price),
 * the cities to filter by, the city the list is filtered to, and the Lokasi Mitra
 * the visitor came from. The city is the one in the URL, else the deep-linked
 * Lokasi Mitra's own city, else the one the visitor chose last time; the list is
 * filtered by exactly that city, so the highlighted chip and the cards always
 * agree.
 *
 * The type chip (Semua / Lokasi Mitra / TPU DKI) is a plain URL filter, like the
 * city in the URL: it narrows the combined list and nothing else, so it changes
 * no data and needs no action of its own.
 */
export type JenisPilihan = "semua" | "lokasi_mitra" | "tpu_dki";

export interface LayarPilihMakam {
  grup: GrupSaatDuka[];
  tpu: TpuKartuView[];
  /** Every city with a Terverifikasi Lokasi Mitra, for the filter. */
  semuaKota: string[];
  /** null is "Semua kota", the first-time visitor's choice. */
  kota: string | null;
  asal: { id: string; name: string; city: string } | null;
  /** The chip the list is filtered by; an unrecognised one is "semua". */
  jenis: JenisPilihan;
}

/** The modules this screen reads: the runtime is the page's, a test brings its own. */
type Modul = {
  pemesanan: Pick<Pemesanan, "pilihanSaatDuka">;
  lokasi: Pick<Lokasi, "publicLokasiMitra" | "publicLokasiMitraCities">;
  pengurusan: Pick<Pengurusan, "pilihanSaatDukaTpu">;
};

export async function layarPilihMakam(
  params: { kota: string; lokasiId: string; jenis: string },
  modul: Modul = serverRuntime(),
): Promise<LayarPilihMakam> {
  const [asal, semuaKota, cookiesSeen] = await Promise.all([
    params.lokasiId ? modul.lokasi.publicLokasiMitra(params.lokasiId) : null,
    modul.lokasi.publicLokasiMitraCities(),
    cookies(),
  ]);

  const kota = params.kota || asal?.city || cookiesSeen.get(KOTA_PILIHAN)?.value || null;
  const jenis = jenisOf(params.jenis);
  // Both lists are read and filtered by the same city, and only then narrowed by
  // the chip: a filter that hid a list before it was read would show an empty
  // screen where the list has cards.
  const [grupLokasi, kartuTpu] = await Promise.all([
    jenis === "tpu_dki" ? Promise.resolve([]) : modul.pemesanan.pilihanSaatDuka(kota ? { city: kota } : {}),
    jenis === "lokasi_mitra" ? Promise.resolve([]) : modul.pengurusan.pilihanSaatDukaTpu(kota ? { city: kota } : {}),
  ]);
  return {
    grup: grupLokasi,
    tpu: kartuTpu.map(tpuKartuView),
    semuaKota,
    kota,
    asal: asal ? { id: asal.id, name: asal.name, city: asal.city } : null,
    jenis,
  };
}

/** The chip the URL asks for, or "semua" for anything that is not one of the three. */
function jenisOf(typed: string): JenisPilihan {
  return typed === "lokasi_mitra" || typed === "tpu_dki" ? typed : "semua";
}
