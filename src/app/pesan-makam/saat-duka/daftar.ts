import "server-only";
import { cookies } from "next/headers";
import type { GrupSaatDuka, Pemesanan, RebookPesanan } from "@/domain/pemesanan";
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
 * After a Tolak (spec, Public site: "the Pilih makam list opens with a banner, the
 * rejecting Lokasi removed and the family's data prefilled"; ticket 88) the same
 * read also carries the banner, and the Lokasi Mitra that refused is left out of the
 * **query** for the Lokasi Mitra list, so no screen has to remember to hide it. The
 * TPU section is not touched by it: a TPU is not the Lokasi Mitra that refused, and
 * the TPUs are read with the same city filter as the cards.
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
  /** One photo per Lokasi Mitra on the list (its Kunjungan Verifikasi's first upload), by its id; null when it has none yet. */
  foto: Record<string, string | null>;
  /**
   * The declined order this visit comes from, read from `dari` on the link. null on
   * an ordinary visit, and null for a `dari` that names no declined order of this
   * family: a link nobody may read is no banner, not an error page.
   */
  pemesanUlang: RebookPesanan | null;
  /**
   * The Nomor Pemesanan every URL of this screen carries on (chip, city, Lanjut),
   * so the banner and the family's data outlive a click; null exactly when there is
   * no banner, so a `dari` that means nothing is dropped from the URLs too.
   */
  dari: string | null;
}

/** The modules this screen reads: the runtime is the page's, a test brings its own. */
type Modul = {
  pemesanan: Pick<Pemesanan, "pilihanSaatDuka" | "rebook">;
  lokasi: Pick<Lokasi, "publicLokasiMitra" | "publicLokasiMitraCities" | "publicVisitPhotoUrls">;
  pengurusan: Pick<Pengurusan, "pilihanSaatDukaTpu">;
};

export async function layarPilihMakam(
  params: { kota: string; lokasiId: string; jenis: string; dari?: string; pemesan?: { accountId: string } | null },
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
  const jenis = jenisOf(params.jenis);
  // Both lists are read and filtered by the same city, and only then narrowed by
  // the chip: a filter that hid a list before it was read would show an empty
  // screen where the list has cards.
  const [grupLokasi, kartuTpu] = await Promise.all([
    jenis === "tpu_dki" ? Promise.resolve([]) : modul.pemesanan.pilihanSaatDuka({
          ...(kota ? { city: kota } : {}),
          ...(pemesanUlang ? { kecualiLokasiId: pemesanUlang.kecualiLokasiId } : {}),
        }),
    jenis === "lokasi_mitra" ? Promise.resolve([]) : modul.pengurusan.pilihanSaatDukaTpu(kota ? { city: kota } : {}),
  ]);
  // A photo thumbnail per card (spec, the prototype's "Pilih makam"), from each
  // Lokasi Mitra's own Kunjungan Verifikasi: every Terverifikasi Lokasi Mitra
  // has one (it is a publish gate), but a card never invents one it has none for.
  const foto = Object.fromEntries(
    await Promise.all(
      grupLokasi.map(async (grup): Promise<[string, string | null]> => {
        const urls = await modul.lokasi.publicVisitPhotoUrls(grup.lokasi.id);
        return [grup.lokasi.id, urls[0] ?? null];
      }),
    ),
  );
  return {
    grup: grupLokasi,
    tpu: kartuTpu.map(tpuKartuView),
    semuaKota,
    kota,
    asal: asal ? { id: asal.id, name: asal.name, city: asal.city } : null,
    jenis,
    foto,
    pemesanUlang,
    dari: pemesanUlang?.nomor ?? null,
  };
}

/** The chip the URL asks for, or "semua" for anything that is not one of the three. */
function jenisOf(typed: string): JenisPilihan {
  return typed === "lokasi_mitra" || typed === "tpu_dki" ? typed : "semua";
}
